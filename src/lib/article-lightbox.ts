/**
 * article-lightbox · 文章插图灯箱（公共模块）
 *
 * 由 ArticleFigure 组件与文章详情页（[...slug].astro）共同引入，
 * Vite 构建自动去重；window 全局标记保证即使多份拷贝也只注册一次监听。
 */

interface LightboxWindow extends Window {
	__afLightboxInited?: boolean;
}

export function initArticleLightbox(): void {
	const w = window as unknown as LightboxWindow;
	if (w.__afLightboxInited) return;
	w.__afLightboxInited = true;

	function openLightbox(img: HTMLImageElement): void {
		const overlay = document.createElement('div');
		overlay.className = 'af-lightbox';
		const photo = document.createElement('img');
		photo.src = img.currentSrc || img.src;
		photo.alt = img.alt || '';
		overlay.appendChild(photo);
		const close = (): void => overlay.remove();
		overlay.addEventListener('click', close);
		document.addEventListener(
			'keydown',
			function handler(e: KeyboardEvent) {
				if (e.key === 'Escape') {
					close();
					document.removeEventListener('keydown', handler);
				}
			}
		);
		document.body.appendChild(overlay);
	}

	document.addEventListener('click', (e) => {
		const target = e.target;
		if (!(target instanceof Element)) return;
		const figure = target.closest('figure.article-figure');
		if (!figure) return;
		if (figure.getAttribute('data-lightbox') === 'false') return;
		const img = figure.querySelector('img.af-img');
		if (!img || !img.contains(target)) return;
		openLightbox(img);
	});
}