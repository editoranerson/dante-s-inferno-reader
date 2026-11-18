import { useEffect, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { ImageUpload } from '@/components/ImageUpload';
import { fetchWallpapers, type ChatWallpaper, type WallpaperAccess } from '@/lib/wallpapers';

const LABEL: Record<WallpaperAccess, string> = { free: 'Livre', paid: 'Venda', admin: 'Só ADMIN' };

export function WallpapersAdmin() {
  const { toast } = useToast();
  const [items, setItems] = useState<ChatWallpaper[]>([]);
  const [form, setForm] = useState({ name: '', image_url: '', access: 'free' as WallpaperAccess, price_dantes: 0 });
  const load = () => fetchWallpapers(true).then(setItems);
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.image_url) return toast('Envie a imagem.', 'error');
    const { error } = await supabase.from('chat_wallpapers').insert({ ...form, price_dantes: form.access === 'paid' ? form.price_dantes : 0, sort_order: items.length });
    if (error) return toast('Erro ao salvar.', 'error');
    setForm({ name: '', image_url: '', access: 'free', price_dantes: 0 });
    toast('Papel de parede cadastrado!', 'success'); load();
  };
  const update = async (id: string, patch: Partial<ChatWallpaper>) => {
    await supabase.from('chat_wallpapers').update(patch).eq('id', id); load();
  };
  const remove = async (id: string) => {
    if (!confirm('Excluir este papel de parede?')) return;
    await supabase.from('chat_wallpapers').delete().eq('id', id); load();
  };
  const input = 'w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm text-grape-50';

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h2 className="font-display text-lg font-semibold text-grape-50">Novo papel de parede do chat</h2>
        <p className="text-xs text-grape-200/60">Tamanho sugerido: 1080×1920 px (vertical, 9:16).</p>
        <ImageUpload key={form.image_url || 'new'} folder="wallpapers" label="Imagem" currentUrl={form.image_url} onUploaded={(url) => setForm({ ...form, image_url: url })} />
        <input className={input} placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="flex gap-2">
          <select className={input} value={form.access} onChange={(e) => setForm({ ...form, access: e.target.value as WallpaperAccess })}>
            <option value="free">Livre (todo mundo tem)</option>
            <option value="paid">Venda (Dantes)</option>
            <option value="admin">Só ADMIN</option>
          </select>
          {form.access === 'paid' && (
            <input type="number" min={0} className={input} placeholder="Preço em Dantes" value={form.price_dantes} onChange={(e) => setForm({ ...form, price_dantes: Number(e.target.value) })} />
          )}
        </div>
        <button onClick={add} className="flex items-center gap-2 rounded-full bg-gradient-to-r from-grape-500 to-rose-500 px-4 py-2 text-sm font-semibold text-white"><Plus size={15} /> Cadastrar</button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((w) => (
          <div key={w.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <img src={w.image_url} alt={w.name} className={`aspect-[9/16] w-full object-cover ${w.is_active ? '' : 'opacity-40'}`} />
            <div className="space-y-2 p-2 text-xs text-grape-100">
              <div className="font-semibold">{w.name || 'Sem nome'}</div>
              <div>{LABEL[w.access]}{w.access === 'paid' ? ` · ${w.price_dantes} Dantes` : ''}</div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1"><input type="checkbox" checked={w.is_active} onChange={(e) => update(w.id, { is_active: e.target.checked })} /> Ativo</label>
                <button onClick={() => remove(w.id)} className="text-rose-300" aria-label="Excluir"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
