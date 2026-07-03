#!/usr/bin/env node
/**
 * Import vermogen-van page content from the live site into MDX files.
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog', 'vermogen-van');
const SITE = 'https://financielebegrippen.com';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndown.keep(['details', 'summary']);

const NAV_SLUGS = [
  'peter-bosz',
  'cees-engel',
  'jan-van-halst',
  'nyck-de-vries',
  'achraf-hakimi',
  'michael-smith',
  'dick-advocaat',
  'kees-de-koning',
  'sophie-kumpen',
  'hezbollah-magomedov',
];

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 60000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchHtml(res.headers.location).then(resolve).catch(reject);
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
  const md = turndown.turndown(html)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return escapeMdx(md);
}

function titleCase(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function toMdx(slug, markdown) {
  const name = titleCase(slug);
  const description = `Vermogen van ${name} | Wat verdient ${name}`;
  return `---
title: "${name}"
description: "${description}"
pubDate: 2024-01-25
categories: []
tags: []
draft: false
---

${markdown}
`;
}

async function importSlug(slug) {
  const url = `${SITE}/vermogen-van/${slug}/`;
  const html = await fetchHtml(url);
  const contentHtml = extractContent(html);
  if (!contentHtml) {
    console.log('✗', slug, 'no content found');
    return false;
  }

  const markdown = htmlToMarkdown(contentHtml);
  const dest = path.join(BLOG_DIR, `${slug}.mdx`);
  fs.mkdirSync(BLOG_DIR, { recursive: true });
  fs.writeFileSync(dest, toMdx(slug, markdown));
  console.log('✓', slug, markdown.length, 'chars md');
  return true;
}

async function main() {
  const slugs = process.argv.length > 2 ? process.argv.slice(2) : NAV_SLUGS;
  for (const slug of slugs) {
    try {
      await importSlug(slug);
    } catch (err) {
      console.log('✗', slug, err.message);
    }
  }
}

main();
