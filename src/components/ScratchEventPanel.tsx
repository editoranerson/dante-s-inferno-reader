import { useCallback, useEffect, useState } from 'react';
import { Ticket, Sparkles, Loader as Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

interface Status { active: boolean; accumulates: boolean; free_left: number; price: number; used: number; limit: number; multiplier: number; }
interface Ticket { id: string; code: string; multiplier: number; expires_at: string; }

function timeLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expirado';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

export function ScratchEventPanel({ coins, onChange }: { coins: number; onChange: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [revealed, setRevealed] = useState<{ code: string; multiplier: number; total: number } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('affiliate_scratch_status');
    setStatus(data as Status | null);
    const { data: t } = await supabase.from('affiliate_user_scratch_cards').select('id, code, multiplier, expires_at').order('revealed_at', { ascending: false });
    setTickets((t ?? []) as Ticket[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!status?.active) return null;

  const canDraw = status.used < status.limit && (status.free_left > 0 || coins >= status.price);

  async function draw() {
    setDrawing(true);
    setRevealed(null);
    const { data, error } = await supabase.rpc('affiliate_scratch_draw');
    await new Promise((r) => setTimeout(r, 900));
    setDrawing(false);
    const res = data as { ok: boolean; error?: string; code: string; multiplier: number; total_multiplier: number } | null;
    if (error || !res?.ok) return toast(res?.error || 'Não foi possível raspar agora', 'error');
    setRevealed({ code: res.code, multiplier: Number(res.multiplier), total: Number(res.total_multiplier) });
    load();
    onChange();
  }

  return (
    <div className="rounded-2xl border border-gold-400/30 bg-gradient-to-br from-grape-500/20 to-rose-500/10 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Ticket className="text-gold-400" size={20} />
        <h3 className="font-display text-lg font-semibold text-gold-400">Raspadinha dos Embaixadores</h3>
      </div>
      <p className="text-sm text-grape-200/80">
        Cada bilhete multiplica seus ganhos de Coins por 5 dias.{' '}
        {status.accumulates ? 'Premium+: seus multiplicadores se somam!' : 'Vale o maior multiplicador ativo.'}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white/5 p-2"><p className="text-2xl font-bold text-gold-400">{Number(status.multiplier)}x</p><p className="text-[11px] text-grape-200/60">Multiplicador</p></div>
        <div className="rounded-lg bg-white/5 p-2"><p className="text-2xl font-bold text-white">{status.used}/{status.limit}</p><p className="text-[11px] text-grape-200/60">Bilhetes</p></div>
        <div className="rounded-lg bg-white/5 p-2"><p className="text-2xl font-bold text-white">{status.free_left}</p><p className="text-[11px] text-grape-200/60">Grátis</p></div>
      </div>

      <div className="mt-4 flex min-h-[110px] items-center justify-center rounded-xl border-2 border-dashed border-gold-400/40 bg-white/5 p-4 text-center">
        {drawing ? (
          <Loader2 className="animate-spin text-gold-400" size={28} />
        ) : revealed ? (
          <div className="animate-in zoom-in">
            <Sparkles className="mx-auto text-gold-400" />
            <p className="font-mono text-sm text-grape-200">Bilhete {revealed.code}</p>
            <p className="text-3xl font-bold text-gold-400">{revealed.multiplier}x</p>
            <p className="text-xs text-grape-200/70">Multiplicador atual: {revealed.total}x</p>
          </div>
        ) : (
          <p className="text-sm text-grape-200/60">Raspe para revelar seu multiplicador</p>
        )}
      </div>

      <button onClick={draw} disabled={!canDraw || drawing} className="btn-primary mt-4 w-full justify-center text-sm disabled:opacity-50">
        {status.used >= status.limit ? 'Limite de bilhetes atingido'
          : status.free_left > 0 ? 'Raspar bilhete grátis'
          : `Raspar por ${status.price} Coins`}
      </button>

      {tickets.length > 0 && (
        <div className="mt-4 space-y-1">
          {tickets.map((t) => (
            <div key={t.id} className="flex justify-between text-xs text-grape-200/80">
              <span className="font-mono">{t.code}</span>
              <span className="text-gold-400">{Number(t.multiplier)}x</span>
              <span>{timeLeft(t.expires_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
