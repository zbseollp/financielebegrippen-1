#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HP = path.join(ROOT, 'src', 'components', 'homepage');

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
    .replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');
}

function fixCssFiles() {
  const dirs = [
    path.join(ROOT, 'public', 'css', 'homepage'),
    path.join(ROOT, 'public', 'wp-content', 'uploads', 'elementor', 'css'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.css')) continue;
      const p = path.join(dir, file);
      let css = fs.readFileSync(p, 'utf8');
      css = css.replace(/https?:\/\/financielebegrippen\.com\//g, '/');
      css = css.replace(
        /url\(\.\.\/[^)]*\/plugins\/elementor\/assets\/lib\/eicons\/fonts\/eicons\.woff2[^)]*\)/g,
        "url('/css/homepage/eicons.woff2')"
      );
      css = css.replace(
        /url\(\.\.\/[^)]*\/plugins\/elementor\/assets\/lib\/font-awesome\/webfonts\/fa-solid-900\.woff2[^)]*\)/g,
        "url('/css/homepage/fa-solid-900.woff2')"
      );
      css = css.replace(
        /url\(\.\.\/[^)]*\/plugins\/elementor\/assets\/lib\/font-awesome\/webfonts\/fa-brands-400\.woff2[^)]*\)/g,
        "url('/css/homepage/fa-brands-400.woff2')"
      );
      css = css.replace(
        /url\(\.\.\/webfonts\/fa-regular-400\.woff2\)/g,
        "url('/css/homepage/fa-regular-400.woff2')"
      );
      css = css.replace(
        /url\(\.\.\/[^)]*fa-regular-400\.woff2[^)]*\)/g,
        "url('/css/homepage/fa-regular-400.woff2')"
      );
      fs.writeFileSync(p, css);
    }
  }
}

function reextract() {
  const html = fs.readFileSync(path.join(ROOT, 'scripts', 'homepage.html'), 'utf8');
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];

  const headerStart = body.search(/<header[^>]*elementor-location-header/);
  const mainStart = body.search(/<div[^>]*data-elementor-id="4479"/);
  const footerStart = body.search(/<footer[^>]*elementor-location-footer/);

  let header = headerStart >= 0 && mainStart > headerStart
    ? body.slice(headerStart, mainStart)
    : '';
  let main = mainStart >= 0 && footerStart > mainStart
    ? body.slice(mainStart, footerStart)
    : '';
  let footer = footerStart >= 0 ? body.slice(footerStart) : '';

  const scriptIdx = footer.indexOf('<script');
  if (scriptIdx > -1) footer = footer.slice(0, scriptIdx);
  const closeFooter = footer.lastIndexOf('</footer>');
  if (closeFooter > -1) footer = footer.slice(0, closeFooter + 9);

  header = postProcessHtml(header);
  main = postProcessHtml(main);
  footer = postProcessHtml(footer);

  fs.writeFileSync(path.join(HP, 'header.html'), header.trim());
  fs.writeFileSync(path.join(HP, 'main.html'), main.trim());
  fs.writeFileSync(path.join(HP, 'footer.html'), footer.trim());
  console.log('Extracted:', header.length, main.length, footer.length, 'chars');
}

reextract();
fixCssFiles();
console.log('Done');
