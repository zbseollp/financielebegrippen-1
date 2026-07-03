#!/usr/bin/env node
/**
 * Create stock footer pages (live URLs return 404; generate useful inner pages).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog');

const STOCKS = [
  { slug: 'aandelen-nike-kopen-of-niet', title: 'Nike, Inc.', exchange: 'NYSE', ticker: 'NKE' },
  { slug: 'aandelen-pfizer-kopen-of-niet', title: 'Pfizer Inc.', exchange: 'NYSE', ticker: 'PFE' },
  { slug: 'aandelen-netflix-kopen-of-niet', title: 'NetFlix Inc', exchange: 'NASDAQ', ticker: 'NFLX' },
  { slug: 'aandelen-walmart-kopen-of-niet', title: 'Walmart Inc', exchange: 'NYSE', ticker: 'WMT' },
  {
    slug: 'aandelen-conoco-phillips-kopen-of-niet',
    title: 'Conoco Phillips',
    exchange: 'NYSE',
    ticker: 'COP',
  },
  {
    slug: 'aandelen-mcdonald-s-kopen-of-niet',
    title: "McDonald's Corp",
    exchange: 'NYSE',
    ticker: 'MCD',
  },
  {
    slug: 'aandelen-booking-holdings-kopen-of-niet',
    title: 'Booking Holdings Inc',
    exchange: 'NASDAQ',
    ticker: 'BKNG',
  },
];

function toMdx({ slug, title, exchange, ticker }) {
  const exchangePath = exchange === 'NASDAQ' ? '/nasdaq/' : '/nyse/';
  return `---
title: "${title.replace(/"/g, '\\"')}"
description: "${title.replace(/"/g, '\\"')} aandelen kopen of niet? Lees meer over beleggen in ${title.replace(/"/g, '\\"')} op FinancieleBegrippen.com"
pubDate: 2023-06-15
categories: []
tags: ["aandelen", "beleggen"]
draft: false
---

## ${title} aandelen kopen of niet?

In de wereld van de [aandelenmarkt](/aandelenmarkt/) zijn grondige analyses belangrijk voordat je besluit te beleggen. ${title} (${ticker}) is een bekend aandeel dat verhandeld wordt op de [${exchange}](${exchangePath}).

Dit artikel is puur informatief en mag niet worden beschouwd als financieel advies. Beleggen brengt risico's met zich mee; je kunt je inleg verliezen.

## Waar vind je meer informatie?

*   [Aandeel](/aandeel/) – wat is een aandeel en hoe werkt beleggen?
*   [Aandelenanalyse](/aandelenanalyse/) – hoe analyseer je een bedrijf?
*   [Beleggen](/beleggen/) – alles over beleggen
*   [${exchange} overzicht](${exchangePath}) – beursinformatie

## Andere populaire aandelen

*   [Gewone aandelen](/gewone-aandelen/)
*   [Aandelen in portefeuille](/aandelen-in-portefeuille/)
*   [Aandelenoptie](/aandelenoptie/)
`;
}

for (const stock of STOCKS) {
  const dest = path.join(BLOG_DIR, `${stock.slug}.mdx`);
  fs.writeFileSync(dest, toMdx(stock));
  console.log('✓', stock.slug);
}

console.log('Done');
