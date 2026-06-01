/* Responsive page scaling — wraps every .page and scales it to fit narrow
   viewports (the reflow below 700px is handled in CSS). Logic preserved verbatim. */

const NATURAL_WIDTH = 8.5 * 96; // 816px — the page's natural width

/** Wrap each full page in a .page-wrap so it can be scaled independently. */
export function wrapPages(): void {
  document.querySelectorAll<HTMLElement>('.page').forEach((page) => {
    const wrap = document.createElement('div');
    wrap.className = 'page-wrap';
    page.parentNode!.insertBefore(wrap, page);
    wrap.appendChild(page);
  });
}

/** Scale each wrapped page to fit its available width (no scaling ≤700px). */
export function fit(): void {
  const small = window.matchMedia('(max-width:700px)').matches;
  document.querySelectorAll<HTMLElement>('.page-wrap').forEach((wrap) => {
    const page = wrap.querySelector<HTMLElement>('.page');
    if (!page) return;
    if (small) {
      page.style.transform = '';
      page.style.transformOrigin = '';
      page.style.marginLeft = '';
      wrap.style.height = '';
      return;
    }
    const available = wrap.clientWidth;
    const scale = Math.min(1, available / NATURAL_WIDTH);
    if (scale >= 1) {
      page.style.transform = '';
      page.style.marginLeft = '';
      wrap.style.height = '';
    } else {
      page.style.transformOrigin = 'top left';
      page.style.transform = 'scale(' + scale + ')';
      page.style.marginLeft = Math.max(0, (available - NATURAL_WIDTH * scale) / 2) + 'px';
      wrap.style.height = (page.offsetHeight * scale) + 'px';
    }
  });
}

export function setupPageScaling(): void {
  wrapPages();
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('load', fit);
}
