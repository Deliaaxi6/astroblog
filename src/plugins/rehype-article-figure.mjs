/**
 * rehype-article-figure
 *
 * 将标准 markdown 图片语法自动转为文章插图结构：
 *   ![alt](url "caption")
 * → <figure class="article-figure" data-lightbox="true">
 *     <img src="url" alt="alt" loading="lazy" />
 *     <figcaption class="af-caption">caption</figcaption>
 *   </figure>
 *
 * 与 ArticleFigure.astro 组件输出完全一致的结构（灯箱脚本事件委托统一处理）。
 * 仅包裹 img，保留 Astro 对内容集合相对路径图片的原生解析。
 * 已存在的 figure.article-figure 不重复处理（MDX 组件式输出跳过）。
 */

function walk(node, parent, index) {
	if (node.tagName === 'figure' && Array.isArray(node.properties?.className) && node.properties.className.includes('article-figure')) {
		return;
	}
	if (node.tagName === 'img' && node.properties?.src) {
		const props = node.properties;
		const img = {
			type: 'element',
			tagName: 'img',
			properties: { ...props, title: undefined, loading: 'lazy', className: ['af-img'] },
			children: node.children || [],
		};
		const figure = {
			type: 'element',
			tagName: 'figure',
			properties: { className: ['article-figure'], dataLightbox: 'true' },
			children: [img],
		};
		if (props.title) {
			figure.children.push({
				type: 'element',
				tagName: 'figcaption',
				properties: { className: ['af-caption'] },
				children: [{ type: 'text', value: props.title }],
			});
		}
		parent.children[index] = figure;
		return;
	}
	if (Array.isArray(node.children)) {
		node.children.forEach((child, i) => walk(child, node, i));
	}
}

export default function rehypeArticleFigure() {
	return (tree) => {
		if (Array.isArray(tree.children)) {
			tree.children.forEach((child, i) => walk(child, tree, i));
		}
	};
}