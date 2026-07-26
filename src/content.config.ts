import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const articles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/articles" }),
  schema: z.object({
    title: z.string(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    originalUrl: z.string().url(),
    readingTime: z.string().optional(),
    heroImage: z.string().optional(),
    excerpt: z.string(),
    metaDescription: z.string(),
    publishDate: z.string().optional(),
  }),
});

export const collections = { articles };
