#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog');
const PAGES_DIR = path.join(ROOT, 'src', 'pages');
const XML_PATH = path.join(ROOT, 'financilebegrippen.WordPress.2026-07-03.xml');

function walkDist(dir, prefix = '') {
  const urls = new Set();
  if (!fs.existsSync(dir)) return urls;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      for (const u of walkDist(p, prefix + e.name + '/')) urls.add(u);
    } else if (e.name === 'index.html') {
      urls.add('/' + prefix);
    }
  }
  return urls;
}

function walkMdx(dir, prefix = '') {
  const slugs = [];
  if (!fs.existsSync(dir)) return slugs;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      slugs.push(...walkMdx(path.join(dir, e.name), rel));
    } else if (/\.(md|mdx)$/.test(e.name)) {
      slugs.push(rel.replace(/\.(md|mdx)$/, '').replace(/\\/g, '/'));
    }
  }
  return slugs;
}

function walkPages(dir, prefix = '') {
  const urls = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      urls.push(...walkPages(path.join(dir, e.name), rel));
    } else if (e.name.endsWith('.astro') && !e.name.startsWith('[')) {
      const slug = rel.replace(/\.astro$/, '').replace(/\\/g, '/');
      if (slug === 'index') urls.push(prefix ? `/${prefix}/` : '/');
      else if (slug.endsWith('/index')) urls.push(`/${slug.replace(/\/index$/, '')}/`);
      else urls.push(`/${slug}/`);
    }
  }
  return urls;
}

function extractCdata(block, tag) {
  const re = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`);
  const m = block.match(re);
  return m ? m[1] : '';
}

function wpPublishedSlugs() {
  const xml = fs.readFileSync(XML_PATH, 'utf8');
  const slugs = new Set();
  for (const block of xml.split('<item>').slice(1)) {
    const status = extractCdata(block, 'wp:status');
    const type = extractCdata(block, 'wp:post_type');
    const name = extractCdata(block, 'wp:post_name');
    if (status === 'publish' && (type === 'post' || type === 'page') && name) {
      slugs.add(name);
    }
  }
  return slugs;
}

function allRoutes() {
  const routes = new Set();
  for (const s of walkMdx(BLOG_DIR)) routes.add(`/${s}/`);
  for (const s of walkPages(PAGES_DIR)) routes.add(s);
  routes.add('/blog/');
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') routes.add(`/category/${letter}/`);
  return routes;
}

function scanBrokenLinks() {
  const routes = allRoutes();
  const broken = new Map();
  const re = /\]\((\/[^)#'?]+)\)|href=["'](\/[^"'#?]+)["']/g;

  function scanFile(file, text) {
    let m;
    while ((m = re.exec(text))) {
      let href = m[1] || m[2];
      if (href.startsWith('//')) continue;
      if (!href.endsWith('/')) href += '/';
      if (/^\/(css|js|wp-content|@|images|_astro)\//.test(href)) continue;
      if (/^\/\d{4}\/\d{2}\/\d{2}\/$/.test(href)) continue;
      if (!routes.has(href)) broken.set(href, (broken.get(href) || 0) + 1);
    }
  }

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(html|mdx?|astro|json)$/.test(e.name)) scanFile(p, fs.readFileSync(p, 'utf8'));
    }
  }
  walk(path.join(ROOT, 'src'));
  return [...broken.entries()].sort((a, b) => b[1] - a[1]);
}

const built = walkDist(DIST);
const mdxSlugs = new Set(walkMdx(BLOG_DIR).map((s) => `/${s}/`));
const staticPages = new Set(walkPages(PAGES_DIR));
const wpSlugs = wpPublishedSlugs();
const mdxIds = new Set(walkMdx(BLOG_DIR).map((s) => s.split('/').pop()));

const wpMissingMdx = [...wpSlugs].filter((s) => !mdxIds.has(s) && !staticPages.has(`/${s}/`));
const mdxNotBuilt = [...mdxSlugs].filter((u) => !built.has(u));
const staticNotBuilt = [...staticPages].filter((u) => !built.has(u));
if (staticNotBuilt.length) console.log('Static not built:', staticNotBuilt.join(', '));

const allExpected = new Set([...mdxSlugs, ...staticPages]);
const brokenLinkCounts = scanBrokenLinks();

console.log('=== Audit ===');
console.log('Built pages:', built.size);
console.log('MDX entries:', mdxSlugs.size);
console.log('Static pages:', staticPages.size);
console.log('WP published slugs:', wpSlugs.size);
console.log('');
console.log('WP slugs missing MDX/static:', wpMissingMdx.length);
if (wpMissingMdx.length) console.log(wpMissingMdx.slice(0, 30).join('\n'));
console.log('');
console.log('MDX not in dist:', mdxNotBuilt.length);
console.log('Static not in dist:', staticNotBuilt.length);
console.log('');
console.log('Broken internal links in src:', brokenLinkCounts.length);
if (brokenLinkCounts.length) {
  for (const [href, count] of brokenLinkCounts.slice(0, 60)) {
    console.log(`${count}x ${href}`);
  }
  if (brokenLinkCounts.length > 60) console.log(`... and ${brokenLinkCounts.length - 60} more`);
}

// Write broken links report
const stubs = [];
if (brokenLinkCounts.length) {
  fs.writeFileSync(
    path.join(ROOT, 'scripts', 'broken-links.json'),
    JSON.stringify(Object.fromEntries(brokenLinkCounts), null, 2)
  );
}
function walkStubs(dir, prefix = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) walkStubs(path.join(dir, e.name), rel);
    else if (e.name.endsWith('.mdx')) {
      const slug = rel.replace(/\.mdx$/, '').replace(/\\/g, '/');
      if (
        slug.endsWith('-euro-lenen') ||
        slug.endsWith('-achteraf-betalen') ||
        slug.startsWith('vermogen-van/')
      ) {
        const body = fs.readFileSync(path.join(dir, e.name), 'utf8');
        const content = body.replace(/^---[\s\S]*?---\s*/, '');
        if (content.length < 800) stubs.push({ slug, len: content.length });
      }
    }
  }
}
walkStubs(BLOG_DIR);
console.log('');
console.log('Thin custom pages (<800 chars):', stubs.length);
if (stubs.length) console.log(stubs.slice(0, 20).map((s) => `${s.slug} (${s.len})`).join('\n'));
