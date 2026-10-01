import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async ({ site }) => {
  const recipes = await getCollection('recipes');
  const abs = (path: string) => new URL(path, site).href;
  const tags = [...new Set(recipes.flatMap((r) => r.data.tags))];
  const urls = [
    { loc: abs('/') },
    { loc: abs('/about/') },
    { loc: abs('/tags/') },
    ...tags.map((t) => ({ loc: abs(`/tags/${encodeURIComponent(t)}/`) })),
    ...recipes.map((r) => ({
      loc: abs(`/recipes/${r.id}/`),
      lastmod: r.data.publishedAt.toISOString().slice(0, 10),
    })),
  ];
  const body = urls
    .map((u) => `<url><loc>${u.loc}</loc>${'lastmod' in u ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
