#!/usr/bin/env node
/**
 * WordPress WXR → Astro migration script for Financiële Begrippen
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';
import https from 'node:https';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndown.keep(['iframe']);
const XML_PATH = path.join(ROOT, 'financilebegrippen.WordPress.2026-07-03.xml');
const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog');
const PAGES_DIR = path.join(ROOT, 'src', 'pages');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SITE_URL = 'https://financielebegrippen.com';

function extractCdata(block, tag) {
  const re = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

function extractPlain(block, tag) {
  const re = new RegExp(`<${tag}>([^<]*)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function extractCategories(block) {
  const categories = [];
  const tags = [];
  const re = /<category domain="([^"]+)" nicename="([^"]+)"><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const [, domain, , name] = m;
    if (domain === 'category') categories.push(name);
    else if (domain === 'post_tag') tags.push(name);
  }
  return { categories, tags };
}

function extractPostMeta(block) {
  const meta = {};
  const re = /<wp:postmeta>\s*<wp:meta_key><!\[CDATA\[([\s\S]*?)\]\]><\/wp:meta_key>\s*<wp:meta_value><!\[CDATA\[([\s\S]*?)\]\]><\/wp:meta_value>\s*<\/wp:postmeta>/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    meta[m[1]] = m[2];
  }
  return meta;
}

function sanitizeSlug(slug) {
  let s = slug;
  try {
    s = decodeURIComponent(slug);
  } catch {
    s = slug;
  }
  return s
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[^\w\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function yamlString(value) {
  if (value == null || value === '') return '""';
  const s = String(value);
  if (/[:#\[\]{}|>&*!%@`,]/.test(s) || s.includes('\n') || s.includes('"')) {
    return JSON.stringify(s);
  }
  return `"${s}"`;
}

function yamlArray(arr) {
  if (!arr || arr.length === 0) return '[]';
  return `[${arr.map((v) => yamlString(v)).join(', ')}]`;
}

function rewriteUrls(content) {
  if (!content) return '';
  return content
    .replace(/https?:\/\/financielebegrippen\.com\/wp-content\//g, '/wp-content/')
    .replace(/https?:\/\/financielebegrippen\.com\//g, '/')
    .replace(/https?:\/\/www\.financielebegrippen\.com\//g, '/');
}

function stripShortcodes(content) {
  return content
    .replace(/\[zb_mp[^\]]*\]/g, '')
    .replace(/\[elementor[^\]]*\]/g, '')
    .replace(/\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/g, '$1');
}

function escapeMdx(text) {
  return text.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function contentToBody(raw) {
  let content = rewriteUrls(stripShortcodes(raw)).trim();
  if (!content) return '';
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);
  if (!hasHtml) {
    return escapeMdx(
      content
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .join('\n\n')
    );
  }
  try {
    return escapeMdx(turndown.turndown(content));
  } catch {
    return escapeMdx(content.replace(/<[^>]+>/g, ''));
  }
}

function parseItems(xml) {
  return xml.split('<item>').slice(1).map((chunk) => {
    const block = chunk.split('</item>')[0];
    return {
      title: extractCdata(block, 'title'),
      content: extractCdata(block, 'content:encoded'),
      excerpt: extractCdata(block, 'excerpt:encoded'),
      postId: extractPlain(block, 'wp:post_id'),
      postDate: extractCdata(block, 'wp:post_date'),
      postModified: extractCdata(block, 'wp:post_modified'),
      postName: extractCdata(block, 'wp:post_name'),
      status: extractCdata(block, 'wp:status'),
      postType: extractCdata(block, 'wp:post_type'),
      postParent: extractPlain(block, 'wp:post_parent'),
      menuOrder: extractPlain(block, 'wp:menu_order'),
      creator: extractCdata(block, 'dc:creator'),
      link: extractCdata(block, 'link') || '',
      ...extractCategories(block),
      meta: extractPostMeta(block),
      raw: block,
    };
  });
}

function parseAuthors(xml) {
  const authors = {};
  const re = /<wp:author>[\s\S]*?<wp:author_id>(\d+)<\/wp:author_id>[\s\S]*?<wp:author_login><!\[CDATA\[([\s\S]*?)\]\]><\/wp:author_login>[\s\S]*?<wp:author_display_name><!\[CDATA\[([\s\S]*?)\]\]><\/wp:author_display_name>[\s\S]*?<\/wp:author>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    authors[m[1]] = { login: m[2], displayName: m[3] };
  }
  return authors;
}

function parseCategoryMap(xml) {
  const map = {};
  const re1 = /<wp:category>[\s\S]*?<wp:term_id>(\d+)<\/wp:term_id>[\s\S]*?<wp:category_nicename><!\[CDATA\[([\s\S]*?)\]\]><\/wp:category_nicename>[\s\S]*?<wp:cat_name><!\[CDATA\[([\s\S]*?)\]\]><\/wp:cat_name>[\s\S]*?<\/wp:category>/g;
  let m;
  while ((m = re1.exec(xml)) !== null) {
    map[m[1]] = { slug: m[2], name: m[3] };
  }
  const re2 = /<wp:term><wp:term_id>(\d+)<\/wp:term_id><wp:term_taxonomy>category<\/wp:term_taxonomy><wp:term_slug><!\[CDATA\[([\s\S]*?)\]\]><\/wp:term_slug><wp:term_name><!\[CDATA\[([\s\S]*?)\]\]><\/wp:term_name>/g;
  while ((m = re2.exec(xml)) !== null) {
    map[m[1]] = { slug: m[2], name: m[3] };
  }
  return map;
}

function buildPagePath(page, pageById) {
  const segments = [];
  let current = page;
  const visited = new Set();
  while (current) {
    if (visited.has(current.postId)) break;
    visited.add(current.postId);
    if (current.postName) segments.unshift(current.postName);
    const parentId = current.postParent;
    current = parentId && parentId !== '0' ? pageById[parentId] : null;
  }
  return segments.join('/');
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
    parent: get('_menu_item_menu_item_parent'),
    objectId: get('_menu_item_object_id'),
    object: get('_menu_item_object'),
    url: get('_menu_item_url'),
    menu: (block.match(/domain="nav_menu" nicename="([^"]+)"/) || [])[1] || '',
  };
}

function resolveMenuUrl(item, pageById, postById, categoryMap) {
  if (item.url) {
    return rewriteUrls(item.url).replace(/\/$/, '') || '/';
  }
  if (item.object === 'page' && pageById[item.objectId]) {
    return '/' + buildPagePath(pageById[item.objectId], pageById);
  }
  if (item.object === 'post' && postById[item.objectId]) {
    return '/' + postById[item.objectId].postName;
  }
  if (item.object === 'category' && categoryMap[item.objectId]) {
    return '/category/' + categoryMap[item.objectId].slug;
  }
  if (item.object === 'custom' && item.url) {
    return rewriteUrls(item.url);
  }
  return '#';
}

function downloadFile(url, dest) {
  return new Promise((resolve) => {
    if (fs.existsSync(dest)) {
      resolve(true);
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest).then(resolve);
        return;
      }
      if (res.statusCode !== 200) {
        resolve(false);
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(true);
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function downloadMedia(content, attachmentMap, stats) {
  const urls = new Set();
  const re = /https?:\/\/financielebegrippen\.com\/wp-content\/uploads\/[^\s"'<>]+/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    urls.add(m[0].replace(/&amp;/g, '&'));
  }
  for (const att of Object.values(attachmentMap)) {
    if (att.url) urls.add(att.url);
  }

  const batch = [...urls];
  for (let i = 0; i < batch.length; i += 10) {
    const chunk = batch.slice(i, i + 10);
    await Promise.all(
      chunk.map(async (url) => {
        const rel = url.replace(/^https?:\/\/financielebegrippen\.com/, '');
        const dest = path.join(PUBLIC_DIR, rel);
        const ok = await downloadFile(url, dest);
        if (ok) stats.downloaded++;
        else stats.failed++;
      })
    );
    if (i % 50 === 0) process.stdout.write(`\r  Media: ${Math.min(i + 10, batch.length)}/${batch.length}`);
  }
  console.log('');
}

function writeMdx(post, description, featuredImage) {
  const slug = sanitizeSlug(post.postName);
  if (!slug) return false;

  const pubDate = post.postDate && post.postDate !== '0000-00-00 00:00:00'
    ? post.postDate.replace(' ', 'T') + 'Z'
    : '2010-01-01T00:00:00Z';
  const updatedDate = post.postModified && post.postModified !== post.postDate
    ? post.postModified.replace(' ', 'T') + 'Z'
    : null;

  const lines = [
    '---',
    `title: ${yamlString(post.title.trim())}`,
    `description: ${yamlString(description)}`,
    `pubDate: ${yamlString(pubDate)}`,
  ];
  if (updatedDate) lines.push(`updatedDate: ${yamlString(updatedDate)}`);
  if (post.creator) lines.push(`author: ${yamlString(post.creator)}`);
  if (post.categories?.length) lines.push(`categories: ${yamlArray(post.categories)}`);
  if (post.tags?.length) lines.push(`tags: ${yamlArray(post.tags)}`);
  if (featuredImage) lines.push(`featuredImage: ${yamlString(featuredImage)}`);
  lines.push('---', '');

  const body = contentToBody(post.content);
  if (featuredImage && !body.includes(featuredImage)) {
  }
  lines.push(body);

  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return true;
}

function writePageAstro(page, pagePath, description, isHome = false) {
  const title = page.title.trim();
  const body = contentToBody(page.content);
  const destPath = isHome
    ? path.join(PAGES_DIR, 'index.astro')
    : path.join(PAGES_DIR, pagePath + '.astro');

  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  const depth = isHome ? 1 : (pagePath.includes('/') ? pagePath.split('/').length : 1);
  const layoutImport = `${'../'.repeat(depth)}layouts/PageLayout.astro`;

  const content = `---
import PageLayout from '${layoutImport}';

const title = ${JSON.stringify(title)};
const description = ${JSON.stringify(description)};
const htmlContent = ${JSON.stringify(body)};
---

<PageLayout title={title} description={description}>
  <div set:html={htmlContent} />
</PageLayout>
`;

  fs.writeFileSync(destPath, content, 'utf8');
}

async function main() {
  console.log('Reading WordPress export...');
  const xml = fs.readFileSync(XML_PATH, 'utf8');
  const items = parseItems(xml);
  const authors = parseAuthors(xml);
  const categoryMap = parseCategoryMap(xml);

  const posts = items.filter((i) => i.postType === 'post' && i.status === 'publish' && i.postName);
  const pages = items.filter((i) => i.postType === 'page' && i.status === 'publish' && i.postName);
  const attachments = items.filter((i) => i.postType === 'attachment');
  const navItems = items.filter((i) => i.postType === 'nav_menu_item' && i.status === 'publish');

  const pageById = Object.fromEntries(pages.map((p) => [p.postId, p]));
  const postById = Object.fromEntries(posts.map((p) => [p.postId, p]));

  const attachmentMap = {};
  for (const att of attachments) {
    const file = att.meta._wp_attached_file || '';
    const url = att.link || (file ? `${SITE_URL}/wp-content/uploads/${file}` : '');
    attachmentMap[att.postId] = { url, file, title: att.title, alt: att.title };
  }

  const pageSlugs = new Set(pages.map((p) => p.postName));
  const pagePaths = new Set(pages.map((p) => buildPagePath(p, pageById)));

  console.log(`Found ${posts.length} posts, ${pages.length} pages, ${attachments.length} attachments`);

  fs.rmSync(BLOG_DIR, { recursive: true, force: true });
  fs.mkdirSync(BLOG_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  let postCount = 0;
  let skippedConflicts = 0;
  for (const post of posts) {
    if (pageSlugs.has(post.postName)) {
      skippedConflicts++;
      continue;
    }
    const description =
      post.excerpt?.trim() ||
      post.meta._genesis_description?.trim() ||
      post.content.replace(/<[^>]+>/g, '').slice(0, 160).trim() ||
      post.title;
    let featuredImage = '';
    const thumbId = post.meta._thumbnail_id;
    if (thumbId && attachmentMap[thumbId]) {
      featuredImage = rewriteUrls(attachmentMap[thumbId].url);
    }
    if (writeMdx(post, description, featuredImage)) postCount++;
  }
  console.log(`Wrote ${postCount} blog MDX files (${skippedConflicts} skipped due to page slug conflicts)`);

  const homePage = pages.find((p) => p.postName === 'financiele-begrippen') || pages[0];
  for (const page of pages) {
    const pagePath = buildPagePath(page, pageById);
    const description =
      page.excerpt?.trim() ||
      page.meta._genesis_description?.trim() ||
      page.content.replace(/<[^>]+>/g, '').slice(0, 160).trim() ||
      page.title;
    const isHome = page.postId === homePage.postId;
    if (isHome) {
      writePageAstro(page, '', description, true);
    } else {
      writePageAstro(page, pagePath, description, false);
    }
  }
  console.log(`Wrote ${pages.length} page routes`);

  const menus = {};
  const menuItemById = {};
  for (const nav of navItems) {
    const meta = extractMenuMeta(nav.raw);
    const menuName = meta.menu || 'default';
    if (!menus[menuName]) menus[menuName] = [];
    const entry = {
      id: nav.postId,
      title: nav.title || '',
      parent: meta.parent,
      menuOrder: parseInt(nav.menuOrder, 10) || 0,
      ...meta,
      url: '',
    };
    if (!entry.title) {
      if (meta.object === 'category' && categoryMap[meta.objectId]) {
        entry.title = categoryMap[meta.objectId].name;
      } else if (meta.object === 'page' && pageById[meta.objectId]) {
        entry.title = pageById[meta.objectId].title;
      } else if (meta.object === 'post' && postById[meta.objectId]) {
        entry.title = postById[meta.objectId].title;
      } else if (meta.object === 'custom' && meta.url) {
        entry.title = meta.url.replace(/^https?:\/\/[^/]+/, '').replace(/\//g, ' ') || 'Link';
      }
    }
    entry.url = resolveMenuUrl(entry, pageById, postById, categoryMap);
    menuItemById[nav.postId] = entry;
    menus[menuName].push(entry);
  }

  function buildMenuTree(menuName) {
    const items = (menus[menuName] || []).sort((a, b) => a.menuOrder - b.menuOrder);
    const byId = Object.fromEntries(items.map((i) => [i.id, { ...i, children: [] }]));
    const roots = [];
    for (const item of items) {
      const node = byId[item.id];
      const parentId = item.parent;
      if (parentId && parentId !== '0' && byId[parentId]) {
        byId[parentId].children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  const navigation = {
    header: buildMenuTree('topmenu').length ? buildMenuTree('topmenu') : buildMenuTree('boven-menu'),
    footer: buildMenuTree('boven-menu'),
    categories: Object.values(categoryMap).filter((c) => /^[a-z]$/i.test(c.slug) && c.slug.length === 1),
  };

  fs.writeFileSync(path.join(DATA_DIR, 'navigation.json'), JSON.stringify(navigation, null, 2));

  const categoryPosts = {};
  for (const post of posts) {
    for (const cat of post.categories || []) {
      const catEntry = Object.values(categoryMap).find((c) => c.name === cat);
      const slug = catEntry?.slug || cat.toLowerCase();
      if (!categoryPosts[slug]) categoryPosts[slug] = [];
      categoryPosts[slug].push({ title: post.title.trim(), slug: post.postName });
    }
  }
  fs.writeFileSync(path.join(DATA_DIR, 'categories.json'), JSON.stringify(categoryPosts, null, 2));

  console.log('Downloading media assets...');
  const allContent = [...posts, ...pages].map((i) => i.content).join('\n');
  const mediaStats = { downloaded: 0, failed: 0 };
  await downloadMedia(allContent, attachmentMap, mediaStats);
  console.log(`Media: ${mediaStats.downloaded} downloaded, ${mediaStats.failed} failed`);

  const report = {
    posts: postCount,
    pages: pages.length,
    skippedConflicts,
    mediaDownloaded: mediaStats.downloaded,
    mediaFailed: mediaStats.failed,
    authors: Object.keys(authors).length,
    categories: Object.keys(categoryMap).length,
  };
  fs.writeFileSync(path.join(ROOT, 'migration-report.json'), JSON.stringify(report, null, 2));
  console.log('Migration complete:', report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
