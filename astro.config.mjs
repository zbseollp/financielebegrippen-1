// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// https://astro.build/config
export default defineConfig({
  site: 'https://financielebegrippen.com',
  trailingSlash: 'always',
  integrations: [mdx()],
});
