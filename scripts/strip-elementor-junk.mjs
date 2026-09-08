/**
 * Remove leaked Elementor CSS dumps from blog content.
 *
 *   node scripts/strip-elementor-junk.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BLOG_DIRS = [path.join(ROOT, 'src/content/blog'), path.join(ROOT, 'src/content/pages')];

function stripStyleDumps(text) {
  return String(text || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\/\*![\s\S]*?elementor[\s\S]*?\*\//gi, '');
}

function stripElementorCssAggressive(text) {
  let out = stripStyleDumps(text);
  out = out.replace(/\\([\\/*{}[\]])/g, '$1');
  out = out.replace(/\\?&#123;/g, '{').replace(/\\?&#125;/g, '}');
  out = out.replace(/\.elementor[^{]*\{[^}]*\}/gi, ' ');
  out = out
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/\/\*!.*elementor/i.test(t)) return false;
      if (/^\.elementor/.test(t) && t.includes('{')) return false;
      if (
        /\{[^}]*padding:|font-size:|margin:|display:flex|background-color:/.test(t) &&
        t.length > 80 &&
        /elementor/i.test(t)
      ) {
        return false;
      }
      return true;
    })
    .join('\n');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function isCssPolluted(text) {
  return (
    /\/\*![\s\S]*elementor/i.test(text || '') ||
    /<style\b[^>]*>[\s\S]*elementor/i.test(text || '') ||
    /\.elementor-heading-title\s*\{/.test(text || '')
  );
}

function parseFile(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  return { fm: match[1], body: match[2] };
}

function getTitle(fm) {
  const m = fm.match(/^title:\s*"(.*)"\s*$/m) || fm.match(/^title:\s*'(.*)'\s*$/m);
  return m ? m[1] : '';
}

function stripMarkdown(text) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_`~|-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function setTextField(fm, field, value) {
  const safe = JSON.stringify(String(value).slice(0, 220));
  const re = new RegExp(
    `^${field}:\\s*(?:"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|[^\\n]*)$`,
    'm',
  );
  if (re.test(fm)) return fm.replace(re, `${field}: ${safe}`);
  return `${field}: ${safe}\n${fm}`;
}

function cleanFrontmatterTextFields(fm, fallbackDesc) {
  let out = fm;
  for (const field of ['description', 'excerpt', 'metaDescription', 'metaTitle']) {
    const m = out.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'));
    if (!m) continue;
    if (!isCssPolluted(m[1])) continue;
    const cleaned = stripElementorCssAggressive(m[1].replace(/^["']|["']$/g, ''));
    const next =
      (cleaned && !isCssPolluted(cleaned) ? stripMarkdown(cleaned) : '') ||
      fallbackDesc ||
      'Artikel op FinancieleBegrippen.com';
    out = setTextField(out, field, next);
  }
  return out;
}

async function walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(p)));
    else if (/\.mdx?$/i.test(e.name)) files.push(p);
  }
  return files;
}

async function fixDir(dir) {
  let fixed = 0;
  for (const filePath of await walk(dir)) {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = parseFile(content);
    if (!parsed) continue;

    const polluted = isCssPolluted(parsed.fm) || isCssPolluted(parsed.body);
    if (!polluted) continue;

    const title = getTitle(parsed.fm);
    let body = stripElementorCssAggressive(parsed.body);
    body = body.replace(
      /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi,
      (block) =>
        /document\s*\.\s*write|eval\s*\(\s*atob|adsbygoogle|window\s*\.\s*location/i.test(block)
          ? ''
          : block,
    );

    const descSource = stripMarkdown(body);
    const desc =
      (title && descSource.startsWith(title)
        ? descSource.slice(title.length).trim()
        : descSource
      ).slice(0, 220) ||
      title ||
      'Artikel op FinancieleBegrippen.com';

    const fm = cleanFrontmatterTextFields(parsed.fm, desc);
    const next = `---\n${fm}\n---\n\n${body.trim()}\n`;
    if (next !== content) {
      await fs.writeFile(filePath, next, 'utf8');
      fixed += 1;
      console.log(`fixed ${path.relative(ROOT, filePath)}`);
    }
  }
  return fixed;
}

let total = 0;
for (const dir of BLOG_DIRS) {
  total += await fixDir(dir);
}
console.log(`\nDone. Cleaned ${total} file(s).`);
