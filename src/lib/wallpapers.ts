import { supabase } from '@/lib/supabase';

export type WallpaperAccess = 'free' | 'admin' | 'paid';
export interface ChatWallpaper {
  id: string; name: string; image_url: string; access: WallpaperAccess;
  price_dantes: number; is_active: boolean; sort_order: number;
}
const KEY = 'dante_chat_wallpaper';
export const getSelectedWallpaper = () => (typeof window === 'undefined' ? '' : localStorage.getItem(KEY) || '');
export const setSelectedWallpaper = (url: string) => {
  if (url) localStorage.setItem(KEY, url); else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('dante-wallpaper'));
};
export async function fetchWallpapers(all = false) {
  let q = supabase.from('chat_wallpapers').select('*').order('sort_order').order('created_at');
  if (!all) q = q.eq('is_active', true);
  const { data } = await q;
  return (data || []) as ChatWallpaper[];
}
export async function fetchOwnedWallpapers() {
  const { data } = await supabase.from('user_wallpapers').select('wallpaper_id');
  return new Set((data || []).map((r: { wallpaper_id: string }) => r.wallpaper_id));
}
