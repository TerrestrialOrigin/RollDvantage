/* Responsive page scaling — wraps every .page and scales it to fit narrow
   viewports (the reflow below 700px is handled in CSS). Logic preserved verbatim. */

/**
 * The page's natural (unscaled) width in CSS pixels, derived from the
 * `--page-w` custom property so it tracks the selected page size and any unit
 * (in/mm/cm/px). Measured via a hidden probe so the browser does the unit math.
 * Falls back to Letter width (8.5in = 816px) if measurement is unavailable.
 */
function naturalWidth(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:0;width:var(--page-w);';
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width || 8.5 * 96;
}

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
    const natural = naturalWidth();
    const scale = Math.min(1, available / natural);
    if (scale >= 1) {
      page.style.transform = '';
      page.style.marginLeft = '';
      wrap.style.height = '';
    } else {
      page.style.transformOrigin = 'top left';
      page.style.transform = 'scale(' + scale + ')';
      page.style.marginLeft = Math.max(0, (available - natural * scale) / 2) + 'px';
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
