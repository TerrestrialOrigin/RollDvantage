/* jsdom tests for the hamburger controller extracted from index.html's former
   inline script (H7), including the detach()/re-attach contract (Change 8's
   "controllers are detachable" requirement). */
import { describe, it, expect, beforeEach } from 'vitest';
import { attachToolbarMenuController, TOOLBAR_COLLAPSE_MAX_PX } from './toolbarMenuController';

function buildToolbar(): { toolbar: HTMLElement; toggle: HTMLElement; items: HTMLElement } {
  document.body.innerHTML =
    '<div class="toolbar" id="toolbar">' +
    '<button class="tb-toggle" id="tb-toggle" aria-label="Open menu" aria-expanded="false"></button>' +
    '<div class="tb-items">' +
    '<button class="primary" id="btn-new">Generate</button>' +
    '<div class="lvl"><button class="lvl-btn" id="lvl-down">-</button></div>' +
    '<div class="tb-undoredo"><button id="btn-undo">Undo</button></div>' +
    '<button id="btn-print">Print</button>' +
    '</div></div>';
  return {
    toolbar: document.getElementById('toolbar')!,
    toggle: document.getElementById('tb-toggle')!,
    items: document.querySelector<HTMLElement>('.tb-items')!,
  };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('attachToolbarMenuController', () => {
  it('toggle click opens and closes the menu, updating aria state', () => {
    const { toolbar, toggle } = buildToolbar();
    attachToolbarMenuController();

    toggle.click();
    expect(toolbar.classList.contains('open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Close menu');

    toggle.click();
    expect(toolbar.classList.contains('open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Open menu');
  });

  it('action buttons close the menu; dial, undo/redo, and Generate keep it open', () => {
    const { toolbar, toggle } = buildToolbar();
    attachToolbarMenuController();

    for (const keepOpenId of ['lvl-down', 'btn-undo', 'btn-new']) {
      toggle.click();
      expect(toolbar.classList.contains('open')).toBe(true);
      document.getElementById(keepOpenId)!.click();
      expect(toolbar.classList.contains('open')).toBe(true);
      toggle.click();                                   // reset closed
    }

    toggle.click();
    document.getElementById('btn-print')!.click();
    expect(toolbar.classList.contains('open')).toBe(false);
  });

  it('a window resize past the collapse breakpoint closes the menu', () => {
    const { toolbar, toggle } = buildToolbar();
    attachToolbarMenuController();
    toggle.click();
    expect(toolbar.classList.contains('open')).toBe(true);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: TOOLBAR_COLLAPSE_MAX_PX + 100 });
    window.dispatchEvent(new Event('resize'));
    expect(toolbar.classList.contains('open')).toBe(false);
  });

  it('detach() removes all listeners; re-attach handles a gesture exactly once', () => {
    const { toolbar, toggle } = buildToolbar();
    const handle = attachToolbarMenuController();

    handle.detach();
    toggle.click();
    expect(toolbar.classList.contains('open')).toBe(false);   // detached: no toggling

    attachToolbarMenuController();
    toggle.click();
    expect(toolbar.classList.contains('open')).toBe(true);    // exactly one handler: one click opens
    toggle.click();
    expect(toolbar.classList.contains('open')).toBe(false);   // ...and one click closes (no double-toggle)
  });

  it('is a safe no-op when the toolbar markup is absent', () => {
    const handle = attachToolbarMenuController();
    expect(() => handle.detach()).not.toThrow();
  });
});
