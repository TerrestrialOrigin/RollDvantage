import { describe, it, expect, afterEach } from 'vitest';
import { fit } from './pageScaling';

/* The shared test-setup stubs window.matchMedia to `matches: false`, so the
   narrow-viewport early-return in fit() is never exercised by other tests
   (coverageGaps.md item 6). Here we override the stub to `matches: true` to
   drive that branch: it must strip every per-page scaling style. */
describe('pageScaling.fit() narrow-viewport branch (M9)', () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.body.innerHTML = '';
  });

  function narrowMatchMedia(query: string): MediaQueryList {
    return {
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => { /* no-op */ },
      removeEventListener: () => { /* no-op */ },
      addListener: () => { /* no-op */ },
      removeListener: () => { /* no-op */ },
      dispatchEvent: () => false,
    };
  }

  it('clears every per-page scaling style when the narrow media query matches', () => {
    window.matchMedia = narrowMatchMedia;

    const wrap = document.createElement('div');
    wrap.className = 'page-wrap';
    wrap.style.height = '500px';
    const page = document.createElement('div');
    page.className = 'page';
    page.style.transform = 'scale(0.5)';
    page.style.transformOrigin = 'top left';
    page.style.marginLeft = '40px';
    wrap.appendChild(page);
    document.body.appendChild(wrap);

    fit();

    // The narrow branch resets transform/origin/margin on the page and the
    // wrap's forced height — nothing is scaled in the reflowed layout.
    expect(page.style.transform).toBe('');
    expect(page.style.transformOrigin).toBe('');
    expect(page.style.marginLeft).toBe('');
    expect(wrap.style.height).toBe('');
  });
});
