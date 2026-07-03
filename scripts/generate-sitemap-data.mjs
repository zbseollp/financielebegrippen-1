#!/usr/bin/env node
/**
 * Generate sitemap data + custom post stub MDX files from WordPress XML
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const XML_PATH = path.join(ROOT, 'financilebegrippen.WordPress.2026-07-03.xml');
const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const PAGES_DIR = path.join(ROOT, 'src', 'pages');

function extractCdata(block, tag) {
  const re = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`);
  const m = block.match(re);
  return m ? m[1] : '';
}

function extractMenuMeta(block) {
  const get = (key) => {
    const re = new RegExp(
      `<wp:meta_key><!\\[CDATA\\[${key}\\]\\]><\\/wp:meta_key>\\s*<wp:meta_value><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/wp:meta_value>`
    );
    const m = block.match(re);
    return m ? m[1] : '';
  };
  return {
    type: get('_menu_item_type'),
    object: get('_menu_item_object'),
    url: get('_menu_item_url'),
    menu: (block.match(/domain="nav_menu" nicename="([^"]+)"/) || [])[1] || '',
  };
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseItems(xml) {
  return xml
    .split('<item>')
    .slice(1)
    .map((b) => '<item>' + b)
    .map((block) => ({
      title: extractCdata(block, 'title'),
      postName: extractCdata(block, 'wp:post_name'),
      postType: extractCdata(block, 'wp:post_type'),
      status: extractCdata(block, 'wp:status'),
      raw: block,
    }));
}

function getExistingSlugs() {
  const slugs = new Set();
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.mdx')) {
        const rel = path.relative(BLOG_DIR, full).replace(/\\/g, '/').replace(/\.mdx$/, '');
        slugs.add(rel);
      }
    }
  }
  walk(BLOG_DIR);
  return slugs;
}

function getStaticPageSlugs() {
  const slugs = new Set(['']);
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('[')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, prefix + entry.name + '/');
      } else if (entry.name.endsWith('.astro')) {
        const name = entry.name.replace(/\.astro$/, '');
        slugs.add((prefix + name).replace(/\/$/, ''));
      }
    }
  }
  walk(PAGES_DIR);
  return slugs;
}

function stubMdx(slug, title, kind) {
  const safeTitle = title.replace(/"/g, '\\"');
  let body = '';

  if (kind === 'vermogen') {
    const person = slug.replace(/^vermogen-van\//, '');
    const display = title || person.replace(/-/g, ' ');
    body = `# Vermogen van ${display}\n\nLees alles over het vermogen van ${display}.`;
  } else if (kind === 'euro') {
    const amount = slug.replace(/-euro-lenen$/, '');
    body = `# ${amount} euro lenen\n\nInformatie over het lenen van ${amount} euro.`;
  } else if (kind === 'achteraf') {
    const product = slug.replace(/-achteraf-betalen$/, '').replace(/-/g, ' ');
    body = `# Achteraf betalen ${product}\n\nInformatie over achteraf betalen voor ${product}.`;
  } else {
    body = `# ${title}\n\n`;
  }

  return `---
title: "${safeTitle}"
description: "${safeTitle}"
pubDate: 2024-01-01
categories: []
tags: []
draft: false
---

${body}
`;
}

function titleToCustomSlug(title) {
  const t = title.trim();
  const euroMatch = t.match(/^(\d+)\s+euro lenen$/i);
  if (euroMatch) return `${euroMatch[1]}-euro-lenen`;

  const achterafMatch = t.match(/^Achteraf betalen\s+(.+)$/i);
  if (achterafMatch) return `${slugify(achterafMatch[1])}-achteraf-betalen`;

  return `vermogen-van/${slugify(t)}`;
}

function parseSitemapMarkdown() {
  const mdPath = path.join(ROOT, 'uploads', 'sitemap-0.md');
  const altPath = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.cursor/projects/c-Users-arun-kumar-Documents-development-migration-financielebegrippen/uploads/sitemap-0.md'
  );
  const file = fs.existsSync(mdPath) ? mdPath : fs.existsSync(altPath) ? altPath : null;
  if (!file) return [];

  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let section = '';
  const titles = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      section = line.slice(3).trim();
      continue;
    }
    if (section !== 'Custom Posts') continue;
    if (line.startsWith('## ')) break;
    const m = line.match(/^\* (.+)/);
    if (m) titles.push(m[1].trim());
  }

  return titles.map((title) => {
    const slug = titleToCustomSlug(title);
    return { title, slug, href: `/${slug}/`, kind: classifySlug(slug) };
  });
}

function classifySlug(slug) {
  if (slug.startsWith('vermogen-van/')) return 'vermogen';
  if (slug.endsWith('-euro-lenen')) return 'euro';
  if (slug.endsWith('-achteraf-betalen')) return 'achteraf';
  return 'other';
}

function main() {
  const xml = fs.readFileSync(XML_PATH, 'utf8');
  const items = parseItems(xml);
  const pages = items.filter((i) => i.postType === 'page' && i.status === 'publish');
  const existingSlugs = getExistingSlugs();
  const staticPages = getStaticPageSlugs();

  const customFromNav = [];
  const seenCustom = new Set();

  for (const item of items) {
    if (item.postType !== 'nav_menu_item') continue;
    const meta = extractMenuMeta(item.raw);
    if (!meta.url || !meta.url.includes('financielebegrippen.com')) continue;
    const slug = meta.url.replace(/https?:\/\/[^/]+\//, '').replace(/\/$/, '');
    if (!slug || seenCustom.has(slug)) continue;
    seenCustom.add(slug);

    const kind = classifySlug(slug);
    if (kind === 'other') continue;

    const title =
      item.title && item.title !== slug
        ? item.title
        : slug
            .split('/')
            .pop()
            .replace(/-/g, ' ')
            .replace(/^\w/, (c) => c.toUpperCase());

    customFromNav.push({ title, slug, href: `/${slug}/`, kind });

    if (!existingSlugs.has(slug)) {
      const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, stubMdx(slug, title, kind));
      existingSlugs.add(slug);
    }
  }

  const customFromSitemap = parseSitemapMarkdown();
  const customPosts = [];
  const mergedCustom = new Map();

  for (const entry of [...customFromSitemap, ...customFromNav]) {
    if (!entry.slug || mergedCustom.has(entry.slug)) continue;
    mergedCustom.set(entry.slug, entry);
    customPosts.push(entry);

    if (!existingSlugs.has(entry.slug)) {
      const filePath = path.join(BLOG_DIR, `${entry.slug}.mdx`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, stubMdx(entry.slug, entry.title, entry.kind));
      existingSlugs.add(entry.slug);
    }
  }

  // Sitemap pages section — parse from markdown too
  const pageFromMd = [];
  {
    const mdPath = [
      path.join(ROOT, 'uploads', 'sitemap-0.md'),
      path.join(
        process.env.USERPROFILE || '',
        '.cursor/projects/c-Users-arun-kumar-Documents-development-migration-financielebegrippen/uploads/sitemap-0.md'
      ),
    ].find((p) => fs.existsSync(p));
    if (mdPath) {
      const lines = fs.readFileSync(mdPath, 'utf8').split('\n');
      let section = '';
      for (const line of lines) {
        if (line.startsWith('## ')) {
          section = line.slice(3).trim();
          continue;
        }
        if (section !== "Pagina's") continue;
        if (line.startsWith('## ')) break;
        const m = line.match(/^\* (.+)/);
        if (!m) continue;
        const title = m[1].trim();
        if (title === 'Home' || title === 'Financiële Begrippen') {
          pageFromMd.push({ title, href: '/' });
        } else {
          pageFromMd.push({ title, href: `/${slugify(title)}/` });
        }
      }
    }
  }

  // Sitemap pages section
  const pageEntries = pageFromMd.length
    ? pageFromMd.filter((p, i, arr) => arr.findIndex((x) => x.href === p.href) === i)
    : pages
        .filter((p) => p.postName !== 'financiele-begrippen' && p.postName !== 'home-new')
        .map((p) => ({
          title: p.title,
          href: `/${p.postName}/`,
        }))
        .concat([
          { title: 'Home', href: '/' },
          { title: 'Financiële Begrippen', href: '/' },
        ])
        .filter((p, i, arr) => arr.findIndex((x) => x.href === p.href) === i);

  // Map page titles from sitemap markdown to real routes
  const pageByTitle = new Map(
    pages.map((p) => [p.title.toLowerCase(), `/${p.postName}/`])
  );
  pageByTitle.set('home', '/');
  pageByTitle.set('financiële begrippen', '/');

  for (const page of pageEntries) {
    const mapped = pageByTitle.get(page.title.toLowerCase());
    if (mapped) {
      page.href = mapped;
      continue;
    }
    const key = page.href.replace(/^\/|\/$/g, '');
    if (staticPages.has(key)) {
      page.href = `/${key}/`;
    }
  }

  // Also add vertalen subpages from filesystem
  const excludePages = new Set([
    'aandelen-template',
    'achteraf-betalen-zb_mp_product',
    'zb_mp_naam',
    'zb_mp_bedrag-euro-lenen',
    'home-new',
    'financiele-begrippen',
  ]);

  for (const slug of staticPages) {
    if (!slug || slug === 'index') continue;
    if (excludePages.has(slug.split('/')[0])) continue;
    if (pageEntries.some((p) => p.href === `/${slug}/`)) continue;
    const title = slug
      .split('/')
      .pop()
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    pageEntries.push({ title, href: `/${slug}/` });
  }
  pageEntries.sort((a, b) => a.title.localeCompare(b.title, 'nl'));
  const filteredPages = pageEntries.filter((p) => {
    const slug = p.href.replace(/^\/|\/$/g, '');
    return !excludePages.has(slug.split('/')[0]);
  });

  const categories = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'categories.json'), 'utf8'));
  const categorySections = Object.keys(categories)
    .sort((a, b) => {
      if (a === '1') return -1;
      if (b === '1') return 1;
      return a.localeCompare(b);
    })
    .map((letter) => ({
      label: letter === '1' ? 'Categorie: 1' : `Categorie: ${letter.toUpperCase()}`,
      links: categories[letter]
        .map((p) => ({ title: p.title, href: `/${p.slug}/` }))
        .sort((a, b) => a.title.localeCompare(b.title, 'nl')),
    }));

  customPosts.sort((a, b) => a.title.localeCompare(b.title, 'nl'));

  const sitemapData = {
    pages: filteredPages,
    customPosts,
    categories: categorySections,
  };

  fs.writeFileSync(path.join(DATA_DIR, 'sitemap-data.json'), JSON.stringify(sitemapData, null, 2));
  console.log(`Custom post stubs: ${customPosts.length}`);
  console.log(`Pages: ${filteredPages.length}`);
  console.log(
    `Category links: ${categorySections.reduce((n, s) => n + s.links.length, 0)}`
  );
  console.log('Wrote src/data/sitemap-data.json');
}

main();
