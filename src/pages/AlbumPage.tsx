import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Ticket, Coins, Crown, Package } from 'lucide-react';
import {
  supabase,
  CARD_TYPE_BORDER,
  CARD_TYPE_LABELS,
  type Card,
  type CardPack,
  type UserCard,
} from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { PackOpening, type RevealCard } from '@/components/album/PackOpening';
import { GuestBanner } from '@/components/GuestBanner';
import { GridTile } from '@/components/showcase/GridTile';
import { FEED_AD_INTERVAL, interleaveFeedAds, resolveUserPlan, useGridColumns } from '@/lib/showcase';
import { addPendingCard, getPendingCards, getPendingDantes } from '@/lib/pendingRewards';

export function AlbumPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [cards, setCards] = useState<Card[]>([]);
  const [owned, setOwned] = useState<Map<string, number>>(new Map());
  const [packs, setPacks] = useState<CardPack[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ name: string; cover?: string | null; cards: RevealCard[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [detail, setDetail] = useState<Card | null>(null);

  const load = useCallback(async () => {
    const [{ data: cardData }, { data: ownedData }, { data: packData }] = await Promise.all([
      supabase.from('cards').select('*').order('number', { ascending: true }),
      user
        ? supabase.from('user_cards').select('card_id,quantity').eq('user_id', user.id)
        : Promise.resolve({ data: null as UserCard[] | null, error: null }),
      supabase.from('card_packs').select('*').eq('is_active', true).eq('is_for_sale', true).order('price_dantes'),
    ]);
    setPacks((packData as CardPack[]) ?? []);
    setCards((cardData as Card[]) ?? []);
    setOwned(new Map(((ownedData as UserCard[]) ?? []).map((u) => [u.card_id, u.quantity ?? 1])));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const total = cards.length;
  const unlocked = cards.filter((c) => owned.has(c.id)).length;
  const pct = total ? Math.round((unlocked / total) * 100) : 0;
  const cols = useGridColumns({ base: 2, sm: 3, md: 4, lg: 5 });
  const feed = interleaveFeedAds(cards, cols, FEED_AD_INTERVAL[resolveUserPlan(profile)]);
  const displayPoints = user ? (profile?.points ?? 0) : getPendingDantes();

  const showReveal = async (name: string, ids: string[], cover?: string | null) => {
    const { data } = await supabase.from('cards').select('*').in('id', ids);
    const byId = new Map(((data as Card[]) ?? []).map((c) => [c.id, c]));
    const counts = new Map(owned);
    const list: RevealCard[] = [];
    for (const id of ids) {
      const c = byId.get(id); if (!c) continue;
      const n = (counts.get(id) ?? 0) + 1; counts.set(id, n);
      list.push({ ...c, badge: n === 1 ? 'nova' : n });
    }
    setReveal({ name, cover, cards: list });
    await load();
    await refreshProfile();
  };

  const buyPack = async (pack: CardPack) => {
    if (!user) return toast('Faça login para comprar packs.', 'info');
    if (!confirm(`Comprar "${pack.name}" por ${pack.price_dantes} Dantes?`)) return;
    setOpening(pack.id);
    const { data, error } = await supabase.rpc('open_card_pack', { p_pack_id: pack.id, p_code: null });
    setOpening(null);
    const res = data as { ok: boolean; error?: string; cards?: string[] } | null;
    if (error || !res?.ok) return toast(res?.error || error?.message || 'Erro ao abrir pack.', 'error');
    await showReveal(pack.name, res.cards ?? [], pack.cover_url);
  };

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    if (!user) {
      addPendingCard(code);
      toast('Carta salva! Faça login para confirmar no seu álbum.', 'info');
      setCode('');
      return;
    }

    setRedeeming(true);
    const packRes = await supabase.rpc('open_card_pack', { p_pack_id: null, p_code: code });
    const pr = packRes.data as { ok: boolean; error?: string; pack_name?: string; cards?: string[] } | null;
    if (!packRes.error && pr && pr.error !== 'not_pack') {
      setRedeeming(false);
      if (!pr.ok) return toast(pr.error || 'Código inválido.', 'error');
      setCode('');
      await showReveal(pr.pack_name ?? 'Pack', pr.cards ?? []);
      return;
    }
    const { data, error } = await supabase.rpc('redeem_card_code', { p_code: code });
    setRedeeming(false);
    if (error) {
      toast(error.message || 'Erro ao resgatar código.', 'error');
      return;
    }
    const res = data as { ok: boolean; error?: string; card_name?: string; points?: number };
    if (!res.ok) {
      toast(res.error || 'Código inválido.', 'error');
      return;
    }
    toast(`Carta "${res.card_name}" desbloqueada! +${res.points} Dantes`, 'success');
    setCode('');
    await load();
    await refreshProfile();
  };

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-12 sm:px-6">
      {!user && <GuestBanner />}
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-grape-200/80">
          <Sparkles size={14} className="text-rose-400" /> Coleção
        </div>
        <h1 className="font-display text-4xl font-semibold text-grape-50 sm:text-5xl">
          Álbum de Cartas
        </h1>
      </div>

      {/* Progress + points + redeem */}
      <div className="card mb-8 space-y-5 p-6">
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-grape-50">Progresso da coleção</span>
            <span className="text-grape-200/70">
              {unlocked}/{total} cartas · {pct}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-ink-700">
            <div
              className="h-full rounded-full bg-progress-grad transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 rounded-xl border border-gold-400/30 bg-gold-400/10 px-4 py-3">
            <Coins size={22} className="text-gold-400" />
            <div>
              <p className="text-xs uppercase tracking-wider text-gold-400/70">Saldo de Dantes</p>
              <p className="font-display text-xl font-semibold text-gold-400">{displayPoints}</p>
            </div>
          </div>

          <form onSubmit={redeem} className="flex flex-1 gap-2 sm:max-w-md">
            <div className="relative flex-1">
              <Ticket size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-grape-300/60" />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="input pl-10"
                placeholder="Código da carta ou do pack"
              />
            </div>
            <button type="submit" disabled={redeeming} className="btn-primary">
              {redeeming ? '...' : 'Resgatar'}
            </button>
          </form>
        </div>
      </div>

      {packs.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-grape-50">
            <Package size={20} className="text-rose-400" /> Packs
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packs.map((p) => (
              <div key={p.id} className="card flex items-center gap-4 p-4">
                {p.cover_url ? (
                  <img src={p.cover_url} alt={p.name} className="h-20 w-16 flex-shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-20 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-grape-600/40 to-rose-600/40">
                    <Package size={24} className="text-grape-100" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-grape-50">{p.name}</p>
                  <p className="text-xs text-grape-200/60">
                    {p.card_count} cartas{p.guaranteed_card_type ? ` · 1 ${(CARD_TYPE_LABELS as Record<string, string>)[p.guaranteed_card_type] ?? p.guaranteed_card_type} garantida` : ''}
                  </p>
                  {p.description && <p className="truncate text-xs text-grape-200/50">{p.description}</p>}
                  <button onClick={() => buyPack(p)} disabled={opening === p.id} className="btn-primary mt-2 px-3 py-1.5 text-xs">
                    {opening === p.id ? 'Abrindo...' : `${p.price_dantes} Dantes`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-grape-400 border-t-transparent" />
        </div>
      ) : cards.length === 0 ? (
        <div className="card p-10 text-center text-grape-200/60">
          Nenhuma carta cadastrada ainda.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {feed.map((entry) => {
            if (entry.kind === 'ad')
              return <GridTile key={entry.key} sessionKey={`grade-cartas#${entry.slot}`} />;
            const card = entry.item;
            const qty = owned.get(card.id) ?? 0;
            if (!qty) return <CardBack key={card.id} number={card.number} />;
            return (
              <div
                key={card.id}
                className={`group relative overflow-hidden rounded-2xl p-[3px] transition ${CARD_TYPE_BORDER[card.type]}`}
              >
                <button
                  onClick={() => setDetail(card)}
                  className="relative block h-full w-full overflow-hidden rounded-[14px] bg-ink-800"
                >
                  {card.photo_url ? (
                    <img src={card.photo_url} alt={card.name} className="aspect-[3/4] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[3/4] w-full items-center justify-center bg-gradient-to-br from-grape-600/30 to-rose-600/30">
                      <Sparkles size={28} className="text-grape-200/50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-transparent to-transparent" />
                  <div className="absolute left-2 top-2">
                    <span className="chip bg-ink-950/70 text-[10px] text-grape-100">#{card.number}</span>
                  </div>
                  {qty > 1 && (
                    <div className="absolute right-2 top-2">
                      <span className="chip bg-rose-500/90 text-[10px] font-bold text-white">x{qty}</span>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-center">
                    <p className="truncate font-display text-sm font-semibold text-white drop-shadow">{card.name}</p>
                    <p className="text-[10px] uppercase tracking-wider text-grape-200/70">
                      {CARD_TYPE_LABELS[card.type]} · {'⭐'.repeat(card.difficulty_stars ?? 1)}
                    </p>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} maxWidth="max-w-md">
        {detail && (
          <div>
            {detail.photo_url && (
              <img
                src={detail.photo_url}
                alt={detail.name}
                className="mb-4 aspect-[3/4] w-full rounded-xl object-cover"
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-semibold text-grape-50">{detail.name}</h2>
              <span className="chip bg-white/10 text-grape-100">#{detail.number}</span>
            </div>
            <p className="mt-1 text-sm text-rose-300">
              {CARD_TYPE_LABELS[detail.type]} · {detail.points} Dantes
            </p>
            {detail.description && (
              <p className="mt-3 text-sm text-grape-100/80">{detail.description}</p>
            )}
          </div>
        )}
      </Modal>

      {reveal && <PackOpening name={reveal.name} cover={reveal.cover} cards={reveal.cards} onClose={() => setReveal(null)} />}
    </div>
  );
}

function CardBack({ number }: { number: number }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-grape-600 to-rose-600 p-[3px]">
      <div className="relative flex aspect-[3/4] w-full flex-col items-center justify-center rounded-[14px] bg-ink-900">
        <div className="absolute inset-3 rounded-xl border border-rose-400/20" />
        <span className="absolute left-2 top-2 chip bg-ink-950/70 text-[10px] text-grape-100">#{number}</span>
        <Crown size={40} className="text-rose-400 drop-shadow-[0_0_10px_currentColor]" />
        <p className="mt-2 font-display text-xs uppercase tracking-[0.3em] text-grape-200/60">Dante</p>
      </div>
    </div>
  );
}
