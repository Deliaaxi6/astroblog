import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
	loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		tags: z.array(z.string()).optional(),
		cover: z.string().optional(),
		draft: z.boolean().optional(),
	}),
});

const moments = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/moments' }),
	schema: z.object({
		date: z.coerce.date(),
		location: z.string().optional(),
		images: z.array(z.string()).optional(),
	}),
});

const albums = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/albums' }),
	schema: ({ image }) =>
		z.object({
			id: z.string(),
			title: z.string(),
			description: z.string().optional(),
			cover: image(),
			createdAt: z.string(),
			photos: z.array(image()).default([]),
		}),
});

export const collections = { blog, moments, albums };
