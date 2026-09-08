#!/usr/bin/env node
/**
 * Non-destructive cleanup: strip injected scripts; blank non-image image fields.
 * Does not rewrite unchanged files (avoids EOL noise).
 */
import { writeFileSync } from 'node:fs';
import { exists, listBlogFiles, readPost } from './lib/blog-files.mjs';

const CONTENT_DIRS = ['src/content/blog', 'src/content/pages'];
const IMAGE_FIELDS = ['featuredImage', 'heroImage', 'image', 'ogImage'];

const INJECTION_SCRIPT_RE =
  /document\s*\.\s*write\s*\(|eval\s*\(\s*atob\s*\(|window\s*\.\s*location|adsbygoogle|gformInitSpinner|wbcr_php_snippet/i;

function looksLikeNonImage(value) {
  if (!value) return false;
  const withoutQuery = value.split(/[?#]/)[0];
  if (/^https?:\/\/[^/]+\/?$/i.test(withoutQuery)) return true;
  if (withoutQuery.endsWith('/')) return true;
  return /\.(?:html?|php|aspx?|jsp|css|js|mjs|json|xml|pdf|zip)$/i.test(withoutQuery);
}

function needsQuoting(value) {
  return /^[-?:,[\]{}#&*!|>'"%@`]/.test(value) || /:\s/.test(value) || /\s#/.test(value);
}

function stripInjectedScripts(body) {
  return body
    .replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, (block) =>
      INJECTION_SCRIPT_RE.test(block) ? '' : block,
    )
    .replace(/^.*document\s*\.\s*write\s*\([\s\S]*?\).*$/gim, '')
    .replace(/\(adsbygoogle[\s\S]*?\)\.push\(\{[^}]*\}\);?/gi, '');
}

let changed = 0;

for (const dir of CONTENT_DIRS) {
  if (!exists(dir)) continue;
  for (const path of listBlogFiles(dir)) {
    const post = readPost(path);
    if (!post.hasFrontmatter) continue;

    let frontmatter = post.frontmatter;
    let body = stripInjectedScripts(post.body);

    for (const field of IMAGE_FIELDS) {
      frontmatter = frontmatter.replace(
        new RegExp(`^(${field}:[ \\t]*)([^\\n]*)(\\n|$)([ \\t]+\\S)?`, 'gm'),
        (match, head, rawValue, newline, nextIndented) => {
          const value = rawValue.trim();
          if (!value && nextIndented) return match;
          if (!value) return match;
          const unquoted = value.replace(/^["']|["']$/g, '');
          const stripped = unquoted.replace(/\s+\\?["'].*$/, '').trim();
          if (stripped === unquoted && !looksLikeNonImage(stripped)) return match;
          const next =
            !stripped || looksLikeNonImage(stripped)
              ? `${head}""`
              : needsQuoting(stripped)
                ? `${head}"${stripped}"`
                : `${head}${stripped}`;
          return `${next}${newline}${nextIndented ?? ''}`;
        },
      );
    }

    const eol = /\r\n/.test(post.raw) ? '\r\n' : '\n';
    const fm = frontmatter.replace(/\r\n/g, '\n').replace(/\n/g, eol);
    const bd = body.replace(/\r\n/g, '\n').replace(/\n/g, eol);
    const next = `---${eol}${fm}${eol}---${eol}${bd}`;
    const same = next.replace(/\r\n/g, '\n') === post.raw.replace(/\r\n/g, '\n');
    if (!same) {
      writeFileSync(path, next);
      changed += 1;
    }
  }
}

console.log(`[sanitize-blog] sanitized ${changed} file(s)`);
