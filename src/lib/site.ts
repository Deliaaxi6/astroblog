export const site = {
	title: '我的博客',
	description: '用 Astro 构建的个人博客',
	url: import.meta.env.SITE || 'http://localhost:4321',
	authorName: '我的博客',
	avatarUrl: 'https://bu.dusays.com/2026/03/24/69c1e38b4c370.jpg',
	friendLinkApplyFormat: `名称：我的博客
链接：https://your-domain.com
头像：https://your-domain.com/favicon.svg
简介：用 Astro 构建的个人博客，记录技术、生活与思考。`,
	gitalk: {
		clientID: '',
		clientSecret: '',
		repo: '',
		owner: '',
		admin: [] as string[],
	},
};