#!/usr/bin/env node
/**
 * Fail fast before wrangler deploy when REST-probe guards are missing.
 */
import { readFileSync, existsSync } from 'node:fs';

function fail(msg) {
  console.error(`\n[assert-deploy] BUILD ABORTED — ${msg}\n`);
  process.exit(1);
}

const wranglerPath = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].find((f) =>
  existsSync(f),
);
if (!wranglerPath) fail('missing wrangler.jsonc / wrangler.json / wrangler.toml');

const wrangler = readFileSync(wranglerPath, 'utf8');

if (/"routes"\s*:/.test(wrangler) || /^\s*routes\s*=/m.test(wrangler)) {
  fail('wrangler must not define custom-domain routes (Cloudflare dashboard owns domains)');
}

const hasWorkerFirst =
  /"run_worker_first"\s*:\s*true/.test(wrangler) || /run_worker_first\s*=\s*true/.test(wrangler);
if (!hasWorkerFirst) {
  fail(
    'wrangler must set run_worker_first: true so legacy WP REST probes ' +
      '(/wp-json, ?rest_route=) hit the worker — otherwise monitors report "REST API not found"',
  );
}

if (!existsSync('worker/index.js')) fail('missing worker/index.js');
const worker = readFileSync('worker/index.js', 'utf8');
if (!/isWordpressRest|wp-json|rest_route/.test(worker)) {
  fail('worker/index.js must handle legacy WordPress REST probe URLs');
}
if (!/status:\s*200/.test(worker) || !/namespaces/.test(worker)) {
  fail('worker/index.js must return a quiet 200 JSON stub for WP REST probes');
}

if (!existsSync('dist/404.html')) {
  fail('dist/404.html missing — run astro build first (needed for not_found_handling=404-page)');
}

const notFound = readFileSync('dist/404.html', 'utf8');
if (/REST API|wp-json/i.test(notFound)) {
  fail('dist/404.html must not mention REST API / wp-json (tools report that as the live error)');
}

console.log('[assert-deploy] OK — worker-first REST probes, quiet stub, soft 404.html');
