import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

/**
 * XML-sitemap. De site had er geen — /sitemap/ is een HTML-pagina die uit de
 * vastgelegde WordPress-sitemap komt en dus geen nieuw artikel bevat. Zonder
 * XML-sitemap heeft een pas gepubliceerd artikel niets waarlangs Google het
 * kan vinden.
 *
 * De routes komen uit de bronbestanden zelf, zodat een nieuwe pagina of een
 * nieuw artikel er automatisch in staat.
 */
const SITE = 'https://financielebegrippen.com';

/** Alleen de keys zijn nodig; de modules worden bewust niet geladen. */
const pageFiles = import.meta.glob('./**/*.astro');

function routeFromFile(file: string) {
  const path = file.replace(/^\.\//, '').replace(/\.astro$/, '');
  // Dynamische routes en de 404 horen niet in een sitemap.
  if (path.includes('[') || path === '404') return null;
  const route = path.replace(/(^|\/)index$/, '');
  return route ? `/${route}/` : '/';
}

export const GET: APIRoute = async () => {
  const entries = await getCollection('blog');

  const urls = new Map<string, string | undefined>();

  for (const file of Object.keys(pageFiles)) {
    const route = routeFromFile(file);
    if (route) urls.set(route, undefined);
  }

  for (const entry of entries) {
    const date = entry.data.updatedDate ?? entry.data.pubDate;
    urls.set(`/${entry.id}/`, date ? date.toISOString().slice(0, 10) : undefined);
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...[...urls.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([route, lastmod]) =>
        lastmod
          ? `  <url><loc>${SITE}${route}</loc><lastmod>${lastmod}</lastmod></url>`
          : `  <url><loc>${SITE}${route}</loc></url>`,
      ),
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
