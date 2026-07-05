/* ============================================================
   Contents-Key view — renders the annotation list into #contents-key.

   In the narrow layout: a single continuous column. On wider/print: a measured
   multi-page layout. Logic preserved verbatim from the original
   renderContentsKey, with the dungeon passed explicitly (for entryLabel)
   instead of closure state. After (re)building pages the view invokes the
   injected onLayoutChange callback so the chronicle layer re-scales them — a
   typed signal replacing the old synthetic window resize dispatch.
   ============================================================ */
import { NARROW_LAYOUT_QUERY } from '../../chronicle/breakpoints';
import type { Dungeon } from '../model/types';
import { entryLabel, escapeHtml, type AnnotationEntry } from './labels';
import { updateFootNames } from '../rendering/domRenderer';

/** Vertical space reserved at the frame bottom for the running foot when
    measuring how many entry boxes fit a Contents-Key page. */
const CONTENTS_KEY_FOOT_RESERVE_PX = 46;

export function renderContentsKey(annotations: AnnotationEntry[], dungeon: Dungeon, onLayoutChange?: () => void): void {
  const container = document.getElementById('contents-key');
  if (!container) return;
  container.innerHTML = '';
  if (!annotations?.length) return;

  function newPage(): HTMLElement {
    const wrap = document.createElement('div'); wrap.className = 'page-wrap';
    const page = document.createElement('section'); page.className = 'page sheet';
    page.setAttribute('data-screen-label', 'Contents Key');
    page.innerHTML =
      '<div class="frame">' +
        '<header class="sec-head map-head">' +
          '<div class="numeral">&#10070;</div>' +
          '<h2>Contents Key</h2>' +
          '<p class="sec-sub">What lies within, kept by the cartographer&rsquo;s letters</p>' +
          '<div class="sec-divider"><span class="ln"></span><span class="dot"></span><span class="ln rev"></span></div>' +
        '</header>' +
        '<div class="ck-grid"></div>' +
        '<div class="page-foot">&#10070;&ensp;<span class="foot-name"></span>&ensp;&#10070;</div>' +
      '</div>';
    wrap.appendChild(page); container!.appendChild(wrap);
    return page;
  }
  function boxFor(entry: AnnotationEntry): HTMLElement {
    const holder = document.createElement('div');
    holder.innerHTML = '<div class="ck-box"><div class="ck-letter">' + escapeHtml(entry.feature.ref) + '</div>' +
      '<div class="ck-body"><div class="ck-type">' + escapeHtml(entryLabel(dungeon, entry)) + '</div>' +
      '<div class="ck-text">' + escapeHtml(entry.feature.note ?? '') + '</div></div></div>';
    const box = holder.firstChild as HTMLElement;
    // Keyboard-activatable button semantics (H6). The accessible name carries a
    // user-authored label, so it is applied as an attribute — never as markup.
    box.setAttribute('role', 'button');
    box.setAttribute('tabindex', '0');
    box.setAttribute('aria-label', 'Edit entry ' + (entry.feature.ref ?? '') + ': ' + entryLabel(dungeon, entry));
    return box;
  }

  let page = newPage();
  let frame = page.querySelector<HTMLElement>('.frame')!;
  let grid = page.querySelector<HTMLElement>('.ck-grid')!;

  /* narrow layout: skip pagination — one page, single column, every box in order. */
  if (window.matchMedia(NARROW_LAYOUT_QUERY).matches) {
    for (const entry of annotations) grid.appendChild(boxFor(entry));
    updateFootNames(dungeon.name);
    onLayoutChange?.();
    return;
  }

  for (const entry of annotations) {
    const box = boxFor(entry);
    grid.appendChild(box);
    const available = frame.clientHeight - grid.offsetTop - CONTENTS_KEY_FOOT_RESERVE_PX;
    if (grid.children.length > 1 && grid.scrollHeight > available) { // overflowed -> push this box to a fresh page
      grid.removeChild(box);
      page = newPage(); frame = page.querySelector<HTMLElement>('.frame')!; grid = page.querySelector<HTMLElement>('.ck-grid')!;
      grid.appendChild(box);
    }
  }

  const pages = container.querySelectorAll('.page');
  if (pages.length > 1) pages.forEach((pageElement, index) => {
    pageElement.setAttribute('data-screen-label', 'Contents Key ' + (index + 1));
    const heading = pageElement.querySelector('h2'); if (heading) heading.textContent = 'Contents Key ' + (index + 1);
  });
  updateFootNames(dungeon.name);
  onLayoutChange?.(); // let chronicle scale the new pages
}

/**
 * Re-render the Contents Key when crossing the narrow/wide breakpoint so the DOM
 * matches the layout for the current width. `render` should redraw using the
 * current dungeon's annotations.
 */
export function watchContentsKeyBreakpoint(render: () => void): void {
  const mediaQuery = window.matchMedia(NARROW_LAYOUT_QUERY);
  mediaQuery.addEventListener('change', () => { render(); });
}
