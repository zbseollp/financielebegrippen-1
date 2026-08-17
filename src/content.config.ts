import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Payload YAML dump may emit unquoted numbers/bools (title: 10, categories: [1]). */
const asString = z.union([z.string(), z.number(), z.boolean()]).transform((value) => String(value));

const optionalString = z.preprocess(
  (value) => (value == null ? undefined : value),
  asString.optional(),
);

const stringList = z.preprocess((value) => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}, z.array(asString));

const optionalDate = z.preprocess(
  (value) => (value == null || value === '' ? undefined : value),
  z.coerce.date().optional(),
);

const blog = defineCollection({
  loader: glob({
    base: './src/content/blog',
    pattern: '**/*.{md,mdx}',
  }),
  schema: z.object({
    title: asString,
    description: asString,
    pubDate: z.coerce.date(),
    updatedDate: optionalDate,
    author: optionalString,
    categories: stringList.optional(),
    tags: stringList.optional(),
  }),
});

export const collections = { blog };
