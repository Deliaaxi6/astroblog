export function readingTime(body: string): number {
	const codeStripped = body.replace(/```[\s\S]*?```/g, '');
	const text = codeStripped
		.replace(/[#>*`\-_[\]()!|~<>]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
	const words = (text.match(/[a-zA-Z0-9]+/g) || []).length;
	const minutes = Math.ceil(cjk / 300 + words / 200);
	return Math.max(1, minutes);
}