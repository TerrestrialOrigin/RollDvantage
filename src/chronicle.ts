/* ============================================================
   THE GILDED CHRONICLE — behaviour

   Provides:
   • Responsive scaling — wraps every .page and scales it to fit
     narrow viewports (the reflow below 700px is handled by chronicle.css).
   • Persistence — any element with [data-key] (an <input> or a
     contenteditable .lines / field) is saved to localStorage and
     restored on load. The `store` argument namespaces the keys per-document.
   • Hooks up #btn-print (window.print) and #btn-clear (wipe answers)
     if those elements exist.
   ============================================================ */

export function initChronicle(store?: string): void {
  const STORE = store ?? 'chronicle_';
  const NAT_W = 8.5 * 96; // 816px — the page's natural width

  // ---- responsive: wrap + scale each full page ----
  document.querySelectorAll<HTMLElement>('.page').forEach(function (p) {
    const w = document.createElement('div');
    w.className = 'page-wrap';
    p.parentNode!.insertBefore(w, p);
    w.appendChild(p);
  });

  function fit(): void {
    const small = window.matchMedia('(max-width:700px)').matches;
    document.querySelectorAll<HTMLElement>('.page-wrap').forEach(function (w) {
      const p = w.querySelector<HTMLElement>('.page');
      if (!p) return;
      if (small) {
        p.style.transform = '';
        p.style.transformOrigin = '';
        p.style.marginLeft = '';
        w.style.height = '';
        return;
      }
      const avail = w.clientWidth;
      const scale = Math.min(1, avail / NAT_W);
      if (scale >= 1) {
        p.style.transform = '';
        p.style.marginLeft = '';
        w.style.height = '';
      } else {
        p.style.transformOrigin = 'top left';
        p.style.transform = 'scale(' + scale + ')';
        p.style.marginLeft = Math.max(0, (avail - NAT_W * scale) / 2) + 'px';
        w.style.height = (p.offsetHeight * scale) + 'px';
      }
    });
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('load', fit);

  // ---- persistence ----
  const fields = document.querySelectorAll<HTMLElement>('[data-key]');
  fields.forEach(function (el) {
    const k = STORE + el.dataset.key;
    const saved = localStorage.getItem(k);
    if (saved !== null) {
      if (el.tagName === 'INPUT') { (el as HTMLInputElement).value = saved; }
      else { el.innerHTML = saved; }
    }
    el.addEventListener('input', function () {
      localStorage.setItem(k, el.tagName === 'INPUT' ? (el as HTMLInputElement).value : el.innerHTML);
    });
  });

  // ---- toolbar hooks (optional) ----
  const print = document.getElementById('btn-print');
  if (print) print.addEventListener('click', function () { window.print(); });

  const clear = document.getElementById('btn-clear');
  if (clear) clear.addEventListener('click', function () {
    if (!confirm('Erase every answer you have typed? This cannot be undone.')) return;
    fields.forEach(function (el) {
      localStorage.removeItem(STORE + el.dataset.key);
      if (el.tagName === 'INPUT') { (el as HTMLInputElement).value = ''; } else { el.innerHTML = ''; }
    });
  });
}
