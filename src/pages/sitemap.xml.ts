import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

const site = import.meta.env.SITE || 'http://localhost:4321';

export async function GET(context: APIContext) {
	const posts = (await getCollection('blog')).filter((post) => !post.data.draft);

	const urls = ['', 'blog', 'about']
		.map((path) => `${site}/${path}`)
		.concat(posts.map((post) => `${site}/blog/${post.id}`));

	const body = urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;

	return new Response(xml, {
		headers: { 'Content-Type': 'application/xml; charset=utf-8' },
	});
}