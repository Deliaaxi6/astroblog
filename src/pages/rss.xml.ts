import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

const site = import.meta.env.SITE || 'http://localhost:4321';

function escapeXml(s: string): string {
	return s.replace(/[<>&'"]/g, (c) => {
		switch (c) {
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '&':
				return '&amp;';
			case "'":
				return '&apos;';
			case '"':
				return '&quot;';
			default:
				return c;
		}
	});
}

export async function GET(context: APIContext) {
	const posts = (await getCollection('blog'))
		.filter((post) => !post.data.draft)
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

	const items = posts
		.map((post) => {
			const link = `${site}/blog/${post.id}/`;
			return `  <item>
    <title>${escapeXml(post.data.title)}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <pubDate>${post.data.pubDate.toUTCString()}</pubDate>
    ${
		post.data.description
			? `<description>${escapeXml(post.data.description)}</description>`
			: ''
	}
  </item>`;
		})
		.join('\n');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>我的博客</title>
    <link>${site}</link>
    <description>用 Astro 构建的个人博客</description>
    <language>zh-cn</language>
    <atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

	return new Response(xml, {
		headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
	});
}