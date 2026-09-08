#!/usr/bin/env node
/**
 * Flag hard-spam posts as drafts; REPORT celebrity gossip / casino spam without
 * touching it by default.
 *
 * IMPORTANT: prepare:blog must NEVER pass --apply-offtopic — that auto-drafts
 * posts every build and takes articles offline.
 *
 * Patterns are tuned for a finance glossary site: do NOT flag legitimate
 * vermogen / partnerschap / relatieve-sterkte content.
 *
 *   node scripts/remove-spam-blog.mjs
 *   node scripts/remove-spam-blog.mjs --dry-run
 *   node scripts/remove-spam-blog.mjs --apply-offtopic   # manual only!
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { BLOG_DIR, exists, listBlogFiles, readField, readPost } from './lib/blog-files.mjs';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const applyOffTopic = args.has('--apply-offtopic');

const INJECTION_PATTERNS = [
  /document\s*\.\s*write\s*\(/i,
  /\beval\s*\(\s*atob\s*\(/i,
  /\bunescape\s*\(\s*["']%(?:3C|64)/i,
  /window\s*\.\s*location\s*(?:\.\s*(?:href|replace)\s*[=(]|\s*=)/i,
  /<meta[^>]+http-equiv=["']?refresh["']?[^>]*url=/i,
];

/** Celebrity gossip / casino — not finance glossary topics. */
const OFF_TOPIC_TITLE_PATTERNS = [
  /\bvriendin\b/i,
  /\bvriend van\b/i,
  /\bbeste vriend\b/i,
  /\bgetrouwd\b/i,
  /\brelatiestatus\b/i,
  /\bex-partner\b/i,
  /\bzwanger\b/i,
  /\bpriveleven\b/i,
  /\bliefdesleven\b/i,
  /\bhuwelijkspartner\b/i,
  /\bwie is de partner\b/i,
  /\b(?:en )?haar partner\b/i,
  /\b(?:en )?zijn partner\b/i,
  /\bpartner van\b/i,
  /\bde relatie van\b/i,
  /\bleeftijd overleden\b/i,
  /\bleeftijd wikipedia\b/i,
  /-(?:partner|vriendin|vriend)(?:-|$)/i,
  /(?:^|-)leeftijd(?:-|$)/i,
  /^leeftijd-/i,
  /\bonline casino\b/i,
  /\bcasino betaald\b/i,
  /\bsportweddenschappen\b/i,
];

/** Keep intentional finance / glossary / net-worth catalog content. */
const FINANCE_KEEP = [
  /(?:^|\/)vermogen-van(?:\/|-|$)/i,
  /\beigen[- ]vermogen\b/i,
  /\bbedrijfsgebonden[- ]vermogen\b/i,
  /\bgeregistreerd[- ]partnerschap\b/i,
  /\brelatieve[- ]sterkte\b/i,
  /\bvo2[- ]max\b/i,
  /\bpartnerschap\b/i,
  /\bpsychologie van risico\b/i,
  /\bkansberekening\b/i,
  /\bgokbedrijven\b/i,
];

function isFinanceKeep(slug, title) {
  const hay = `${slug} ${title}`;
  return FINANCE_KEEP.some((p) => p.test(hay) || p.test(slug));
}

if (!exists(BLOG_DIR)) {
  console.log(`[remove-spam-blog] no ${BLOG_DIR}/ — nothing to do`);
  process.exit(0);
}

const spam = [];
const offTopic = [];

for (const path of listBlogFiles()) {
  const post = readPost(path);
  const title = readField(post.frontmatter, 'title') ?? '';
  const haystack = `${post.slug}\n${title}\n${post.body}`;

  if (INJECTION_PATTERNS.some((p) => p.test(haystack))) {
    spam.push({ path, title, reason: 'injected script/redirect payload' });
    continue;
  }

  if (isFinanceKeep(post.slug, title)) continue;

  const label = `${post.slug.replace(/-/g, ' ')} ${title}`;
  if (OFF_TOPIC_TITLE_PATTERNS.some((p) => p.test(label) || p.test(post.slug))) {
    offTopic.push({ path, title });
  }
}

function markDraft(entry) {
  const raw = readFileSync(entry.path, 'utf8');
  if (/^_spam:/m.test(raw)) return false;
  if (/^draft:\s*(?:true|"true")\b/m.test(raw)) return false;
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return false;
  let fm = m[1].replace(/^draft:.*$/m, '').replace(/\n{2,}/g, '\n').trim();
  fm += `\ndraft: true\n_spam: ${JSON.stringify(entry.reason)}`;
  writeFileSync(entry.path, raw.replace(m[0], `---\n${fm}\n---`));
  return true;
}

for (const entry of spam) {
  if (dryRun) console.log(`[remove-spam-blog] would mark ${entry.path} (${entry.reason})`);
  else if (markDraft(entry)) {
    console.log(`[remove-spam-blog] marked draft: ${entry.path} (${entry.reason})`);
  }
}

if (offTopic.length > 0) {
  console.log(
    `[remove-spam-blog] ${offTopic.length} off-topic candidate(s) — report only` +
      (applyOffTopic ? '' : ' (pass --apply-offtopic manually to draft; never in prepare:blog)'),
  );
  for (const entry of offTopic.slice(0, 30)) console.log(`  · ${entry.path} — ${entry.title}`);
  if (offTopic.length > 30) console.log(`  … and ${offTopic.length - 30} more`);
  if (applyOffTopic && !dryRun) {
    for (const entry of offTopic) {
      if (markDraft({ ...entry, reason: 'off-topic' })) {
        console.log(`[remove-spam-blog] marked draft: ${entry.path} (off-topic)`);
      }
    }
  }
}

console.log(
  `[remove-spam-blog] ${spam.length} hard spam, ${offTopic.length} off-topic candidate(s)${dryRun ? ' (dry run)' : ''}`,
);
