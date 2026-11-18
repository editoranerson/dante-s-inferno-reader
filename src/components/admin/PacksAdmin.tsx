import { useEffect, useState } from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { supabase, CARD_TYPE_LABELS, type CardPack } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { ImageUpload } from '@/components/ImageUpload';

const empty: Partial<CardPack> = {
  name: '', description: '', cover_url: '', card_count: 3, guaranteed_card_type: null,
  is_for_sale: true, price_dantes: 50, has_promo_code: false, promo_code: '', is_active: true,
};

export function PacksAdmin() {
  const { toast } = useToast();
  const [packs, setPacks] = useState<CardPack[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [form, setForm] = useState<Partial<CardPack> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('card_packs').select('*').order('created_at', { ascending: false }),
      supabase.from('cards').select('type'),
    ]);
    setPacks((p as CardPack[]) ?? []);
    setTypes([...new Set(((c as { type: string }[]) ?? []).map((x) => x.type))].sort());
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form?.name?.trim()) return toast('Informe o nome.', 'error');
    if (!form.is_for_sale && !form.has_promo_code) return toast('Marque venda e/ou código.', 'error');
    if (form.has_promo_code && !form.promo_code?.trim()) return toast('Informe o código.', 'error');
    setSaving(true);
    const payload = {
      name: form.name, description: form.description ?? '', cover_url: form.cover_url ?? '',
      card_count: Math.max(1, Number(form.card_count) || 1),
      guaranteed_card_type: form.guaranteed_card_type || null,
      is_for_sale: !!form.is_for_sale, price_dantes: Number(form.price_dantes) || 0,
      has_promo_code: !!form.has_promo_code,
      promo_code: form.has_promo_code ? form.promo_code!.trim().toUpperCase() : null,
      is_active: !!form.is_active,
    };
    const { error } = form.id
      ? await supabase.from('card_packs').update(payload).eq('id', form.id)
      : await supabase.from('card_packs').insert(payload);
    setSaving(false);
    if (error) return toast('Erro ao salvar pack.', 'error');
    toast('Pack salvo!', 'success');
    setForm(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este pack?')) return;
    await supabase.from('card_packs').delete().eq('id', id);
    load();
  };

  const toggle = async (p: CardPack) => {
    await supabase.from('card_packs').update({ is_active: !p.is_active }).eq('id', p.id);
    load();
  };

  const label = (t: string) => (CARD_TYPE_LABELS as Record<string, string>)[t] ?? t;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-grape-50">Packs de Cartas</h2>
        <button onClick={() => setForm({ ...empty })} className="btn-primary"><Plus size={16} /> Novo pack</button>
      </div>
      <p className="mb-4 text-xs text-grape-200/60">Chance por carta conforme estrelas: ⭐ 60 · ⭐⭐ 25 · ⭐⭐⭐ 10 · ⭐⭐⭐⭐ 4 · ⭐⭐⭐⭐⭐ 1 (em cada 100).</p>
      {packs.length === 0 ? (
        <div className="card p-8 text-center text-grape-200/60">Nenhum pack cadastrado.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((p) => (
            <div key={p.id} className={`card p-4 ${p.is_active ? '' : 'opacity-50'}`}>
              <p className="font-semibold text-grape-50">{p.name}</p>
              <p className="text-xs text-grape-200/60">
                {p.card_count} cartas{p.guaranteed_card_type ? ` · mín. 1 ${label(p.guaranteed_card_type)}` : ''}
              </p>
              <p className="text-xs text-grape-200/60">
                {p.is_for_sale ? `${p.price_dantes} Dantes` : 'Não vendido'}{p.has_promo_code ? ` · código ${p.promo_code}` : ''}
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => toggle(p)} className="btn-ghost text-xs">{p.is_active ? 'Desativar' : 'Ativar'}</button>
                <button onClick={() => setForm(p)} className="rounded-lg p-2 text-grape-200 hover:bg-white/10"><Pencil size={16} /></button>
                <button onClick={() => remove(p.id)} className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/10"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal open onClose={() => setForm(null)} title={form.id ? 'Editar Pack' : 'Novo Pack'} maxWidth="max-w-lg">
          <div className="space-y-4">
            <ImageUpload key={form.cover_url || 'new'} folder="packs" label="Capa do pack (opcional)" currentUrl={form.cover_url ?? ''} onUploaded={(url) => setForm({ ...form, cover_url: url })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Nome</label>
                <input className="input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Nº de cartas</label>
                <input type="number" min={1} className="input" value={form.card_count ?? 3} onChange={(e) => setForm({ ...form, card_count: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="label">Descrição</label>
              <input className="input" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="label">Garantia mínima de tipo</label>
              <select className="input" value={form.guaranteed_card_type ?? ''} onChange={(e) => setForm({ ...form, guaranteed_card_type: e.target.value || null })}>
                <option value="">Sem garantia</option>
                {types.map((t) => <option key={t} value={t}>1 carta {label(t)}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-grape-100">
              <input type="checkbox" checked={!!form.is_for_sale} onChange={(e) => setForm({ ...form, is_for_sale: e.target.checked })} /> À venda por Dantes
            </label>
            {form.is_for_sale && (
              <input type="number" min={0} className="input" value={form.price_dantes ?? 0} onChange={(e) => setForm({ ...form, price_dantes: Number(e.target.value) })} placeholder="Preço em Dantes" />
            )}
            <label className="flex items-center gap-2 text-sm text-grape-100">
              <input type="checkbox" checked={!!form.has_promo_code} onChange={(e) => setForm({ ...form, has_promo_code: e.target.checked })} /> Liberar por código (1 vez por usuário)
            </label>
            {form.has_promo_code && (
              <input className="input uppercase" value={form.promo_code ?? ''} onChange={(e) => setForm({ ...form, promo_code: e.target.value })} placeholder="Ex: DANTE2026" />
            )}
            <label className="flex items-center gap-2 text-sm text-grape-100">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Ativo
            </label>
            <button onClick={save} disabled={saving} className="btn-primary w-full">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
