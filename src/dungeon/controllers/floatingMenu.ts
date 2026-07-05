/* ============================================================
   Floating-menu helper — the shared lifecycle behind the right-click cell menu
   and the toolbar's generate menu (M6 dedupe): append the menu to <body>,
   position it clamped inside the viewport, apply the WAI-ARIA menu semantics
   from dialogA11y, dismiss on an outside pointerdown, and on close remove the
   element + listener and restore focus to the opener.

   The outside-dismiss listener attaches on the next animation frame (not a
   setTimeout(,0) hack): the menu opens during a pointer/click event whose
   own capture-phase pointerdown must not immediately dismiss it, and "after
   this event cascade, before any further input" is exactly what rAF gives us.
   ============================================================ */
import { applyMenuSemantics, type MenuSemantics } from './dialogA11y';

/** Minimum gap kept between a floating menu and the viewport edges. */
export const MENU_VIEWPORT_INSET_PX = 8;

/** Where to place the menu: at a client point (context menu) or bottom-anchored
    above an element (the generate menu above its toolbar button). */
export type MenuPosition =
  | { kind: 'point'; clientX: number; clientY: number }
  | { kind: 'above'; anchor: HTMLElement };

export interface FloatingMenuOptions {
  menu: HTMLElement;
  position: MenuPosition;
  /** Extra element whose pointerdowns do NOT count as "outside" (the opener
      button, so reopening toggles instead of dismiss-then-reopen). */
  ignoreOutsideOn?: HTMLElement | null;
  /** Called exactly once when the menu closes (outside click, Escape, or an
      explicit close() call). The session has already cleaned up. */
  onClose?: () => void;
}

export interface FloatingMenuSession {
  /** Remove the menu + its listeners and restore focus to the opener. Idempotent. */
  close: () => void;
}

function clampedLeft(desired: number, menuWidth: number): number {
  return Math.max(MENU_VIEWPORT_INSET_PX, Math.min(desired, window.innerWidth - menuWidth - MENU_VIEWPORT_INSET_PX));
}

function applyPosition(menu: HTMLElement, position: MenuPosition): void {
  if (position.kind === 'point') {
    menu.style.left = clampedLeft(position.clientX, menu.offsetWidth) + 'px';
    menu.style.top = Math.max(MENU_VIEWPORT_INSET_PX, Math.min(position.clientY, window.innerHeight - menu.offsetHeight - MENU_VIEWPORT_INSET_PX)) + 'px';
  } else {
    const rect = position.anchor.getBoundingClientRect();
    menu.style.left = clampedLeft(rect.left, menu.offsetWidth) + 'px';
    menu.style.top = Math.max(MENU_VIEWPORT_INSET_PX, rect.top - menu.offsetHeight - MENU_VIEWPORT_INSET_PX) + 'px';
  }
}

/** Open a floating menu with the full shared lifecycle. The menu element must
    already carry its items; the caller keeps ownership of item click handlers
    (which should call the returned session's close()). */
export function openFloatingMenu(options: FloatingMenuOptions): FloatingMenuSession {
  const { menu, position, ignoreOutsideOn, onClose } = options;

  let closed = false;
  let outsideArmed = 0;
  let semantics: MenuSemantics | null = null;

  function onOutsidePointerDown(event: PointerEvent): void {
    if (menu.contains(event.target as Node)) return;
    if (ignoreOutsideOn && event.target === ignoreOutsideOn) return;
    close();
  }

  function close(): void {
    if (closed) return;
    closed = true;
    if (outsideArmed) cancelAnimationFrame(outsideArmed);
    menu.remove();
    document.removeEventListener('pointerdown', onOutsidePointerDown, true);
    semantics?.restoreFocus();
    onClose?.();
  }

  document.body.appendChild(menu);
  applyPosition(menu, position);
  semantics = applyMenuSemantics(menu, close);
  outsideArmed = requestAnimationFrame(() => {
    outsideArmed = 0;
    document.addEventListener('pointerdown', onOutsidePointerDown, true);
  });

  return { close };
}
