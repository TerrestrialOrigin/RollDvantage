/* ============================================================
   Page-size control — a paper icon in the top-right screen chrome that opens a
   popup to choose a preset or a custom size. Screen-only (hidden in print). On
   change it updates the geometry variables (via the controller) and re-fits the
   on-screen scaling; the printed sheet auto-fits regardless.
   ============================================================ */
import { PRESETS, validateCustom, type PageSize, type Unit, type PageSizeController } from './pageSize';

const PAPER_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
  '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" ' +
  'd="M7 3h7l4 4v14H7z"/><path fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linejoin="round" d="M14 3v4h4"/></svg>';

function presetKeyFor(size: PageSize): string | null {
  for (const [key, preset] of Object.entries(PRESETS)) {
    if (preset.w === size.w && preset.h === size.h && preset.unit === size.unit) return key;
  }
  return null;
}

export function setupPageSizeControl(controller: PageSizeController): void {
  const root = document.createElement('div');
  root.className = 'page-size-control';
  root.innerHTML =
    `<button type="button" class="ps-toggle" aria-haspopup="dialog" aria-expanded="false" title="Page size">${PAPER_ICON}</button>` +
    '<div class="ps-popup" role="dialog" aria-label="Page size" hidden>' +
    '  <div class="ps-title">Page size</div>' +
    '  <div class="ps-presets">' +
    '    <button type="button" data-preset="letter">Letter</button>' +
    '    <button type="button" data-preset="a4">A4</button>' +
    '    <button type="button" data-preset="legal">Legal</button>' +
    '  </div>' +
    '  <div class="ps-custom">' +
    '    <label>Custom <input type="number" class="ps-w" min="1" step="0.1" inputmode="decimal" aria-label="Width"> ×' +
    '    <input type="number" class="ps-h" min="1" step="0.1" inputmode="decimal" aria-label="Height">' +
    '    <select class="ps-unit" aria-label="Unit"><option value="in">in</option><option value="mm">mm</option></select>' +
    '    <button type="button" class="ps-apply">Apply</button></label>' +
    '  </div>' +
    '  <div class="ps-msg" aria-live="polite"></div>' +
    '</div>';
  document.body.appendChild(root);

  const toggle = root.querySelector<HTMLButtonElement>('.ps-toggle')!;
  const popup = root.querySelector<HTMLDivElement>('.ps-popup')!;
  const widthInput = root.querySelector<HTMLInputElement>('.ps-w')!;
  const heightInput = root.querySelector<HTMLInputElement>('.ps-h')!;
  const unitSelect = root.querySelector<HTMLSelectElement>('.ps-unit')!;
  const message = root.querySelector<HTMLDivElement>('.ps-msg')!;

  function reflectCurrent(): void {
    const size = controller.get();
    const activeKey = presetKeyFor(size);
    root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
      button.classList.toggle('active', button.dataset.preset === activeKey);
    });
    widthInput.value = String(size.w);
    heightInput.value = String(size.h);
    unitSelect.value = size.unit;
    message.textContent = '';
  }

  function apply(size: PageSize): void {
    controller.set(size);
    // let the on-screen scaling re-fit to the new page dimensions
    window.dispatchEvent(new Event('resize'));
    reflectCurrent();
  }

  let isOpen = false;
  function setOpen(open: boolean): void {
    isOpen = open;
    popup.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) reflectCurrent();
  }

  toggle.addEventListener('click', (event) => { event.stopPropagation(); setOpen(!isOpen); });

  root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = PRESETS[button.dataset.preset ?? ''];
      if (preset) apply({ ...preset });
    });
  });

  root.querySelector<HTMLButtonElement>('.ps-apply')!.addEventListener('click', () => {
    const unit = unitSelect.value as Unit;
    const size = validateCustom(widthInput.value, heightInput.value, unit);
    if (!size) {
      message.textContent = 'Enter positive width and height (3–48 in).';
      return; // previous valid size is retained
    }
    apply(size);
  });

  // dismiss on outside click / Escape
  document.addEventListener('click', (event) => {
    if (isOpen && !root.contains(event.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) { setOpen(false); toggle.focus(); }
  });

  reflectCurrent();
}
