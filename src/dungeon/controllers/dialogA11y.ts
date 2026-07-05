/* ============================================================
   Dialog & menu accessibility helpers (H6) — the shared mechanics behind the
   note modal, the gen-warn dialog, and the two popup menus:

   - openDialog: show a modal overlay, move focus in, trap Tab inside the
     panel, close on Escape from anywhere within, and restore focus to the
     opener on close.
   - applyMenuSemantics: WAI-ARIA menu pattern for a transient popup of
     buttons — menu/menuitem roles, focus on the first item, Arrow/Home/End
     navigation, Escape to close — plus focus restoration for the caller.

   Written as small standalone functions so Change 8's planned floatingMenu
   dedupe can lift them without rework.
   ============================================================ */

const TABBABLE_SELECTOR =
  'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** Controls inside `panel` that participate in the Tab cycle. Excludes
    disabled controls and the ones the controllers hide inline (e.g. the
    note dialog's Remove button when the entry has nothing to remove). */
function tabbablesWithin(panel: HTMLElement): HTMLElement[] {
  const candidates = Array.from(panel.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR));
  return candidates.filter((element) =>
    !element.hasAttribute('disabled') && !element.hidden &&
    element.style.display !== 'none' && !element.closest('[hidden]'));
}

/** Trap Tab / Shift+Tab inside `panel`, wrapping across its tabbable
    controls. Returns a detach function. */
export function trapFocus(panel: HTMLElement): () => void {
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const tabbables = tabbablesWithin(panel);
    if (!tabbables.length) { event.preventDefault(); return; }
    const first = tabbables[0];
    const last = tabbables[tabbables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !panel.contains(active)) { event.preventDefault(); last.focus(); }
    } else if (active === last || !panel.contains(active)) {
      event.preventDefault(); first.focus();
    }
  }
  panel.addEventListener('keydown', onKeydown);
  return () => { panel.removeEventListener('keydown', onKeydown); };
}

export interface DialogSession {
  /** Hide the dialog, detach the trap/Escape listeners, and restore focus to
      the element that was focused when the dialog opened. Idempotent. */
  close: () => void;
}

export interface OpenDialogOptions {
  /** The overlay root whose `hidden` attribute shows/hides the dialog. */
  dialog: HTMLElement;
  /** The panel that bounds the focus trap (the visible dialog surface). */
  panel: HTMLElement;
  /** Control focused when the dialog opens. */
  initialFocus: HTMLElement;
  /** Invoked when Escape is pressed anywhere inside the dialog. The handler
      owns closing (call the controller's cancel path, which calls close()). */
  onEscape: () => void;
}

/** Open a modal dialog with the full accessible lifecycle: focus moves in,
    Tab is trapped, Escape cancels from any control, and close() restores
    focus to the opener (skipped safely if the opener left the document). */
export function openDialog(options: OpenDialogOptions): DialogSession {
  const { dialog, panel, initialFocus, onEscape } = options;
  const opener = document.activeElement;
  dialog.hidden = false;
  initialFocus.focus();
  const untrap = trapFocus(panel);
  function onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onEscape(); }
  }
  dialog.addEventListener('keydown', onDialogKeydown);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    untrap();
    dialog.removeEventListener('keydown', onDialogKeydown);
    dialog.hidden = true;
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    else if (document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)) {
      document.activeElement.blur();                     // never leave focus inside a hidden dialog
    }
  }
  return { close };
}

export interface MenuSemantics {
  /** Return focus to the element that was focused before the menu opened.
      Call from the menu's close path. Safe if that element left the document. */
  restoreFocus: () => void;
}

/** Apply the WAI-ARIA menu pattern to a just-built popup of `<button>`s:
    menu/menuitem roles, focus moves to the first item, ArrowDown/ArrowUp
    cycle (wrapping), Home/End jump, Escape invokes `onClose`. Enter/Space
    activation rides the buttons' native click behavior. */
export function applyMenuSemantics(menu: HTMLElement, onClose: () => void): MenuSemantics {
  const opener = document.activeElement;
  menu.setAttribute('role', 'menu');
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button'));
  items.forEach((item) => { item.setAttribute('role', 'menuitem'); item.tabIndex = -1; });

  function focusItem(index: number): void {
    const wrapped = (index + items.length) % items.length;
    items[wrapped].focus();
  }
  menu.addEventListener('keydown', (event) => {
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); focusItem(currentIndex + 1); break;
      case 'ArrowUp': event.preventDefault(); focusItem(currentIndex - 1); break;
      case 'Home': event.preventDefault(); focusItem(0); break;
      case 'End': event.preventDefault(); focusItem(items.length - 1); break;
      case 'Escape': event.preventDefault(); event.stopPropagation(); onClose(); break;
    }
  });
  if (items.length) items[0].focus();

  return {
    restoreFocus: () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); },
  };
}
