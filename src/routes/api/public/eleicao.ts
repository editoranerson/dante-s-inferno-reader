import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const UFS = ['ac','al','ap','am','ba','ce','df','es','go','ma','mt','ms','mg','pa','pb','pr','pe','pi','rj','rn','rs','ro','rr','sc','sp','se','to'];
const schema = z.object({ cargo: z.enum(['presidente', 'governador']), uf: z.string().length(2).optional() });

// Códigos oficiais do pleito 2026 (1º turno): Presidente = 6257, Governador = 6259
const ELEICAO: Record<'presidente' | 'governador', { codigo: string; cargo: string }> = {
  presidente: { codigo: process.env.TSE_ELEICAO_PRESIDENTE || '6257', cargo: '0001' },
  governador: { codigo: process.env.TSE_ELEICAO_GOVERNADOR || '6259', cargo: '0003' },
};

type Cand = { name: string; party: string; votes: number; pct: number; elected: boolean; photoUrl?: string };
type Result = {
  simulated: boolean; cargo: string; uf: string; apurado: number; updated: string | null;
  candidates: Cand[]; brancos: number; nulos: number;
};

function num(v: unknown) {
  return Number(String(v ?? '0').replace(/\./g, '').replace(',', '.')) || 0;
}

function simulated(cargo: string, uf: string): Result {
  const names = cargo === 'presidente'
    ? [['Candidato A', 'PARTIDO 1'], ['Candidato B', 'PARTIDO 2'], ['Candidato C', 'PARTIDO 3'], ['Candidato D', 'PARTIDO 4']]
    : [['Candidato X', 'PARTIDO 5'], ['Candidato Y', 'PARTIDO 6'], ['Candidato Z', 'PARTIDO 7']];
  const pcts = cargo === 'presidente' ? [41.2, 36.8, 12.5, 9.5] : [48.3, 39.1, 12.6];
  return {
    simulated: true, cargo, uf, apurado: 0, updated: null,
    candidates: names.map(([n, p], i) => ({ name: n, party: p, votes: 0, pct: pcts[i], elected: false })),
    brancos: 0, nulos: 0,
  };
}

// Formato "resumo" (-r.json): lista simples de candidatos
function parseResumo(d: Record<string, any>, cargo: string, uf: string): Result {
  const candidates: Cand[] = (d.cand || [])
    .map((x: any) => ({
      name: x.nmu || x.nm, party: x.cc || '', votes: num(x.vap), pct: num(x.pvap),
      elected: x.e === 's',
      photoUrl: x.sqcand ? `https://resultados.tse.jus.br/oficial/ele2026/${ELEICAO[cargo as 'presidente' | 'governador'].codigo}/fotos/${uf}/${x.sqcand}.jpeg` : undefined,
    }))
    .sort((a: Cand, b: Cand) => b.votes - a.votes);
  return {
    simulated: false, cargo, uf, apurado: num(d.pst),
    updated: d.dg && d.hg ? `${d.dg} ${d.hg}` : null,
    candidates, brancos: num(d.pvb), nulos: num(d.pvn),
  };
}

// Formato "unidade" (-u.json): candidatos agrupados por cargo -> coligação -> partido
function parseUnidade(d: Record<string, any>, cargo: string, uf: string): Result {
  const candidates: Cand[] = [];
  for (const carg of d.carg || []) {
    for (const agr of carg.agr || []) {
      for (const par of agr.par || []) {
        for (const cand of par.cand || []) {
          candidates.push({
            name: cand.nmu || cand.nm, party: par.sg || '', votes: num(cand.vap),
            pct: num(cand.pvap), elected: cand.e === 's',
            photoUrl: cand.sqcand ? `https://resultados.tse.jus.br/oficial/ele2026/${ELEICAO[cargo as 'presidente' | 'governador'].codigo}/fotos/${uf}/${cand.sqcand}.jpeg` : undefined,
          });
        }
      }
    }
  }
  candidates.sort((a, b) => b.votes - a.votes);
  return {
    simulated: false, cargo, uf,
    apurado: num(d.s?.pst ?? d.pst),
    updated: d.dg && d.hg ? `${d.dg} ${d.hg}` : null,
    candidates, brancos: num(d.v?.pvb ?? d.pvb), nulos: num(d.v?.pvn ?? d.pvn),
  };
}

// Cache global em memória: 45s por cargo/UF, com de-duplicação de requisições simultâneas (in-flight).
const CACHE_TTL_MS = 45_000;
const cache = new Map<string, { at: number; data: Result }>();
const inflight = new Map<string, Promise<Result>>();

async function fetchTse(cargo: 'presidente' | 'governador', uf: string): Promise<Result> {
  const key = `${cargo}:${uf}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const pending = inflight.get(key);
  if (pending) return pending;

  const { codigo, cargo: c } = ELEICAO[cargo];
  const base = `https://resultados.tse.jus.br/oficial/ele2026/${codigo}`;
  const file = `${uf}-c${c}-e${codigo.padStart(6, '0')}`;

  const promise = (async (): Promise<Result> => {
    try {
      const res = await fetch(`${base}/dados-simplificados/${uf}/${file}-r.json`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(String(res.status));
      return parseResumo((await res.json()) as Record<string, any>, cargo, uf);
    } catch {
      const res = await fetch(`${base}/dados/${uf}/${file}-u.json`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(String(res.status));
      return parseUnidade((await res.json()) as Record<string, any>, cargo, uf);
    }
  })()
    .then((data) => { cache.set(key, { at: Date.now(), data }); return data; })
    .finally(() => { inflight.delete(key); });

  inflight.set(key, promise);
  return promise;
}

export const Route = createFileRoute('/api/public/eleicao')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
        if (!parsed.success) return Response.json({ error: 'invalid' }, { status: 400 });
        const { cargo } = parsed.data;
        const uf = cargo === 'presidente' ? 'br' : (parsed.data.uf || '').toLowerCase();
        if (cargo === 'governador' && !UFS.includes(uf)) return Response.json({ error: 'uf' }, { status: 400 });

        const headers = { 'Cache-Control': 'public, max-age=45, must-revalidate' };
        try {
          const data = await fetchTse(cargo, uf);
          return Response.json(data, { headers });
        } catch (e) {
          console.error('[eleicao] TSE indisponível', cargo, uf, e);
          return Response.json(simulated(cargo, uf), { headers });
        }
      },
    },
  },
});
