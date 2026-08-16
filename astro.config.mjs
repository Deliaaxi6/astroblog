// @ts-check
import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import pagefind from 'astro-pagefind';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import rehypeArticleFigure from './src/plugins/rehype-article-figure.mjs';

// https://astro.build/config
export default defineConfig({
	markdown: {
		remarkPlugins: [remarkMath],
		rehypePlugins: [rehypeKatex, rehypeArticleFigure],
	},
	integrations: [mdx(), pagefind()],
	vite: {
		plugins: [tailwindcss()],
	},
});