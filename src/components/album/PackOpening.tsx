import { useEffect, useRef, useState } from 'react';
import { BookOpen, Crown, Package, Sparkles, X } from 'lucide-react';
import { CARD_TYPE_BORDER, CARD_TYPE_LABELS, type Card } from '@/lib/supabase';

export type RevealCard = Card & { badge: 'nova' | number };

type Stage = 'tear' | 'rise' | 'reveal' | 'storing';

const TEAR_THRESHOLD = 0.7;

export function PackOpening({ name, cover, cards, onClose }: { name: string; cover?: string | null; cards: RevealCard[]; onClose: () => void }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [stage, setStage] = useState<Stage>(reduced ? 'reveal' : 'tear');
  const [tear, setTear] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flipped, setFlipped] = useState<boolean[]>(() => cards.map(() => !!reduced));
  const [flying, setFlying] = useState(false);
  const [albumPulse, setAlbumPulse] = useState(false);
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stage !== 'rise') return;
    const t = setTimeout(() => setStage('reveal'), 900 + cards.length * 120);
    return () => clearTimeout(t);
  }, [stage, cards.length]);

  const openPack = () => { setTear(1); setTimeout(() => setStage('rise'), 450); };

  const updateTear = (clientX: number) => {
    const el = lineRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setTear(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  };
  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    if (tear >= TEAR_THRESHOLD) openPack(); else setTear(0);
  };

  const store = () => {
    if (stage === 'storing') return;
    setStage('storing');
    const allFlipped = flipped.every(Boolean);
    if (!allFlipped) setFlipped(cards.map(() => true));
    const wait = allFlipped ? 100 : 1400;
    setTimeout(() => setFlying(true), wait);
    setTimeout(() => setAlbumPulse(true), wait + 600);
    setTimeout(onClose, wait + 1100);
  };

  const torn = tear >= 1;
  const fan = (i: number) => {
    const mid = (cards.length - 1) / 2;
    return (i - mid);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-ink-950/95 backdrop-blur-md">
      <button onClick={onClose} aria-label="Fechar" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-grape-100 hover:bg-white/20"><X size={20} /></button>

      {/* Album icon target */}
      <div className={`absolute bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-grape-600 to-rose-600 shadow-lg transition-transform duration-300 ${albumPulse ? 'scale-125' : stage === 'reveal' || stage === 'storing' ? 'scale-100' : 'scale-0'}`}>
        <BookOpen size={26} className="text-grape-50" />
      </div>

      <h2 className="absolute top-8 px-12 text-center font-display text-2xl font-semibold text-grape-50">{name}</h2>

      {/* Pack */}
      {(stage === 'tear' || stage === 'rise') && (
        <div
          className="relative transition-all duration-700 ease-out"
          style={{ transform: stage === 'rise' ? 'translateY(160px) scale(0.55)' : 'none', opacity: stage === 'rise' ? 0.6 : 1 }}
        >
          <div className="relative h-80 w-56 sm:h-96 sm:w-64">
            {/* Top flap */}
            <div
              className="absolute inset-x-0 top-0 h-[18%] overflow-hidden rounded-t-2xl bg-gradient-to-br from-rose-500 to-grape-600 transition-all duration-500"
              style={torn ? { transform: 'translate(40px,-120px) rotate(25deg)', opacity: 0 } : { clipPath: `polygon(${tear * 100}% 0, 100% 0, 100% 100%, ${tear * 100}% 100%)` }}
            >
              {cover ? <img src={cover} alt="" className="absolute inset-x-0 top-0 h-[555%] w-full object-cover object-top" /> : null}
            </div>
            {torn ? null : (
              <div className="absolute inset-x-0 top-0 h-[18%] rounded-t-2xl bg-gradient-to-br from-rose-500/40 to-grape-600/40" style={{ clipPath: `polygon(0 0, ${tear * 100}% 0, ${tear * 100}% 100%, 0 100%)`, transform: `translateY(-${tear * 8}px) rotate(-${tear * 4}deg)` }} />
            )}
            {/* Body */}
            <div className="absolute inset-x-0 bottom-0 top-[18%] flex flex-col items-center justify-center overflow-hidden rounded-b-2xl bg-gradient-to-br from-grape-700 via-grape-600 to-rose-600 shadow-[0_0_60px_hsl(var(--primary)/0.5)]">
              {cover ? (
                <img src={cover} alt="" className="absolute inset-x-0 bottom-0 h-[122%] w-full object-cover object-bottom" />
              ) : (
                <>
                  <Package size={56} className="relative text-grape-50 drop-shadow-lg" />
                  <p className="relative mt-3 font-display text-sm uppercase tracking-[0.3em] text-grape-50">{cards.length} cartas</p>
                </>
              )}
            </div>
            {/* Tear line */}
            {stage === 'tear' && !torn && (
              <div
                ref={lineRef}
                className="absolute inset-x-0 top-[18%] h-12 -translate-y-1/2 cursor-grab touch-none"
                onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setDragging(true); updateTear(e.clientX); }}
                onPointerMove={(e) => dragging && updateTear(e.clientX)}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <div className="absolute inset-x-2 top-1/2 border-t-2 border-dashed border-grape-50/70" />
                <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded bg-grape-50 transition-[width] duration-75" style={{ width: `${tear * 100}%`, transitionDuration: dragging ? '0ms' : '300ms' }} />
              </div>
            )}
          </div>
          {stage === 'tear' && (
            <div className="mt-6 text-center">
              <p className="animate-pulse text-sm text-grape-100">👉 Arraste na linha para rasgar</p>
              <button onClick={openPack} className="mt-2 text-xs text-grape-300/70 underline">Toque para abrir</button>
            </div>
          )}
        </div>
      )}

      {/* Cards */}
      {stage !== 'tear' && (
        <div className={`flex max-w-full flex-wrap items-center justify-center gap-3 px-4 ${stage === 'rise' ? 'absolute' : ''}`} style={{ perspective: 1200 }}>
          {cards.map((c, i) => {
            const off = fan(i);
            const risen = stage !== 'rise' || true;
            const style: React.CSSProperties = flying
              ? { transform: `translate(${(window.innerWidth / 2) - 40}px, ${(window.innerHeight / 2) - 40}px) scale(0.1)`, opacity: 0, transition: `all 600ms ease-in ${i * 60}ms` }
              : stage === 'rise'
                ? { animation: `pack-rise 800ms cubic-bezier(.2,.8,.2,1) ${i * 120}ms both`, ['--fan' as string]: `${off * 12}px` }
                : { transition: 'all 500ms ease' };
            const stars = c.difficulty_stars ?? 1;
            return (
              <button
                key={`${c.id}-${i}`}
                disabled={stage !== 'reveal' || flipped[i]}
                onClick={() => setFlipped((f) => f.map((v, j) => (j === i ? true : v)))}
                className="relative h-48 w-36 sm:h-60 sm:w-44"
                style={style}
                data-risen={risen}
              >
                <div className="relative h-full w-full transition-transform duration-700" style={{ transformStyle: 'preserve-3d', transform: flipped[i] ? 'rotateY(180deg)' : 'none' }}>
                  {/* Back */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-grape-600 to-rose-600 p-[3px]" style={{ backfaceVisibility: 'hidden' }}>
                    <div className="relative flex h-full w-full flex-col items-center justify-center rounded-[14px] bg-ink-900">
                      <div className="absolute inset-3 rounded-xl border border-rose-400/20" />
                      <Crown size={36} className="text-rose-400 drop-shadow-[0_0_10px_currentColor]" />
                      <p className="mt-2 font-display text-[10px] uppercase tracking-[0.3em] text-grape-200/60">Dante</p>
                    </div>
                  </div>
                  {/* Front */}
                  <div className={`absolute inset-0 rounded-2xl p-[3px] ${CARD_TYPE_BORDER[c.type]} ${stars >= 4 && flipped[i] ? 'shadow-[0_0_40px_hsl(var(--primary)/0.8)]' : ''}`} style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    <div className="relative h-full w-full overflow-hidden rounded-[14px] bg-ink-800">
                      {c.photo_url ? <img src={c.photo_url} alt={c.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Sparkles className="text-grape-200/50" /></div>}
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-transparent to-transparent" />
                      <span className={`chip absolute right-2 top-2 text-[10px] font-bold ${c.badge === 'nova' ? 'bg-rose-500/90 text-grape-50' : 'bg-ink-950/70 text-grape-100'}`}>
                        {c.badge === 'nova' ? 'Nova!' : `Repetida x${c.badge}`}
                      </span>
                      <div className="absolute inset-x-0 bottom-0 p-2 text-center">
                        <p className="truncate font-display text-sm font-semibold text-grape-50">{c.name}</p>
                        <p className="text-[10px] uppercase tracking-wider text-grape-200/70">{CARD_TYPE_LABELS[c.type]} · {'⭐'.repeat(stars)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {(stage === 'reveal' || stage === 'storing') && (
        <div className="absolute bottom-8 flex flex-col items-center gap-2">
          {stage === 'reveal' && !flipped.every(Boolean) && <p className="text-xs text-grape-200/70">Toque nas cartas para revelar</p>}
          <button onClick={store} disabled={stage === 'storing'} className="btn-primary">Guardar no álbum</button>
        </div>
      )}

      <style>{`@keyframes pack-rise { from { transform: translateY(220px) scale(.6); opacity: 0 } 60% { opacity: 1 } to { transform: translateY(0) scale(1); opacity: 1 } }`}</style>
    </div>
  );
}
