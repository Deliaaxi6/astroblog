// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import pagefind from 'astro-pagefind';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import rehypeArticleFigure from './src/plugins/rehype-article-figure.mjs';

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';

// https://astro.build/config
export default defineConfig({
	base: isGitHubPages ? '/astroblog' : '/',
	site: isGitHubPages ? 'https://deliaaxi6.github.io' : 'http://localhost:4321',
	markdown: {
		processor: unified({
			remarkPlugins: [remarkMath],
			rehypePlugins: [rehypeKatex, rehypeArticleFigure],
		}),
	},
	integrations: [mdx(), pagefind()],
	vite: {
		plugins: [tailwindcss()],
	},
});
