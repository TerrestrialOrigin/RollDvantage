/* ============================================================
   Page-size control — a paper icon in the top-right screen chrome that opens a
   popup to choose a preset or a custom size. Screen-only (hidden in print). On
   change it updates the geometry variables (via the controller) and re-fits the
   on-screen scaling; the printed sheet auto-fits regardless.

   Split (M12): buildControlMarkup constructs the DOM; the small wire* helpers
   attach one concern each; setupPageSizeControl just composes them.
   ============================================================ */
import { PRESETS, validateCustom, type PageSize, type Unit, type PageSizeController } from './pageSize';

const PAPER_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
  '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" ' +
  'd="M7 3h7l4 4v14H7z"/><path fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linejoin="round" d="M14 3v4h4"/></svg>';

function presetKeyFor(size: PageSize): string | null {
  for (const [key, preset] of Object.entries(PRESETS)) {
    if (preset.width === size.width && preset.height === size.height && preset.unit === size.unit) return key;
  }
  return null;
}

/** The control's DOM, appended to <body>: toggle button + choice popup. */
function buildControlMarkup(): HTMLElement {
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
  return root;
}

interface ControlView {
  root: HTMLElement;
  toggle: HTMLButtonElement;
  popup: HTMLDivElement;
  widthInput: HTMLInputElement;
  heightInput: HTMLInputElement;
  unitSelect: HTMLSelectElement;
  message: HTMLDivElement;
}

function queryControlView(root: HTMLElement): ControlView {
  return {
    root,
    toggle: root.querySelector<HTMLButtonElement>('.ps-toggle')!,
    popup: root.querySelector<HTMLDivElement>('.ps-popup')!,
    widthInput: root.querySelector<HTMLInputElement>('.ps-w')!,
    heightInput: root.querySelector<HTMLInputElement>('.ps-h')!,
    unitSelect: root.querySelector<HTMLSelectElement>('.ps-unit')!,
    message: root.querySelector<HTMLDivElement>('.ps-msg')!,
  };
}

export function setupPageSizeControl(controller: PageSizeController): void {
  const view = queryControlView(buildControlMarkup());

  function reflectCurrent(): void {
    const size = controller.get();
    const activeKey = presetKeyFor(size);
    view.root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
      button.classList.toggle('active', button.dataset.preset === activeKey);
    });
    view.widthInput.value = String(size.width);
    view.heightInput.value = String(size.height);
    view.unitSelect.value = size.unit;
    view.message.textContent = '';
  }

  function apply(size: PageSize): void {
    controller.set(size);
    // re-fit the on-screen scaling and re-paginate size-dependent content
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new CustomEvent('chronicle:pagesizechange'));
    reflectCurrent();
    setOpen(false); // a successful choice closes the popup; invalid input keeps it open
  }

  let isOpen = false;
  function setOpen(open: boolean): void {
    isOpen = open;
    view.popup.hidden = !open;
    view.toggle.setAttribute('aria-expanded', String(open));
    if (open) reflectCurrent();
  }

  function wireToggle(): void {
    view.toggle.addEventListener('click', (event) => { event.stopPropagation(); setOpen(!isOpen); });
  }

  function wirePresetButtons(): void {
    view.root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const preset = PRESETS[button.dataset.preset ?? ''];
        if (preset) apply({ ...preset });
      });
    });
  }

  function wireCustomApply(): void {
    view.root.querySelector<HTMLButtonElement>('.ps-apply')!.addEventListener('click', () => {
      const unit = view.unitSelect.value as Unit;
      const size = validateCustom(view.widthInput.value, view.heightInput.value, unit);
      if (!size) {
        view.message.textContent = 'Enter positive width and height (3–48 in).';
        return; // previous valid size is retained
      }
      apply(size);
    });
  }

  function wireDismissal(): void {
    // dismiss on outside click / Escape
    document.addEventListener('click', (event) => {
      if (isOpen && !view.root.contains(event.target as Node)) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen) { setOpen(false); view.toggle.focus(); }
    });
  }

  wireToggle();
  wirePresetButtons();
  wireCustomApply();
  wireDismissal();
  reflectCurrent();
}
