import { useCallback, useEffect, useState } from 'react';
import { Ban, Check, Clock, Flag, Shield, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

interface ReportProfile {
  full_name: string;
  email: string | null;
  dante_immunity: boolean | null;
  dante_blocked_until: string | null;
}

interface DanteReport {
  id: string;
  user_id: string;
  user_message: string;
  dante_response: string | null;
  reason_type: string;
  severity: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  profiles: ReportProfile | ReportProfile[] | null;
}

const REASONS: Record<string, string> = {
  insult: 'Ofensa',
  threat_violence: 'Ameaça',
  jailbreak: 'Tentativa de jailbreak',
  other: 'Outro',
};

const STATUS: Record<string, string> = {
  pending: 'Pendente',
  reviewed: 'Revisada',
  ignored: 'Ignorada',
  banned: 'Suspensão aplicada',
};

function reportProfile(report: DanteReport): ReportProfile | null {
  if (Array.isArray(report.profiles)) return report.profiles[0] ?? null;
  return report.profiles;
}

export function DanteReportsAdmin() {
  const { toast } = useToast();
  const [reports, setReports] = useState<DanteReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [hours, setHours] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('dante_reports')
      .select('*, profiles(full_name, email, dante_immunity, dante_blocked_until)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (filter !== 'all') query = query.eq('status', filter);
    const { data, error } = await query;
    if (error) toast(`Erro ao carregar denúncias: ${error.message}`, 'error');
    setReports((data as DanteReport[]) ?? []);
    setLoading(false);
  }, [filter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateReport = async (report: DanteReport, status: string) => {
    setBusy(report.id);
    const { error } = await supabase
      .from('dante_reports')
      .update({ status, admin_notes: notes[report.id]?.trim() || report.admin_notes })
      .eq('id', report.id);
    setBusy('');
    if (error) return toast(`Erro ao atualizar: ${error.message}`, 'error');
    toast('Denúncia atualizada.', 'success');
    void load();
  };

  const suspend = async (report: DanteReport) => {
    const duration = hours[report.id] ?? 24;
    if (!confirm(`Suspender este usuário do chat por ${duration} horas?`)) return;
    setBusy(report.id);
    const until = new Date(Date.now() + duration * 3600000).toISOString();
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ dante_blocked_until: until, dante_block_reason: 'violation' })
      .eq('id', report.user_id);
    if (profileError) {
      setBusy('');
      return toast(`Não foi possível suspender: ${profileError.message}`, 'error');
    }
    const { error } = await supabase
      .from('dante_reports')
      .update({ status: 'banned', admin_notes: notes[report.id]?.trim() || `Suspensão de ${duration}h aplicada pelo admin.` })
      .eq('id', report.id);
    setBusy('');
    if (error) return toast(`A suspensão foi aplicada, mas o registro não foi atualizado: ${error.message}`, 'error');
    toast(`Usuário suspenso por ${duration} horas.`, 'success');
    void load();
  };

  const unblock = async (report: DanteReport) => {
    setBusy(report.id);
    const { error } = await supabase
      .from('profiles')
      .update({ dante_blocked_until: null, dante_block_reason: null })
      .eq('id', report.user_id);
    setBusy('');
    if (error) return toast(`Erro ao desbloquear: ${error.message}`, 'error');
    toast('Bloqueio removido.', 'success');
    void load();
  };

  const toggleImmunity = async (report: DanteReport) => {
    const profile = reportProfile(report);
    setBusy(report.id);
    const { error } = await supabase
      .from('profiles')
      .update({ dante_immunity: !profile?.dante_immunity })
      .eq('id', report.user_id);
    setBusy('');
    if (error) return toast(`Erro ao alterar imunidade: ${error.message}`, 'error');
    toast(profile?.dante_immunity ? 'Imunidade removida.' : 'Usuário imunizado contra bloqueios do Dante.', 'success');
    void load();
  };

  const remove = async (report: DanteReport) => {
    if (!confirm('Excluir este registro de denúncia? Essa ação não apaga a conversa.')) return;
    setBusy(report.id);
    const { error } = await supabase.from('dante_reports').delete().eq('id', report.id);
    setBusy('');
    if (error) return toast(`Erro ao excluir: ${error.message}`, 'error');
    toast('Registro excluído.', 'success');
    void load();
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-grape-50">Denúncias do Dante</h2>
          <p className="text-sm text-grape-200/60">Ofensas, ameaças e tentativas de alterar a personalidade.</p>
        </div>
        <select className="input max-w-52" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar denúncias">
          <option value="pending">Pendentes</option>
          <option value="reviewed">Revisadas</option>
          <option value="ignored">Ignoradas</option>
          <option value="banned">Com suspensão</option>
          <option value="all">Todas</option>
        </select>
      </div>

      {loading ? (
        <p className="card p-8 text-center text-grape-200/60">Carregando denúncias...</p>
      ) : reports.length === 0 ? (
        <p className="card p-8 text-center text-grape-200/60">Nenhuma denúncia neste filtro.</p>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const profile = reportProfile(report);
            const blocked = profile?.dante_blocked_until && new Date(profile.dante_blocked_until).getTime() > Date.now();
            return (
              <article key={report.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-grape-50">{profile?.full_name || 'Usuário removido'}</h3>
                    <p className="text-xs text-grape-200/50">{profile?.email || report.user_id}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-rose-300">{REASONS[report.reason_type] ?? report.reason_type}</span>
                    <span className="rounded-full bg-gold-400/10 px-2.5 py-1 text-gold-400">Severidade: {report.severity}</span>
                    <span className="rounded-full bg-white/5 px-2.5 py-1 text-grape-200/70">{STATUS[report.status] ?? report.status}</span>
                  </div>
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs text-grape-200/50"><Clock size={12} /> {new Date(report.created_at).toLocaleString('pt-BR')}</p>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-rose-400/15 bg-rose-500/5 p-3">
                    <p className="mb-1 text-xs font-semibold text-rose-300">Mensagem do usuário</p>
                    <p className="whitespace-pre-wrap text-sm text-grape-100/80">{report.user_message}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="mb-1 text-xs font-semibold text-grape-200/70">Resposta do Dante</p>
                    <p className="whitespace-pre-wrap text-sm text-grape-100/80">{report.dante_response || 'Sem resposta registrada.'}</p>
                  </div>
                </div>
                <textarea
                  className="input mt-3"
                  rows={2}
                  placeholder="Nota interna ou advertência registrada pelo admin"
                  value={notes[report.id] ?? report.admin_notes ?? ''}
                  onChange={(e) => setNotes({ ...notes, [report.id]: e.target.value })}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button disabled={busy === report.id} onClick={() => updateReport(report, 'reviewed')} className="btn-ghost px-3 py-1.5 text-xs"><Check size={14} /> Revisar / advertir</button>
                  <button disabled={busy === report.id} onClick={() => updateReport(report, 'ignored')} className="btn-ghost px-3 py-1.5 text-xs"><X size={14} /> Ignorar</button>
                  <select
                    className="input w-24 px-2 py-1.5 text-xs"
                    value={hours[report.id] ?? 24}
                    onChange={(e) => setHours({ ...hours, [report.id]: Number(e.target.value) })}
                    aria-label="Duração da suspensão"
                  >
                    <option value={2}>2 horas</option>
                    <option value={12}>12 horas</option>
                    <option value={24}>24 horas</option>
                  </select>
                  <button disabled={busy === report.id} onClick={() => suspend(report)} className="btn-danger px-3 py-1.5 text-xs"><Ban size={14} /> Suspender</button>
                  {blocked && <button disabled={busy === report.id} onClick={() => unblock(report)} className="btn-ghost px-3 py-1.5 text-xs"><Clock size={14} /> Desbloquear</button>}
                  <button disabled={busy === report.id} onClick={() => toggleImmunity(report)} className="btn-ghost px-3 py-1.5 text-xs"><Shield size={14} /> {profile?.dante_immunity ? 'Remover imunidade' : 'Imunizar'}</button>
                  <button disabled={busy === report.id} onClick={() => remove(report)} className="ml-auto rounded-full p-2 text-rose-300 hover:bg-rose-500/10" aria-label="Excluir registro"><Trash2 size={16} /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="mt-4 flex items-start gap-2 text-xs text-grape-200/50"><Flag size={14} className="mt-0.5 flex-shrink-0" /> Pausas por cansaço não aparecem aqui: elas são descanso do Dante, não violações do usuário.</p>
    </div>
  );
}
