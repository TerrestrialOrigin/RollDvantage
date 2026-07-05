/* jsdom tests for the controllers' detach() contract (Change 8): after
   detach(), the events a controller handled no longer act; after re-attach,
   a gesture acts exactly once. Built on the REAL store/history/editor stack
   (DOM-free core) — only the DOM gestures are synthesized. */
import { describe, it, expect, beforeEach } from 'vitest';
import { generateDungeon } from 'auto-stuff-generator';
import { History } from '../state/history';
import { DungeonStore } from '../state/dungeonStore';
import { createDungeonEditor, type DungeonEditor } from '../api/dungeonEditor';
import { migrateDungeon } from '../persistence/dungeonFile';
import { attachContextMenuController } from './contextMenuController';
import { attachToolbarController } from './toolbarController';
import { attachStructureModeController } from './structureModeController';
import { attachDragPlaceController } from './dragPlaceController';
import type { ControllerContext, ModeState } from './types';
import type { Dungeon, ExternalDungeon } from '../model/types';

function memStore(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  const data: Record<string, string> = {};
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

interface Stack { editor: DungeonEditor; store: DungeonStore; context: ControllerContext; getDungeon: () => Dungeon | null; }

function realStack(): Stack {
  const history = new History();
  const store = new DungeonStore(history, memStore());
  const editor = createDungeonEditor(store, history);
  editor.loadFromJson(migrateDungeon(
    JSON.parse(JSON.stringify(generateDungeon(0xc0ffee, 3, 'full'))) as ExternalDungeon));
  const modes: ModeState = { current: null, selectedMarkerType: null };
  return { editor, store, context: { editor, getDungeon: () => store.getCurrent(), modes }, getDungeon: () => store.getCurrent() };
}

function pressKey(key: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('contextMenuController detach()', () => {
  function openMenuSomewhere(stack: Stack, open: (gridX: number, gridY: number, clientX: number, clientY: number) => void): HTMLElement | null {
    const dungeon = stack.getDungeon()!;
    const room = dungeon.rooms[0];
    open(room.x, room.y, 50, 50);
    return document.querySelector<HTMLElement>('.cell-menu');
  }

  it('Escape closes an open menu while attached; after detach Escape no longer closes', () => {
    const stack = realStack();
    const handles = attachContextMenuController(stack.context);

    expect(openMenuSomewhere(stack, handles.openContextMenu)).not.toBeNull();
    pressKey('Escape');
    expect(document.querySelector('.cell-menu')).toBeNull();

    handles.detach();
    expect(openMenuSomewhere(stack, handles.openContextMenu)).not.toBeNull();
    pressKey('Escape');
    expect(document.querySelector('.cell-menu')).not.toBeNull();   // listener removed: menu survives
    document.querySelector('.cell-menu')!.remove();
  });

  it('detach() itself closes any open menu', () => {
    const stack = realStack();
    const handles = attachContextMenuController(stack.context);
    expect(openMenuSomewhere(stack, handles.openContextMenu)).not.toBeNull();
    handles.detach();
    expect(document.querySelector('.cell-menu')).toBeNull();
  });
});

describe('toolbarController detach()', () => {
  it('Ctrl+Z undoes while attached; after detach it is inert', () => {
    const stack = realStack();
    const markerCount = (): number => stack.getDungeon()!.markers.length;
    const baseline = markerCount();
    const handles = attachToolbarController(stack.editor, stack.store);

    stack.editor.addMarker('monster', 1, 1);
    expect(markerCount()).toBe(baseline + 1);
    pressKey('z', { ctrlKey: true });
    expect(markerCount()).toBe(baseline);          // keyboard undo worked

    stack.editor.addMarker('monster', 1, 1);
    handles.detach();
    pressKey('z', { ctrlKey: true });
    expect(markerCount()).toBe(baseline + 1);      // listener removed: no undo
  });

  it('after detach + re-attach, one Ctrl+Z undoes exactly one step', () => {
    const stack = realStack();
    const markerCount = (): number => stack.getDungeon()!.markers.length;
    const baseline = markerCount();

    attachToolbarController(stack.editor, stack.store).detach();
    attachToolbarController(stack.editor, stack.store);

    stack.editor.addMarker('monster', 1, 1);
    stack.editor.addMarker('monster', 2, 2);
    expect(markerCount()).toBe(baseline + 2);
    pressKey('z', { ctrlKey: true });
    expect(markerCount()).toBe(baseline + 1);      // exactly one undo — no duplicate handler
  });
});

describe('structureModeController detach()', () => {
  it('window Escape exits the mode while attached; after detach the mode persists', () => {
    const stack = realStack();
    const handles = attachStructureModeController({ ...stack.context, openContextMenu: () => undefined });

    handles.setMode('room');
    expect(stack.context.modes.current).toBe('room');
    pressKey('Escape');
    expect(stack.context.modes.current).toBeNull();

    handles.setMode('room');
    handles.detach();
    pressKey('Escape');
    expect(stack.context.modes.current).toBe('room');   // listener removed: Esc no longer exits
  });

  it('re-attach handles Escape exactly once (no duplicate handlers)', () => {
    const stack = realStack();
    const first = attachStructureModeController({ ...stack.context, openContextMenu: () => undefined });
    first.detach();
    const second = attachStructureModeController({ ...stack.context, openContextMenu: () => undefined });

    second.setMode('room');
    pressKey('Escape');
    expect(stack.context.modes.current).toBeNull();
    // A second Escape with no active mode must not re-toggle anything.
    pressKey('Escape');
    expect(stack.context.modes.current).toBeNull();
  });
});

describe('dragPlaceController detach()', () => {
  function legendMarkup(): void {
    document.body.innerHTML =
      '<div id="dm-map"></div>' +
      '<button class="legend-item" data-marker-type="monster"><span data-icon="monster"></span></button>';
  }

  function pressLegendItem(): void {
    document.querySelector('.legend-item')!.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  }

  it('a legend pointerdown starts a drag (ghost appears) while attached, not after detach', () => {
    legendMarkup();
    const stack = realStack();
    const handles = attachDragPlaceController(stack.context);

    pressLegendItem();
    expect(document.querySelector('.drag-ghost')).not.toBeNull();
    window.dispatchEvent(new MouseEvent('pointerup'));            // finish the drag (no target: no-op)
    expect(document.querySelector('.drag-ghost')).toBeNull();

    handles.detach();
    pressLegendItem();
    expect(document.querySelector('.drag-ghost')).toBeNull();     // listener removed: no drag starts
  });

  it('detach() mid-drag aborts and cleans up the ghost', () => {
    legendMarkup();
    const stack = realStack();
    const handles = attachDragPlaceController(stack.context);
    pressLegendItem();
    expect(document.querySelector('.drag-ghost')).not.toBeNull();
    handles.detach();
    expect(document.querySelector('.drag-ghost')).toBeNull();
  });
});
