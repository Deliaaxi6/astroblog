import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { site, withBase } from '../lib/site';

const absoluteUrl = (path: string) => new URL(withBase(path), site.url).href;

export async function GET(context: APIContext) {
	const posts = (await getCollection('blog')).filter((post) => !post.data.draft);

	const publicRoutes = [
		'/',
		'/blog',
		'/moments',
		'/photowall',
		'/friends',
		'/projects',
		'/timeline',
		'/about',
		'/tags',
	];
	const urls = publicRoutes
		.map(absoluteUrl)
		.concat(posts.map((post) => absoluteUrl(`/blog/${post.id}`)));

	const body = urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;

	return new Response(xml, {
		headers: { 'Content-Type': 'application/xml; charset=utf-8' },
	});
}
