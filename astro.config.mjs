// @ts-check
import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import pagefind from 'astro-pagefind';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	markdown: {
		remarkPlugins: [remarkMath],
		rehypePlugins: [rehypeKatex],
	},
	integrations: [pagefind()],
	vite: {
		plugins: [tailwindcss()],
	},
});