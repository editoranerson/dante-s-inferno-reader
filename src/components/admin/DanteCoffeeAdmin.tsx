import { useCallback, useEffect, useState } from 'react';
import { Coffee, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCaffeine, type DanteCoffeeItem } from '@/lib/danteCoffee';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { DanteCoffeeIcon } from '@/components/DanteCoffeeIcon';

const EMPTY = {
  name: '',
  description: '',
  icon: 'coffee',
  price_dantes: 15,
  caffeine_pct: 20,
  dante_rating: 5,
  sort_order: 0,
  is_active: true,
};

export function DanteCoffeeAdmin() {
  const { toast } = useToast();
  const [items, setItems] = useState<DanteCoffeeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DanteCoffeeItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('dante_coffee_items')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) toast(`Erro ao carregar cafés: ${error.message}`, 'error');
    setItems((data as DanteCoffeeItem[]) ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, sort_order: items.length + 1 });
    setOpen(true);
  };

  const openEdit = (item: DanteCoffeeItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description ?? '',
      icon: item.icon,
      price_dantes: item.price_dantes,
      caffeine_pct: item.caffeine_pct,
      dante_rating: Number(item.dante_rating ?? 5),
      sort_order: item.sort_order,
      is_active: item.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast('Dê um nome ao café.', 'error');
    if (form.dante_rating < 0 || form.dante_rating > 10) {
      toast({ title: 'A nota do Dante vai de 0 a 10', variant: 'destructive' });
      return;
    }
    if (form.price_dantes <= 0 || form.caffeine_pct <= 0) {
      return toast('Preço e cafeína precisam ser maiores que zero.', 'error');
    }
    setSaving(true);
    const payload = { ...form, name: form.name.trim(), description: form.description.trim() || null };
    const { error } = editing
      ? await supabase.from('dante_coffee_items').update(payload).eq('id', editing.id)
      : await supabase.from('dante_coffee_items').insert(payload);
    setSaving(false);
    if (error) return toast(`Erro ao salvar: ${error.message}`, 'error');
    toast(editing ? 'Café atualizado.' : 'Café adicionado ao cardápio.', 'success');
    setOpen(false);
    void load();
  };

  const toggle = async (item: DanteCoffeeItem) => {
    const { error } = await supabase
      .from('dante_coffee_items')
      .update({ is_active: !item.is_active })
      .eq('id', item.id);
    if (error) return toast(`Erro ao atualizar: ${error.message}`, 'error');
    void load();
  };

  const remove = async (item: DanteCoffeeItem) => {
    if (!confirm(`Excluir "${item.name}" do cardápio? O histórico de doações será preservado.`)) return;
    const { error } = await supabase.from('dante_coffee_items').delete().eq('id', item.id);
    if (error) return toast(`Erro ao excluir: ${error.message}`, 'error');
    toast('Café excluído.', 'success');
    void load();
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-grape-50">Cafés do Dante</h2>
          <p className="text-sm text-grape-200/60">Gerencie preços, cafeína e a ordem do cardápio.</p>
        </div>
        <button onClick={openNew} className="btn-primary py-2"><Plus size={16} /> Novo café</button>
      </div>

      {loading ? (
        <p className="card p-8 text-center text-grape-200/60">Preparando a cafeteira...</p>
      ) : items.length === 0 ? (
        <p className="card p-8 text-center text-grape-200/60">Nenhum café cadastrado.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className={`card p-4 ${item.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gold-400/10 text-gold-400">
                  <DanteCoffeeIcon icon={item.icon} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-grape-50">{item.name}</h3>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-grape-200/60">#{item.sort_order}</span>
                  </div>
                  <p className="mt-1 text-xs text-grape-200/60">{item.description}</p>
                  <p className="mt-2 text-sm text-gold-400">{item.price_dantes} Dantes · +{formatCaffeine(item.caffeine_pct)} cafeína · Nota do Dante: {Number(item.dante_rating ?? 5)}/10</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                <label className="flex items-center gap-2 text-xs text-grape-200/70">
                  <input type="checkbox" checked={item.is_active} onChange={() => toggle(item)} /> No cardápio
                </label>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(item)} className="btn-ghost px-3 py-1.5 text-xs"><Pencil size={14} /> Editar</button>
                  <button onClick={() => remove(item)} className="rounded-full p-2 text-rose-300 hover:bg-rose-500/10" aria-label={`Excluir ${item.name}`}><Trash2 size={15} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar café' : 'Novo café'}>
        <div className="space-y-4">
          <div>
            <label className="label">Nome</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Descrição</label>
            <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Preço em Dantes</label>
              <input type="number" min="1" className="input" value={form.price_dantes} onChange={(e) => setForm({ ...form, price_dantes: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Cafeína (%)</label>
              <input type="number" min="0.01" step="0.01" className="input" value={form.caffeine_pct} onChange={(e) => setForm({ ...form, caffeine_pct: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Nota do Dante (0 a 10)</label>
              <input type="number" min="0" max="10" step="0.5" className="input" value={form.dante_rating} onChange={(e) => setForm({ ...form, dante_rating: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Ícone</label>
              <select className="input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}>
                <option value="coffee">Xícara</option>
                <option value="cup-soda">Copo</option>
                <option value="flame">Chama</option>
                <option value="zap">Raio</option>
              </select>
            </div>
            <div>
              <label className="label">Ordem</label>
              <input type="number" min="0" className="input" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-grape-200/70">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Disponível no cardápio
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="btn-ghost">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn-primary"><Coffee size={16} /> {saving ? 'Salvando...' : 'Salvar café'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
