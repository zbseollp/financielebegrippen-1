#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import httpsMod from 'node:https';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'src', 'components', 'pages');
const PUBLIC_CSS = path.join(ROOT, 'public', 'css', 'homepage');
const SITE = 'https://financielebegrippen.com';

const PAGES = ['contact', 'nasdaq', 'nyse'];

const EXTRA_CSS = [
  '/wp-content/uploads/elementor/css/post-36361.css',
  '/wp-content/uploads/elementor/css/post-4572.css',
  '/wp-content/plugins/elementor-pro/assets/css/widget-breadcrumbs.min.css',
  '/wp-content/plugins/elementor-pro/assets/css/widget-post-info.min.css',
  '/wp-content/plugins/elementor/assets/css/widget-icon-list.min.css',
  '/wp-content/plugins/elementor-pro/assets/css/widget-form.min.css',
  '/wp-content/plugins/elementor-pro/assets/css/widget-table-of-contents.min.css',
  '/wp-content/plugins/elementor/assets/css/widget-text-editor.min.css',
  '/wp-content/plugins/elementor/assets/lib/font-awesome/css/regular.min.css',
];

function postProcessHtml(html) {
  return html
    .replace(/https?:\/\/financielebegrippen\.com\//g, '/')
    .replace(/https?:\/\/www\.financielebegrippen\.com\//g, '/')
    .replace(/href="https:\/\/financielebegrippen\.com"/g, 'href="/"')
    .replace(
      /src="data:image\/svg\+xml[^"]*"([^>]*?)data-lazy-src="([^"]+)"/g,
      'src="$2"$1'
    )
    .replace(/\s*data-lazy-src="[^"]*"/g, '')
    .replace(/<noscript>[\s\S]*?<\/noscript>/gi, '')
    .replace(/\s*data-rocket-location-hash="[^"]*"/g, '');
}

function downloadFile(urlPath) {
  const url = urlPath.startsWith('http') ? urlPath : SITE + urlPath;
  const fileName = path.basename(urlPath.split('?')[0]);
  const dest = urlPath.includes('/uploads/elementor/')
    ? path.join(ROOT, 'public', urlPath.replace(/^\//, ''))
    : path.join(PUBLIC_CSS, fileName);

  return new Promise((resolve) => {
    if (fs.existsSync(dest)) return resolve(dest);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    httpsMod.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location).then(resolve);
        return;
      }
      if (res.statusCode !== 200) return resolve(null);
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let css = Buffer.concat(chunks).toString('utf8');
        css = css.replace(/https?:\/\/financielebegrippen\.com\//g, '/');
        fs.writeFileSync(dest, css);
        resolve(dest);
      });
    }).on('error', () => resolve(null));
  });
}

function extractMain(html) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '';
  const headerEnd = body.indexOf('</header>');
  const footerStart = body.indexOf('<footer');
  if (headerEnd === -1 || footerStart === -1) return '';
  return body.slice(headerEnd + 9, footerStart).trim();
}

async function fetchPage(slug) {
  const cache = path.join(SCRIPTS, `${slug}.html`);
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8');
  return new Promise((resolve, reject) => {
    httpsMod.get(`${SITE}/${slug}/`, { timeout: 60000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8');
        fs.writeFileSync(cache, html);
        resolve(html);
      });
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  for (const cssPath of EXTRA_CSS) {
    const dest = await downloadFile(cssPath);
    console.log(dest ? `CSS: ${path.basename(dest)}` : `Skip: ${cssPath}`);
  }

  for (const slug of PAGES) {
    const html = await fetchPage(slug);
    const main = postProcessHtml(extractMain(html));
    fs.writeFileSync(path.join(OUT, `${slug}.html`), main);
    console.log(`Page: ${slug} (${main.length} chars)`);
  }

  const innerStyles = [
    '/css/homepage/widget-heading.min.css',
    '/css/homepage/widget-posts.min.css',
    '/css/homepage/widget-breadcrumbs.min.css',
    '/css/homepage/widget-post-info.min.css',
    '/css/homepage/widget-icon-list.min.css',
    '/css/homepage/widget-form.min.css',
    '/css/homepage/widget-table-of-contents.min.css',
    '/css/homepage/widget-text-editor.min.css',
    '/css/homepage/regular.min.css',
    '/wp-content/uploads/elementor/css/post-36361.css',
    '/wp-content/uploads/elementor/css/post-4572.css',
    '/wp-content/uploads/elementor/css/post-4522.css',
  ];

  fs.writeFileSync(
    path.join(ROOT, 'src', 'data', 'inner-page-styles.json'),
    JSON.stringify(innerStyles, null, 2)
  );
  console.log('Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
