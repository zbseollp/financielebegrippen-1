#!/usr/bin/env node
/**
 * Extract homepage HTML/CSS/assets from live site for pixel-perfect recreation
 */
import fs from 'node:fs';
import path from 'node:path';
import httpsMod from 'node:https';
import httpMod from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(__dirname, 'homepage.html');
const OUT_DIR = path.join(ROOT, 'src', 'components', 'homepage');
const PUBLIC_CSS = path.join(ROOT, 'public', 'css', 'homepage');
const SITE = 'https://financielebegrippen.com';

function downloadFile(url, dest) {
  return new Promise((resolve) => {
    if (fs.existsSync(dest)) return resolve(true);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const mod = url.startsWith('https') ? httpsMod : httpMod;
    mod.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest).then(resolve);
        return;
      }
      if (res.statusCode !== 200) return resolve(false);
      const f = fs.createWriteStream(dest);
      res.pipe(f);
      f.on('finish', () => { f.close(); resolve(true); });
    }).on('error', () => resolve(false));
  });
}

function rewriteUrls(html) {
  return html
    .replace(/https?:\/\/financielebegrippen\.com\/wp-content\//g, '/wp-content/')
    .replace(/https?:\/\/financielebegrippen\.com\//g, '/')
    .replace(/https?:\/\/www\.financielebegrippen\.com\//g, '/')
    .replace(/srcset="[^"]*"/g, (m) =>
      m.replace(/https?:\/\/financielebegrippen\.com/g, '')
    );
}

function extractSection(body, marker, endMarker) {
  const start = body.indexOf(marker);
  if (start === -1) return '';
  const end = endMarker ? body.indexOf(endMarker, start + marker.length) : body.length;
  return body.slice(start, end === -1 ? body.length : end);
}

async function main() {
  if (!fs.existsSync(HTML_PATH)) {
    console.error('Run: curl -sL https://financielebegrippen.com/ -o scripts/homepage.html');
    process.exit(1);
  }

  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : '';

  // Extract elementor sections
  const headerStart = body.indexOf('elementor-location-header');
  const pageStart = body.indexOf('elementor-4479');
  const footerStart = body.indexOf('elementor-location-footer');

  let headerHtml = '';
  let mainHtml = '';
  let footerHtml = '';

  if (headerStart > -1 && pageStart > -1) {
    headerHtml = body.slice(headerStart - 50, pageStart);
    const hOpen = headerHtml.indexOf('<div');
    headerHtml = headerHtml.slice(hOpen);
  }
  if (pageStart > -1 && footerStart > -1) {
    mainHtml = body.slice(pageStart - 50, footerStart);
    const mOpen = mainHtml.indexOf('<div');
    mainHtml = mainHtml.slice(mOpen);
  }
  if (footerStart > -1) {
    footerHtml = body.slice(footerStart - 50);
    const fOpen = footerHtml.indexOf('<div');
    footerHtml = footerHtml.slice(fOpen);
    // trim scripts at end
    const scriptIdx = footerHtml.indexOf('<script');
    if (scriptIdx > -1) footerHtml = footerHtml.slice(0, scriptIdx);
  }

  headerHtml = rewriteUrls(headerHtml);
  mainHtml = rewriteUrls(mainHtml);
  footerHtml = rewriteUrls(footerHtml);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'header.html'), headerHtml.trim());
  fs.writeFileSync(path.join(OUT_DIR, 'main.html'), mainHtml.trim());
  fs.writeFileSync(path.join(OUT_DIR, 'footer.html'), footerHtml.trim());

  // Extract CSS links from head
  const cssUrls = [
    ...html.matchAll(/href='(https:\/\/financielebegrippen\.com\/[^']+\.css[^']*)'/g),
    ...html.matchAll(/href="(https:\/\/financielebegrippen\.com\/[^"]+\.css[^"]*)"/g),
  ].map((m) => m[1].replace(/&amp;/g, '&'));

  const uniqueCss = [...new Set(cssUrls)];
  fs.mkdirSync(PUBLIC_CSS, { recursive: true });

  const cssFiles = [];
  for (const url of uniqueCss) {
    const filename = url.split('/').pop().split('?')[0];
    const dest = path.join(PUBLIC_CSS, filename);
    const ok = await downloadFile(url, dest);
    if (ok) cssFiles.push(`/css/homepage/${filename}`);
    console.log(ok ? '✓' : '✗', filename);
  }

  // Extract inline styles from head (elementor custom)
  const inlineStyles = [];
  for (const m of html.matchAll(/<style[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (m[2].length > 50) inlineStyles.push(`/* ${m[1]} */\n${m[2]}`);
  }
  fs.writeFileSync(path.join(PUBLIC_CSS, 'inline.css'), inlineStyles.join('\n\n'));

  // Download images referenced in homepage sections
  const allHtml = headerHtml + mainHtml + footerHtml;
  const imgUrls = [...allHtml.matchAll(/\/wp-content\/[^"'\s)]+\.(jpg|jpeg|png|gif|svg|webp)/gi)].map((m) => m[0]);
  const fullImgUrls = [...new Set(imgUrls)].map((p) => `${SITE}${p.startsWith('/') ? '' : '/'}${p}`);

  for (const url of fullImgUrls) {
    const rel = url.replace(SITE, '');
    const dest = path.join(ROOT, 'public', rel);
    await downloadFile(url, dest);
  }

  // Also download key homepage images
  const keyImages = [
    '/wp-content/uploads/2023/01/Group-21.jpg',
    '/wp-content/uploads/2023/01/Group-31.jpg',
    '/wp-content/uploads/2023/01/Group-41.jpg',
    '/wp-content/uploads/2023/01/rafiki.svg',
    '/wp-content/uploads/2023/01/rafiki-1.svg',
    '/wp-content/uploads/2023/01/fluent-emoji_money-bag.svg',
    '/wp-content/uploads/2023/01/fluent-emoji_handshake.svg',
    '/wp-content/uploads/2023/01/fluent-emoji_older-person-light.svg',
    '/wp-content/uploads/2023/01/fluent-emoji_shield.svg',
    '/wp-content/uploads/2023/01/fluent-emoji_balance-scale.svg',
    '/wp-content/uploads/2023/01/avatar-4ae8bd407d3d99dc76b7819939c0aa25.jpg',
    '/wp-content/uploads/2023/01/avatar-33ac63b4c90d263a04c089722bfb7a7d.jpg',
    '/wp-content/uploads/2023/01/avatar-06bc65690248f3701ceb5618686bfd5f.jpg',
    '/wp-content/uploads/2023/01/Group-4-1.svg',
    '/wp-content/uploads/2023/01/Ellipse-1.svg',
    '/wp-content/themes/woohoo/images/favicon.png',
  ];
  for (const rel of keyImages) {
    await downloadFile(`${SITE}${rel}`, path.join(ROOT, 'public', rel));
  }

  // Download elementor CSS for header, page, footer
  const elementorCss = [
    '/wp-content/uploads/elementor/css/post-4471.css',
    '/wp-content/uploads/elementor/css/post-4472.css',
    '/wp-content/uploads/elementor/css/post-4479.css',
    '/wp-content/uploads/elementor/css/post-4522.css',
  ];
  for (const rel of elementorCss) {
    const dest = path.join(ROOT, 'public', rel);
    await downloadFile(`${SITE}${rel}`, dest);
  }

  const webfonts = [
    '/wp-content/plugins/elementor/assets/lib/eicons/fonts/eicons.woff2',
    '/wp-content/plugins/elementor/assets/lib/font-awesome/webfonts/fa-brands-400.woff2',
    '/wp-content/plugins/elementor/assets/lib/font-awesome/webfonts/fa-solid-900.woff2',
  ];
  const fontNames = ['eicons.woff2', 'fa-brands-400.woff2', 'fa-solid-900.woff2'];
  for (let i = 0; i < webfonts.length; i++) {
    await downloadFile(`${SITE}${webfonts[i]}`, path.join(PUBLIC_CSS, fontNames[i]));
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'styles.json'),
    JSON.stringify({ cssFiles: [...cssFiles, '/css/homepage/inline.css'] }, null, 2)
  );

  console.log('\nExtracted:');
  console.log('  header:', headerHtml.length, 'chars');
  console.log('  main:', mainHtml.length, 'chars');
  console.log('  footer:', footerHtml.length, 'chars');
  console.log('  css files:', cssFiles.length);
}

main().catch(console.error);
