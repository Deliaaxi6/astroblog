import { site, withBase } from '../lib/site';

const absoluteUrl = (path: string) => new URL(withBase(path), site.url).href;

export async function GET() {
	const body = `User-agent: *
Allow: ${withBase('/')}

Sitemap: ${absoluteUrl('/sitemap.xml')}
`;
	return new Response(body, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
}
