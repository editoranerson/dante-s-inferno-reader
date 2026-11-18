import { createServerFn } from '@tanstack/react-start';

export type ChapterMeta = { title: string; description: string; image: string | null } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Busca dados públicos do capítulo para a prévia social (og:image etc.) no HTML do servidor. */
export const getChapterMeta = createServerFn({ method: 'GET' })
  .inputValidator((input: { slug: string }) => ({ slug: String(input.slug).slice(0, 200) }))
  .handler(async ({ data }): Promise<ChapterMeta> => {
    try {
      const url = process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'];
      const key =
        process.env['SUPABASE_PUBLISHABLE_KEY'] ||
        process.env['VITE_SUPABASE_ANON_KEY'] ||
        process.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
      if (!url || !key) return null;
      const field = UUID.test(data.slug) ? 'id' : 'slug';
      const q = `${url}/rest/v1/archived_chapters?select=title,chapter_number,body,cover_image_url&${field}=eq.${encodeURIComponent(data.slug)}&limit=1`;
      const headers: Record<string, string> = { apikey: key };
      if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
      const res = await fetch(q, { headers });
      if (!res.ok) return null;
      const rows = (await res.json()) as Array<{
        title: string;
        chapter_number: number;
        body: string;
        cover_image_url: string | null;
      }>;
      const ch = rows[0];
      if (!ch) return null;
      const clean = (ch.body || '').replace(/\[ANUNCIO[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
      const image = ch.cover_image_url
        ? new URL(ch.cover_image_url, `${url.replace(/\/$/, '')}/`).href
        : null;
      return {
        title: `${ch.title} — Capítulo ${ch.chapter_number} — Querido Dante`,
        description: clean.length > 155 ? `${clean.slice(0, 154).trimEnd()}…` : clean,
        image,
      };
    } catch {
      return null;
    }
  });
