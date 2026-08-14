const site = import.meta.env.SITE || 'http://localhost:4321';

export async function GET() {
	const body = `User-agent: *
Allow: /

Sitemap: ${site}/sitemap.xml
`;
	return new Response(body, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
}