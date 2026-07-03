#!/usr/bin/env node
/**
 * Import page content from the live site into blog MDX files.
 * Usage: node scripts/import-live-pages.mjs [slug...]
 *        node scripts/import-live-pages.mjs --nav-euro
 *        node scripts/import-live-pages.mjs --nav-achteraf
 *        node scripts/import-live-pages.mjs --all-custom
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog');
const SITE = 'https://financielebegrippen.com';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndown.keep(['details', 'summary']);

const NAV_EURO = [
  '150-euro-lenen', '300-euro-lenen', '750-euro-lenen', '1500-euro-lenen',
  '3500-euro-lenen', '15000-euro-lenen', '75000-euro-lenen', '150000-euro-lenen',
  '300000-euro-lenen', '600000-euro-lenen',
];

const NAV_ACHTERAF = [
  'tv-achteraf-betalen', 'auto-achteraf-betalen', 'matras-achteraf-betalen',
  'laptop-achteraf-betalen', 'bakfiets-achteraf-betalen', 'koelkast-achteraf-betalen',
  'vakantie-achteraf-betalen', 'hoekbank-achteraf-betalen', 'zwembad-achteraf-betalen',
  'gasfornuis-achteraf-betalen',
];

const NAV_VERMOGEN = [
  'peter-bosz', 'cees-engel', 'jan-van-halst', 'nyck-de-vries', 'achraf-hakimi',
  'michael-smith', 'dick-advocaat', 'kees-de-koning', 'sophie-kumpen', 'hezbollah-magomedov',
].map((s) => `vermogen-van/${s}`);

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 60000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchHtml(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

function cleanHtml(html) {
  return html
    .replace(/https?:\/\/financielebegrippen\.com/g, '')
    .replace(/https?:\/\/www\.financielebegrippen\.com/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<ol class="zbmp-breadcrumb"[\s\S]*?<\/ol>/gi, '')
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, '')
    .trim();
}

function extractContent(html) {
  const marker = 'elementor-widget-theme-post-content';
  const start = html.indexOf(marker);
  if (start === -1) return null;

  const containerStart = html.indexOf('elementor-widget-container', start);
  if (containerStart === -1) return null;

  const contentStart = html.indexOf('>', containerStart) + 1;
  const colEnd = html.indexOf('elementor-col-33', contentStart);
  if (colEnd === -1) return null;

  const slice = html.slice(contentStart, colEnd);
  const lastClose = slice.lastIndexOf('</div>');
  return cleanHtml(slice.slice(0, lastClose));
}

function escapeMdx(text) {
  return text.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function htmlToMarkdown(html) {
  return escapeMdx(
    turndown.turndown(html).replace(/\n{3,}/g, '\n\n').trim()
  );
}

function pageMeta(slug) {
  if (slug.endsWith('-euro-lenen')) {
    const amount = slug.replace(/-euro-lenen$/, '');
    return {
      title: amount,
      description: `${amount} euro lenen - Financiële Begrippen`,
      pubDate: '2024-02-29',
    };
  }
  if (slug.endsWith('-achteraf-betalen')) {
    const product = slug.replace(/-achteraf-betalen$/, '').replace(/-/g, ' ');
    const label = product.charAt(0).toUpperCase() + product.slice(1);
    return {
      title: label,
      description: `${label} achteraf betalen - Financiële Begrippen`,
      pubDate: '2024-02-29',
    };
  }
  if (slug.startsWith('vermogen-van/')) {
    const name = slug
      .slice('vermogen-van/'.length)
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return {
      title: name,
      description: `Vermogen van ${name} | Wat verdient ${name}`,
      pubDate: '2024-01-25',
    };
  }
  const title = slug.split('/').pop().replace(/-/g, ' ');
  return { title, description: title, pubDate: '2024-01-01' };
}

function toMdx(slug, markdown) {
  const { title, description, pubDate } = pageMeta(slug);
  return `---
title: "${title.replace(/"/g, '\\"')}"
description: "${description.replace(/"/g, '\\"')}"
pubDate: ${pubDate}
categories: []
tags: []
draft: false
---

${markdown}
`;
}

function mdxPath(slug) {
  const parts = slug.split('/');
  const file = `${parts.pop()}.mdx`;
  return path.join(BLOG_DIR, ...parts, file);
}

function listCustomStubs() {
  const slugs = [];
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const next = prefix ? `${prefix}/${entry.name}` : entry.name;
        walk(path.join(dir, entry.name), next);
        continue;
      }
      if (!entry.name.endsWith('.mdx')) continue;
      const slug = prefix ? `${prefix}/${entry.name.replace(/\.mdx$/, '')}` : entry.name.replace(/\.mdx$/, '');
      if (
        slug.endsWith('-euro-lenen') ||
        slug.endsWith('-achteraf-betalen') ||
        slug.startsWith('vermogen-van/')
      ) {
        const body = fs.readFileSync(path.join(dir, entry.name), 'utf8');
        const content = body.replace(/^---[\s\S]*?---\s*/, '');
        if (content.length < 800) slugs.push(slug);
      }
    }
  }
  walk(BLOG_DIR);
  return [...new Set(slugs)];
}

async function importSlug(slug) {
  const url = `${SITE}/${slug}/`;
  const html = await fetchHtml(url);
  const contentHtml = extractContent(html);
  if (!contentHtml) {
    console.log('✗', slug, 'no content');
    return false;
  }

  const markdown = htmlToMarkdown(contentHtml);
  const dest = mdxPath(slug);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, toMdx(slug, markdown));
  console.log('✓', slug, markdown.length, 'chars');
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  let slugs = [];

  if (args.includes('--nav-euro')) slugs = NAV_EURO;
  else if (args.includes('--nav-achteraf')) slugs = NAV_ACHTERAF;
  else if (args.includes('--nav-vermogen')) slugs = NAV_VERMOGEN;
  else if (args.includes('--all-custom')) slugs = listCustomStubs();
  else if (args.length) slugs = args.filter((a) => !a.startsWith('--'));
  else slugs = [...NAV_EURO, ...NAV_ACHTERAF];

  for (const slug of slugs) {
    try {
      await importSlug(slug);
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.log('✗', slug, err.message);
    }
  }
}

main();
