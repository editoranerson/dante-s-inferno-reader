import { useEffect, useState } from 'react';
import { X, ShieldCheck, Lock, Check, Coins, Image as ImageIcon, Droplet, Coffee, Minus, Plus } from 'lucide-react';
import { waterFor, formatMl, ML_PER_MESSAGE } from '@/lib/water';
import danteAvatar from '@/assets/dante-avatar.webp';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { fetchWallpapers, fetchOwnedWallpapers, getSelectedWallpaper, setSelectedWallpaper, type ChatWallpaper } from '@/lib/wallpapers';
import {
  type CoffeeDonationEvent,
  type CoffeeBatchResult,
  MAX_COFFEE_PER_ITEM,
  cartTotal,
  clampCoffeeQuantity,
  receiptFromBatch,
  type DanteCoffeeItem,
} from '@/lib/danteCoffee';
import { DanteCoffeeIcon } from '@/components/DanteCoffeeIcon';

interface DanteProfileModalProps {
  onClose: () => void;
  onCoffeeDonated?: (event: CoffeeDonationEvent) => void;
}

export function DanteProfileModal({ onClose, onCoffeeDonated }: DanteProfileModalProps) {
  const { user, profile, isAdmin, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<ChatWallpaper[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState<'wallpaper' | 'water' | 'coffee'>('wallpaper');
  const [msgCount, setMsgCount] = useState<number | null>(null);
  const [coffeeItems, setCoffeeItems] = useState<DanteCoffeeItem[]>([]);
  const [coffeeLoading, setCoffeeLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});

  useEffect(() => {
    setSelected(getSelectedWallpaper());
    void fetchWallpapers().then(setItems);
    void supabase
      .from('dante_coffee_items')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (error) toast('Não foi possível carregar o cardápio do Dante.', 'error');
        setCoffeeItems((data as DanteCoffeeItem[]) ?? []);
        setCoffeeLoading(false);
      });
    if (user) {
      void fetchOwnedWallpapers().then(setOwned);
      void supabase.from('chat_messages').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('role', 'user')
        .then(({ count }) => setMsgCount(count ?? 0));
    }
  }, [user, toast]);

  const unlocked = (w: ChatWallpaper) => w.access !== 'paid' || isAdmin || owned.has(w.id);
  const choose = (url: string) => { setSelectedWallpaper(url); setSelected(url); };

  const buy = async (w: ChatWallpaper) => {
    if (!user) return toast('Entre na sua conta para comprar.', 'error');
    if (!confirm(`Comprar "${w.name || 'papel de parede'}" por ${w.price_dantes} Dantes?`)) return;
    setBusy(w.id);
    const { data, error } = await supabase.rpc('buy_wallpaper', { p_id: w.id });
    setBusy('');
    const res = data as { ok: boolean; error?: string } | null;
    if (error || !res?.ok) return toast(res?.error || 'Não foi possível comprar.', 'error');
    setOwned(new Set([...owned, w.id]));
    await refreshProfile();
    choose(w.image_url);
    toast('Comprado e aplicado!', 'success');
  };

  const total = cartTotal(coffeeItems, cart);
  const changeQty = (id: string, delta: number) =>
    setCart((prev) => ({ ...prev, [id]: clampCoffeeQuantity((prev[id] ?? 0) + delta) }));

  const donate = async () => {
    if (!user) return toast('Entre na sua conta para doar um café.', 'error');
    const picked = coffeeItems
      .map((item) => ({ item_id: item.id, quantity: clampCoffeeQuantity(cart[item.id] ?? 0) }))
      .filter((p) => p.quantity > 0);
    if (picked.length === 0) return;
    if ((profile?.points ?? 0) < total) return toast('Dantes insuficientes para esses cafés.', 'error');
    setBusy('cart');
    const { data, error } = await supabase.rpc('donate_dante_coffee_batch' as never, { p_items: picked } as never);
    const result = data as CoffeeBatchResult | null;
    if (error || !result?.success) {
      setBusy('');
      return toast(result?.error || error?.message || 'A cafeteira recusou o pedido. Tente novamente.', 'error');
    }
    await refreshProfile();
    setBusy('');
    setCart({});
    onCoffeeDonated?.({ receipt: receiptFromBatch({
      ...result,
      total_price: result.total_price ?? result.total_spent ?? total,
      items_summary: result.items_summary ?? picked.map((entry) => {
        const item = coffeeItems.find((coffee) => coffee.id === entry.item_id);
        return {
          name: item?.name ?? 'Café',
          icon: item?.icon ?? 'coffee',
          quantity: entry.quantity,
          total_price: (item?.price_dantes ?? 0) * entry.quantity,
        };
      }),
    }) });
    toast('Café entregue ao Dante!', 'success');
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-ink-900/98 animate-fade-in">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="font-display text-sm font-semibold text-grape-50">Perfil do Dante</span>
        <button onClick={onClose} className="rounded-full p-2 text-grape-200/70 hover:bg-white/10" aria-label="Fechar perfil"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="flex flex-col items-center text-center">
          <div className="relative h-24 w-24 rounded-full p-[3px]">
            <span className="dante-avatar-ring absolute inset-0 rounded-full" aria-hidden="true" />
            <img src={danteAvatar} alt="Dante" className="relative h-full w-full rounded-full object-cover" />
          </div>
          <h2 className="mt-3 font-dante text-3xl font-semibold text-grape-50">Dante</h2>
          <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-fuchsia-400/30 bg-gradient-to-r from-fuchsia-500/15 to-grape-500/15 px-3 py-1.5 text-xs font-semibold text-fuchsia-100">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-fuchsia-500 to-grape-500"><ShieldCheck size={12} /></span>
            Verificação extremamente duvidosa
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2">
          {([
            ['wallpaper', ImageIcon, 'Papel de parede'],
            ['water', Droplet, 'Gasto de água'],
            ['coffee', Coffee, 'Cafés'],
          ] as const).map(([id, Icon, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-semibold transition ${tab === id ? 'border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-100' : 'border-white/10 bg-white/5 text-grape-200/70 hover:bg-white/10'}`}>
              <Icon size={18} />{label}
            </button>
          ))}
        </div>

        {tab === 'water' && <WaterPanel loggedIn={!!user} count={msgCount} />}

        {tab === 'coffee' && (
          <div className="mt-5 space-y-4">
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-grape-50">Cardápio do Dante</h3>
                </div>
                <span className="flex items-center gap-1 whitespace-nowrap text-xs text-gold-400"><Coins size={12} /> {profile?.points ?? 0}</span>
              </div>
              {coffeeLoading ? (
                <p className="py-5 text-center text-xs text-grape-200/50">Esquentando a água...</p>
              ) : coffeeItems.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-xs text-grape-200/60">A cafeteira está vazia. O admin ainda não cadastrou cafés.</p>
              ) : (
                <div className="space-y-2">
                  {coffeeItems.map((item) => {
                    const qty = cart[item.id] ?? 0;
                    return (
                    <article key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-400/10 text-gold-400"><DanteCoffeeIcon icon={item.icon} /></div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-grape-50">{item.name}</h4>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-grape-200/50">{item.description}</p>
                          <p className="mt-1 text-xs font-medium text-gold-400">{item.price_dantes} Dantes</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => changeQty(item.id, -1)}
                          disabled={qty <= 0 || busy === 'cart'}
                          aria-label={`Diminuir ${item.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-grape-50 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/5 disabled:text-grape-200/25"
                        ><Minus size={14} /></button>
                        <span className="w-6 text-center font-dante text-base font-semibold text-grape-50" aria-live="polite">{qty}</span>
                        <button
                          type="button"
                          onClick={() => changeQty(item.id, 1)}
                          disabled={qty >= MAX_COFFEE_PER_ITEM || busy === 'cart'}
                          aria-label={`Aumentar ${item.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-gold-400/40 text-gold-400 transition hover:bg-gold-400/10 disabled:cursor-not-allowed disabled:border-white/5 disabled:text-grape-200/25"
                        ><Plus size={14} /></button>
                      </div>
                    </article>
                    );
                  })}
                  <button
                    onClick={donate}
                    disabled={busy === 'cart' || total <= 0 || (profile?.points ?? 0) < total}
                    className="btn-primary sticky bottom-0 mt-2 w-full py-2.5 text-sm"
                  >
                    <Coffee size={15} />
                    {busy === 'cart' ? 'Preparando...' : total <= 0 ? 'Escolha seus cafés' : (profile?.points ?? 0) < total ? `Faltam Dantes (${total})` : `Doar por ${total} Dantes`}
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'wallpaper' && <>
        <div className="mt-5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-grape-50">Papel de parede do chat</h3>
          {profile && <span className="flex items-center gap-1 text-xs text-grape-200/70"><Coins size={12} className="text-gold-400" />{profile.points} Dantes</span>}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button onClick={() => choose('')} className={`relative aspect-[9/16] rounded-xl border bg-ink-800 text-[11px] text-grape-200/70 ${!selected ? 'border-fuchsia-400' : 'border-white/10'}`}>
            Padrão {!selected && <Check size={14} className="absolute right-1 top-1 text-fuchsia-300" />}
          </button>
          {items.map((w) => {
            const ok = unlocked(w);
            const active = selected === w.image_url;
            return (
              <button key={w.id} disabled={busy === w.id} onClick={() => (ok ? choose(w.image_url) : buy(w))}
                className={`relative aspect-[9/16] overflow-hidden rounded-xl border ${active ? 'border-fuchsia-400' : 'border-white/10'}`} title={w.name}>
                <img src={w.image_url} alt={w.name} className={`h-full w-full object-cover ${ok ? '' : 'blur-[2px] brightness-50'}`} loading="lazy" />
                {active && <Check size={14} className="absolute right-1 top-1 rounded-full bg-ink-950/70 text-fuchsia-300" />}
                {w.access === 'admin' && <span className="absolute left-1 top-1 rounded bg-ink-950/70 px-1 text-[9px] text-gold-300">ADMIN</span>}
                {!ok && (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-grape-50">
                    <Lock size={16} />{w.price_dantes} Dantes
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {items.length === 0 && <p className="mt-3 text-xs text-grape-200/50">Nenhum papel de parede disponível ainda.</p>}
        </>}
      </div>
    </div>
  );
}

function WaterPanel({ loggedIn, count }: { loggedIn: boolean; count: number | null }) {
  if (!loggedIn) return <p className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-grape-200/70">Entre na sua conta para ver quanta água suas perguntas já evaporaram. Anônimo, suas gotas somem na nuvem.</p>;
  if (count === null) return <p className="mt-5 text-center text-xs text-grape-200/50">Medindo o hidrômetro...</p>;
  const w = waterFor(count);
  return (
    <div className="mt-5 rounded-2xl border border-sky-400/20 bg-sky-500/5 p-5 text-center">
      <div className="text-6xl transition-transform" style={{ transform: `scale(${0.85 + w.progress * 0.3})` }}>{w.level.emoji}</div>
      <p className="mt-2 font-display text-3xl font-semibold text-grape-50">{formatMl(w.ml)}</p>
      <p className="text-xs text-grape-200/70">{w.level.label} · {count} {count === 1 ? 'mensagem' : 'mensagens'}</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-300" style={{ width: `${Math.round(w.progress * 100)}%` }} />
      </div>
      {w.next && <p className="mt-2 text-[11px] text-grape-200/60">Faltam {w.toNext} mensagens para {w.next.label.toLowerCase()} {w.next.emoji}</p>}
      <p className="mt-4 text-sm italic text-fuchsia-100">“{w.level.quip}”</p>
      <p className="mt-4 text-[10px] leading-snug text-grape-200/40">Estimativa média de ~{ML_PER_MESSAGE} ml de água por mensagem, usada no resfriamento de data centers (baseada em estudos públicos sobre IA).</p>
    </div>
  );
}
