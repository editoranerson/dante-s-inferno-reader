import { useEffect, useState } from 'react';
import { Vote, RefreshCw, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { EmbedFrame } from '@/components/showcase/EmbedFrame';
import {
  drawBanner,
  fetchActiveBanners,
  getLastShown,
  resolveUserPlan,
  setLastShown,
  useIsMobileDevice,
  type AdBanner,
} from '@/lib/showcase';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

type Cand = {
  name: string;
  party: string;
  votes: number;
  pct: number;
  elected: boolean;
  photoUrl?: string;
};

type Result = {
  simulated: boolean;
  apurado: number;
  updated: string | null;
  candidates: Cand[];
  brancos: number;
  nulos: number;
};

function useResult(cargo: 'presidente' | 'governador', uf?: string) {
  const [data, setData] = useState<Result | null>(null);
  const [refreshMs, setRefreshMs] = useState(45_000);

  useEffect(() => {
    const updateMode = () => {
      if (document.hidden) setRefreshMs(300_000);
      else setRefreshMs(45_000);
    };

    updateMode();
    document.addEventListener('visibilitychange', updateMode);
    return () => document.removeEventListener('visibilitychange', updateMode);
  }, []);

  useEffect(() => {
    if (cargo === 'governador' && !uf) { setData(null); return; }
    let alive = true;
    const load = () =>
      fetch(`/api/public/eleicao?cargo=${cargo}${uf ? `&uf=${uf}` : ''}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => alive && setData(d))
        .catch(() => {});

    load();
    const t = window.setInterval(load, refreshMs);
    return () => { alive = false; window.clearInterval(t); };
  }, [cargo, uf, refreshMs]);

  return data;
}

function EleicaoBanner({ sessionKey }: { sessionKey: string }) {
  const { profile } = useAuth();
  const isMobile = useIsMobileDevice();
  const plan = resolveUserPlan(profile);
  const [banner, setBanner] = useState<AdBanner | null>(null);

  useEffect(() => {
    let alive = true;
    fetchActiveBanners().then((rows) => {
      if (!alive) return;
      const pool = rows.filter((b) => b.placement === 'html' && b.ativo);
      const chosen = drawBanner(pool, plan, 'feed', getLastShown(sessionKey));
      if (chosen) setLastShown(sessionKey, chosen.id);
      setBanner(chosen);
    });
    return () => { alive = false; };
  }, [plan, sessionKey]);

  const html = banner ? (isMobile ? banner.codigo_html_mobile : banner.codigo_html_desktop) : '';

  return (
    <div className="mx-auto my-6 flex min-h-[50px] w-full max-w-[320px] flex-col items-center justify-center overflow-hidden sm:max-w-[728px]">
      <span className="mb-1 text-[10px] uppercase tracking-widest text-grape-200/40">Publicidade</span>
      {html ? (
        <EmbedFrame html={html} />
      ) : (
        <div className="flex h-[50px] w-[320px] items-center justify-center rounded-md border border-white/5 bg-white/[0.02] text-[10px] uppercase tracking-wider text-grape-200/50">
          Carregando anúncio...
        </div>
      )}
    </div>
  );
}

function CandidateAvatar({ candidate }: { candidate: Cand }) {
  const [photoError, setPhotoError] = useState(false);

  const hasPhoto = !!candidate.photoUrl && !photoError;

  if (hasPhoto) {
    return (
      <img
        src={candidate.photoUrl}
        alt={candidate.name}
        className="h-11 w-11 rounded-full border border-white/10 bg-white/5 object-cover shrink-0"
        onError={() => setPhotoError(true)}
      />
    );
  }

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-grape-300">
      {candidate.name?.trim() ? candidate.name.charAt(0).toUpperCase() : <User size={16} className="text-grape-200/70" />}
    </div>
  );
}

function ResultCard({ title, data }: { title: string; data: Result | null }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-grape-50">{title}</h2>
        {data && (
          <span className="text-xs text-grape-200/60">
            {data.simulated ? 'Dados simulados (TSE ainda sem divulgação)' : `${data.apurado.toFixed(2)}% das urnas apuradas`}
            {data.updated && ` · ${data.updated}`}
          </span>
        )}
      </div>

      {!data ? (
        <div className="flex justify-center py-8"><RefreshCw className="animate-spin text-grape-300" size={20} /></div>
      ) : (
        <div className="space-y-4">
          {data.candidates.map((c) => (
            <div key={`${c.name}-${c.party}-${c.votes}`} className="text-sm">
              <div className="mb-2 flex items-start gap-3">
                <CandidateAvatar candidate={c} />

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold text-grape-50">
                        {c.name}{' '}
                        <span className="font-normal text-grape-200/60">· {c.party}</span>
                        {c.elected && <span className="ml-2 rounded bg-rose-500/20 px-1.5 text-xs text-rose-300">Eleito</span>}
                      </span>
                    </div>

                    <span className="tabular-nums shrink-0 text-grape-100">{c.pct.toFixed(2)}%</span>
                  </div>

                  <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-gradient-to-r from-grape-400 to-rose-400 transition-all duration-700" style={{ width: `${Math.min(100, c.pct)}%` }} />
                  </div>

                  {c.votes > 0 && <p className="mt-0.5 text-xs text-grape-200/50">{c.votes.toLocaleString('pt-BR')} votos</p>}
                </div>
              </div>
            </div>
          ))}

          {!data.simulated && (
            <p className="pt-2 text-xs text-grape-200/50">Brancos: {data.brancos.toFixed(2)}% · Nulos: {data.nulos.toFixed(2)}%</p>
          )}
        </div>
      )}
    </section>
  );
}

export function EleicaoPage() {
  const { profile } = useAuth();
  const [uf, setUf] = useState('');
  const pres = useResult('presidente');
  const gov = useResult('governador', uf || undefined);
  const premiumPlus = profile?.plan === 'dante_premium_plus' &&
    (!profile.plan_expires_at || new Date(profile.plan_expires_at) > new Date());

  useEffect(() => { document.title = 'Eleições 2026 — Apuração ao vivo | Querido Dante'; }, []);

  return (
    <div className="mx-auto max-w-3xl animate-fade-in px-4 py-10 sm:px-6">
      <div className="mb-6 text-center">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-grape-500/30 to-rose-500/30 text-grape-200"><Vote size={22} /></div>
        <h1 className="font-display text-3xl font-semibold text-grape-50">Eleições 2026 — Apuração</h1>
        <p className="mt-2 text-sm text-grape-100/70">Resultados oficiais do TSE, atualizados a cada 45 segundos.</p>
      </div>

      {!premiumPlus && <EleicaoBanner sessionKey="eleicao-topo" />}
      <ResultCard title="Presidente" data={pres} />
      <EleicaoBanner sessionKey="eleicao-meio" />

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-grape-50">Governador</h2>
        <select value={uf} onChange={(e) => setUf(e.target.value)} className="rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm text-grape-50">
          <option value="">Escolha o estado</option>
          {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {uf ? <ResultCard title={`Governador — ${uf}`} data={gov} /> : (
        <div className="card p-6 text-center text-sm text-grape-200/60">Selecione um estado para ver a apuração.</div>
      )}

      {!premiumPlus && <EleicaoBanner sessionKey="eleicao-final" />}

      <p className="mt-6 text-center text-xs text-grape-200/40">Fonte: Tribunal Superior Eleitoral (resultados.tse.jus.br).</p>
    </div>
  );
}
