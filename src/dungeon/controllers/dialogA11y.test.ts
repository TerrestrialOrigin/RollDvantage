/* Unit tests (jsdom) for the shared dialog/menu accessibility helpers:
   Tab trapping with wrap in both directions, dialog-level Escape, focus
   restoration to the opener (with a safe fallback when the opener has left
   the document), and the WAI-ARIA menu pattern (roles, focus-on-open,
   Arrow/Home/End navigation with wrap, Escape). */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { trapFocus, openDialog, applyMenuSemantics } from './dialogA11y';

const noop = (): void => { /* the assertion under test ignores this callback */ };

function pressKey(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('trapFocus', () => {
  let panel: HTMLElement;
  let first: HTMLButtonElement;
  let middle: HTMLTextAreaElement;
  let last: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML =
      '<button id="outside">outside</button>' +
      '<div id="panel">' +
      '  <button id="first">first</button>' +
      '  <textarea id="middle"></textarea>' +
      '  <button id="last">last</button>' +
      '</div>';
    panel = document.getElementById('panel')!;
    first = document.getElementById('first') as HTMLButtonElement;
    middle = document.getElementById('middle') as HTMLTextAreaElement;
    last = document.getElementById('last') as HTMLTextAreaElement & HTMLButtonElement;
    trapFocus(panel);
  });

  it('wraps Tab from the last control back to the first', () => {
    last.focus();
    const event = pressKey(last, 'Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('wraps Shift+Tab from the first control to the last', () => {
    first.focus();
    const event = pressKey(first, 'Tab', { shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('leaves Tab between interior controls to the browser', () => {
    middle.focus();
    const event = pressKey(middle, 'Tab');
    expect(event.defaultPrevented).toBe(false);
  });

  it('skips controls hidden with inline display:none (the Remove button case)', () => {
    last.style.display = 'none';
    middle.focus();
    const event = pressKey(middle, 'Tab');
    expect(event.defaultPrevented).toBe(true);           // middle is now effectively last
    expect(document.activeElement).toBe(first);
  });

  it('detaches when the returned function is called', () => {
    const panelTwo = document.createElement('div');
    panelTwo.innerHTML = '<button id="only">only</button>';
    document.body.appendChild(panelTwo);
    const untrap = trapFocus(panelTwo);
    untrap();
    const only = document.getElementById('only')!;
    only.focus();
    const event = pressKey(only, 'Tab');
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('openDialog', () => {
  let opener: HTMLButtonElement;
  let dialog: HTMLElement;
  let panel: HTMLElement;
  let textarea: HTMLTextAreaElement;
  let saveButton: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML =
      '<button id="opener">open</button>' +
      '<div id="dialog" hidden>' +
      '  <div id="panel"><textarea id="text"></textarea><button id="save">save</button></div>' +
      '</div>';
    opener = document.getElementById('opener') as HTMLButtonElement;
    dialog = document.getElementById('dialog')!;
    panel = document.getElementById('panel')!;
    textarea = document.getElementById('text') as HTMLTextAreaElement;
    saveButton = document.getElementById('save') as HTMLButtonElement;
  });

  it('shows the dialog and moves focus to the initial control', () => {
    opener.focus();
    openDialog({ dialog, panel, initialFocus: textarea, onEscape: noop });
    expect(dialog.hidden).toBe(false);
    expect(document.activeElement).toBe(textarea);
  });

  it('invokes onEscape when Escape is pressed on any control inside', () => {
    opener.focus();
    const onEscape = vi.fn();
    openDialog({ dialog, panel, initialFocus: textarea, onEscape });
    saveButton.focus();
    pressKey(saveButton, 'Escape');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('close() hides the dialog and restores focus to the opener', () => {
    opener.focus();
    const session = openDialog({ dialog, panel, initialFocus: textarea, onEscape: noop });
    session.close();
    expect(dialog.hidden).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it('close() is idempotent and safe when the opener left the document', () => {
    opener.focus();
    const session = openDialog({ dialog, panel, initialFocus: textarea, onEscape: noop });
    opener.remove();
    expect(() => { session.close(); session.close(); }).not.toThrow();
    expect(dialog.hidden).toBe(true);
    expect(document.activeElement).toBe(document.body);   // safe default, no dangling focus
  });

  it('stops trapping and listening after close', () => {
    opener.focus();
    const onEscape = vi.fn();
    const session = openDialog({ dialog, panel, initialFocus: textarea, onEscape });
    session.close();
    dialog.hidden = false;                                // re-shown without the helper
    saveButton.focus();
    pressKey(saveButton, 'Escape');
    expect(onEscape).not.toHaveBeenCalled();
    const tab = pressKey(saveButton, 'Tab');
    expect(tab.defaultPrevented).toBe(false);
  });
});

describe('applyMenuSemantics', () => {
  let opener: HTMLButtonElement;
  let menu: HTMLElement;
  let items: HTMLButtonElement[];

  beforeEach(() => {
    document.body.innerHTML =
      '<button id="opener">open</button>' +
      '<div id="menu"><button>Alpha</button><button>Beta</button><button>Gamma</button></div>';
    opener = document.getElementById('opener') as HTMLButtonElement;
    menu = document.getElementById('menu')!;
    items = Array.from(menu.querySelectorAll('button'));
  });

  it('applies menu and menuitem roles and focuses the first item', () => {
    opener.focus();
    applyMenuSemantics(menu, noop);
    expect(menu.getAttribute('role')).toBe('menu');
    items.forEach((item) => {
      expect(item.getAttribute('role')).toBe('menuitem');
      expect(item.tabIndex).toBe(-1);
    });
    expect(document.activeElement).toBe(items[0]);
  });

  it('ArrowDown and ArrowUp move focus and wrap at both ends', () => {
    applyMenuSemantics(menu, noop);
    pressKey(items[0], 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    pressKey(items[1], 'ArrowDown');
    pressKey(items[2], 'ArrowDown');                       // wraps last -> first
    expect(document.activeElement).toBe(items[0]);
    pressKey(items[0], 'ArrowUp');                         // wraps first -> last
    expect(document.activeElement).toBe(items[2]);
  });

  it('Home and End jump to the first and last items', () => {
    applyMenuSemantics(menu, noop);
    pressKey(items[0], 'End');
    expect(document.activeElement).toBe(items[2]);
    pressKey(items[2], 'Home');
    expect(document.activeElement).toBe(items[0]);
  });

  it('Escape invokes onClose', () => {
    const onClose = vi.fn();
    applyMenuSemantics(menu, onClose);
    pressKey(items[0], 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restoreFocus returns focus to the pre-open element, safely if removed', () => {
    opener.focus();
    const semantics = applyMenuSemantics(menu, noop);
    expect(document.activeElement).not.toBe(opener);
    semantics.restoreFocus();
    expect(document.activeElement).toBe(opener);
    opener.remove();
    expect(() => semantics.restoreFocus()).not.toThrow();
  });
});
