import { useCallback, useEffect, useState } from 'react';
import { Loader as Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

interface Card { id: string; code: string; multiplier: number; is_active: boolean; }

export function ScratchEventAdmin() {
  const { toast } = useToast();
  const [active, setActive] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [code, setCode] = useState('');
  const [mult, setMult] = useState('1');
  const [qty, setQty] = useState('1');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: sc }, { data: c }, { data: u }] = await Promise.all([
      supabase.from('site_content').select('value').eq('key', 'affiliate_scratch_event_active').maybeSingle(),
      supabase.from('affiliate_scratch_cards').select('*').order('code'),
      supabase.from('affiliate_user_scratch_cards').select('card_id'),
    ]);
    setActive(sc?.value === 'true');
    setCards((c ?? []) as Card[]);
    const m: Record<string, number> = {};
    (u ?? []).forEach((r: { card_id: string }) => { m[r.card_id] = (m[r.card_id] ?? 0) + 1; });
    setCounts(m);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleEvent() {
    const value = active ? 'false' : 'true';
    const { error } = await supabase.from('site_content').upsert({ key: 'affiliate_scratch_event_active', value, updated_at: new Date().toISOString() });
    if (error) return toast(error.message, 'error');
    setActive(!active);
    toast(active ? 'Evento desligado' : 'Evento ligado', 'success');
  }

  function nextCode(offset: number) {
    const nums = cards.map((c) => parseInt(c.code.replace(/\D/g, ''), 10)).filter((n) => !Number.isNaN(n));
    const n = (nums.length ? Math.max(...nums) : 0) + 1 + offset;
    return '#' + String(n).padStart(3, '0');
  }

  async function addCards() {
    const m = Number(mult.replace(',', '.'));
    if (!(m >= 1)) return toast('Multiplicador deve ser 1 ou maior', 'error');
    const q = Math.min(Math.max(parseInt(qty, 10) || 1, 1), 100);
    const rows = code.trim() && q === 1
      ? [{ code: code.trim().startsWith('#') ? code.trim() : '#' + code.trim(), multiplier: m }]
      : Array.from({ length: q }, (_, i) => ({ code: nextCode(i), multiplier: m }));
    const { error } = await supabase.from('affiliate_scratch_cards').insert(rows);
    if (error) return toast(error.message.includes('duplicate') ? 'Código já existe' : error.message, 'error');
    setCode(''); setQty('1');
    toast(`${rows.length} bilhete(s) cadastrado(s)`, 'success');
    load();
  }

  async function toggleCard(c: Card) {
    await supabase.from('affiliate_scratch_cards').update({ is_active: !c.is_active }).eq('id', c.id);
    load();
  }

  async function removeCard(c: Card) {
    if (!confirm(`Excluir bilhete ${c.code}? Quem já raspou perde esse multiplicador.`)) return;
    await supabase.from('affiliate_scratch_cards').delete().eq('id', c.id);
    load();
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gold-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <div>
          <p className="font-semibold text-white">Evento Raspadinha</p>
          <p className="text-xs text-grape-200/60">Ligado: embaixadores raspam bilhetes e os Coins são multiplicados por 5 dias.</p>
        </div>
        <button onClick={toggleEvent} className={active ? 'btn-primary text-sm' : 'rounded-full border border-white/15 px-4 py-2 text-sm text-grape-200'}>
          {active ? 'Ligado — desligar' : 'Desligado — ligar'}
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="mb-3 font-semibold text-white">Cadastrar bilhetes</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <input className="input" placeholder={`Código (auto: ${nextCode(0)})`} value={code} onChange={(e) => setCode(e.target.value)} />
          <input className="input" type="number" min="1" step="0.5" placeholder="Multiplicador" value={mult} onChange={(e) => setMult(e.target.value)} />
          <input className="input" type="number" min="1" max="100" placeholder="Quantidade" value={qty} onChange={(e) => setQty(e.target.value)} />
          <button onClick={addCards} className="btn-primary text-sm"><Plus size={15} /> Adicionar</button>
        </div>
        <p className="mt-2 text-xs text-grape-200/50">Com quantidade maior que 1, os códigos são gerados em sequência.</p>
      </div>

      <div className="space-y-2">
        {cards.length === 0 && <p className="text-sm text-grape-200/60">Nenhum bilhete cadastrado.</p>}
        {cards.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
            <span className="font-mono text-gold-400">{c.code}</span>
            <span className="text-white">{Number(c.multiplier)}x</span>
            <span className="text-grape-200/60">{counts[c.id] ?? 0} raspado(s)</span>
            <div className="flex gap-2">
              <button onClick={() => toggleCard(c)} className="rounded-full border border-white/15 px-3 py-1 text-xs text-grape-200">
                {c.is_active ? 'Ativo' : 'Inativo'}
              </button>
              <button onClick={() => removeCard(c)} className="text-rose-400" aria-label="Excluir"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
