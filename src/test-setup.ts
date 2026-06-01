/* Vitest setup for the jsdom environment.
   jsdom does not implement window.matchMedia, which the Contents-Key layer
   queries for its responsive (≤700px) layout switch. Provide a minimal,
   overridable stub so DOM-driven tests can run. Individual tests may replace
   window.matchMedia to simulate a narrow viewport. */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => { /* no-op */ },
      removeEventListener: () => { /* no-op */ },
      addListener: () => { /* no-op */ },
      removeListener: () => { /* no-op */ },
      dispatchEvent: () => false,
    });
}
