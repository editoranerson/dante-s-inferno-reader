import { useEffect, useState, type RefObject } from 'react';
import { fetchActiveBanners } from '@/lib/showcase';

/** Insere [ANUNCIO:tag1,tag2] na posição do cursor do textarea. */
export function ChapterAdPicker({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [sel, setSel] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    fetchActiveBanners(true).then((rows) =>
      setTags(rows.filter((b) => b.placement === 'html').map((b) => b.nome_interno)),
    );
  }, [open]);

  const insert = () => {
    if (sel.length === 0) return;
    const el = textareaRef.current;
    const pos = el ? el.selectionStart : value.length;
    const marker = `\n\n[ANUNCIO:${sel.join(',')}]\n\n`;
    onChange(value.slice(0, pos) + marker + value.slice(pos));
    setSel([]);
    setOpen(false);
  };

  return (
    <div className="mb-2">
      <button type="button" className="btn-ghost text-xs" onClick={() => setOpen((o) => !o)}>
        + Inserir bloco de anúncio
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-white/10 p-3">
          <p className="mb-2 text-xs text-grape-200/70">Escolha os anúncios deste bloco (o bloco entra onde o cursor está):</p>
          {tags.length === 0 ? (
            <p className="text-sm text-grape-200/60">Nenhum banner cadastrado. Cadastre em Perfil → Anúncios.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => {
                const on = sel.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSel((p) => (on ? p.filter((x) => x !== t) : [...p, t]))}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      on ? 'bg-white/15 text-grape-50' : 'border border-white/10 text-grape-200/70'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}
          <button type="button" onClick={insert} disabled={sel.length === 0} className="btn-primary mt-3 text-xs">
            Inserir
          </button>
        </div>
      )}
    </div>
  );
}
