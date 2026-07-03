import type { CollectionEntry } from 'astro:content';

export interface HubLink {
  href: string;
  label: string;
}

export interface HubGroup {
  key: string;
  links: HubLink[];
}

type BlogEntry = CollectionEntry<'blog'>;

const EURO_DIGIT_ORDER = ['5', '1', '2', '6', '7', '3', '4', '8', '9', '0'];

const ACHTERAF_LABELS: Record<string, string> = {
  tv: 'TV',
  ipad: 'iPad',
  iphone: 'iPhone',
  macbook: 'Macbook',
  airpods: 'AirPods',
  'apple-watch': 'Apple Watch',
  'nintendo-switch': 'Nintendo Switch',
  'playstation-5': 'Playstation 5',
  xbox: 'Xbox',
  'e-bike': 'e-bike',
  bbq: 'BBQ',
  'game-pc': 'game PC',
};

function sortByLabel(links: HubLink[]) {
  return links.sort((a, b) => a.label.localeCompare(b.label, 'nl', { sensitivity: 'base' }));
}

function sortEuroAmounts(links: HubLink[]) {
  return links.sort(
    (a, b) => Number(a.label.replace(/\D/g, '')) - Number(b.label.replace(/\D/g, ''))
  );
}

function achterafLabel(slug: string, title: string) {
  const base = slug.replace(/-achteraf-betalen$/, '');
  if (ACHTERAF_LABELS[base]) return ACHTERAF_LABELS[base];
  if (title && title !== base) return title;
  return base
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function groupKeyFromLabel(label: string) {
  const first = label.trim().charAt(0);
  if (!first) return '#';
  return /[0-9]/.test(first) ? first : first.toUpperCase();
}

function toGroups(links: HubLink[], sortLinks: (links: HubLink[]) => HubLink[], keyOrder?: string[]) {
  const map = new Map<string, HubLink[]>();

  for (const link of links) {
    const key = groupKeyFromLabel(link.label);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(link);
  }

  const keys = keyOrder ?? [...map.keys()].sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));

  return keys
    .filter((key) => map.has(key))
    .map((key) => ({
      key,
      links: sortLinks(map.get(key)!),
    }));
}

export function groupEuroLenen(entries: BlogEntry[]): HubGroup[] {
  const links = entries
    .filter((entry) => entry.id.endsWith('-euro-lenen'))
    .map((entry) => ({
      href: `/${entry.id}/`,
      label: entry.data.title,
    }));

  return toGroups(links, sortEuroAmounts, EURO_DIGIT_ORDER);
}

export function groupAchterafBetalen(entries: BlogEntry[]): HubGroup[] {
  const links = entries
    .filter((entry) => entry.id.endsWith('-achteraf-betalen'))
    .map((entry) => ({
      href: `/${entry.id}/`,
      label: achterafLabel(entry.id, entry.data.title),
    }));

  return toGroups(links, sortByLabel);
}

export function groupVermogenVan(entries: BlogEntry[]): HubGroup[] {
  const links = entries
    .filter((entry) => entry.id.startsWith('vermogen-van/'))
    .map((entry) => ({
      href: `/${entry.id}/`,
      label: entry.data.title,
    }));

  return toGroups(links, sortByLabel);
}
