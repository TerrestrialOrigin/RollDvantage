/* jsdom tests for the shared floating-menu lifecycle (M6 dedupe): open →
   viewport clamp + menu semantics, outside pointerdown dismisses (armed on
   the next animation frame, not immediately), close removes everything and
   restores focus, and close() is idempotent. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openFloatingMenu, MENU_VIEWPORT_INSET_PX } from './floatingMenu';

function buildMenu(itemLabels: string[] = ['One', 'Two']): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'cell-menu';
  for (const label of itemLabels) {
    const button = document.createElement('button');
    button.textContent = label;
    menu.appendChild(button);
  }
  return menu;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function pointerDownOn(target: EventTarget): void {
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('openFloatingMenu', () => {
  it('appends the menu to <body>, applies menu semantics, and focuses the first item', () => {
    const menu = buildMenu();
    openFloatingMenu({ menu, position: { kind: 'point', clientX: 40, clientY: 40 } });
    expect(menu.parentElement).toBe(document.body);
    expect(menu.getAttribute('role')).toBe('menu');
    const firstItem = menu.querySelector('button')!;
    expect(firstItem.getAttribute('role')).toBe('menuitem');
    expect(document.activeElement).toBe(firstItem);
  });

  it('clamps a point position to the viewport inset', () => {
    const menu = buildMenu();
    openFloatingMenu({ menu, position: { kind: 'point', clientX: -500, clientY: -500 } });
    expect(menu.style.left).toBe(`${MENU_VIEWPORT_INSET_PX}px`);
    expect(menu.style.top).toBe(`${MENU_VIEWPORT_INSET_PX}px`);
  });

  it('dismisses on an outside pointerdown only after the arming frame', async () => {
    const onClose = vi.fn();
    const menu = buildMenu();
    openFloatingMenu({ menu, position: { kind: 'point', clientX: 40, clientY: 40 }, onClose });

    pointerDownOn(document.body);            // same-cascade pointerdown: not armed yet
    expect(onClose).not.toHaveBeenCalled();
    expect(menu.isConnected).toBe(true);

    await nextFrame();
    pointerDownOn(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(menu.isConnected).toBe(false);
  });

  it('does not dismiss on a pointerdown inside the menu or on the ignored opener', async () => {
    const onClose = vi.fn();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    const menu = buildMenu();
    openFloatingMenu({ menu, position: { kind: 'above', anchor: opener }, ignoreOutsideOn: opener, onClose });

    await nextFrame();
    pointerDownOn(menu.querySelector('button')!);
    pointerDownOn(opener);
    expect(onClose).not.toHaveBeenCalled();
    expect(menu.isConnected).toBe(true);
  });

  it('close() removes the menu, restores focus to the opener, and is idempotent', async () => {
    const onClose = vi.fn();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const menu = buildMenu();
    const session = openFloatingMenu({ menu, position: { kind: 'point', clientX: 40, clientY: 40 }, onClose });
    expect(document.activeElement).not.toBe(opener);   // focus moved into the menu

    session.close();
    expect(menu.isConnected).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(onClose).toHaveBeenCalledTimes(1);

    session.close();                                    // idempotent
    expect(onClose).toHaveBeenCalledTimes(1);

    await nextFrame();                                  // the pending arming frame must not resurrect the listener
    pointerDownOn(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape closes via the menu semantics', () => {
    const onClose = vi.fn();
    const menu = buildMenu();
    openFloatingMenu({ menu, position: { kind: 'point', clientX: 40, clientY: 40 }, onClose });
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(menu.isConnected).toBe(false);
  });
});
