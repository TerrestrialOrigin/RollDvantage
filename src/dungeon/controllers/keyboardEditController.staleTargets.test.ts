/* jsdom tests for N1 (invalidate-stale-targets-on-restore): a keyboard-held
   marker is a raw index into the live dungeon. An undo/redo restores a FRESH
   deep-copied snapshot (History.undo -> JSON.parse; DungeonStore.restore adopts
   it), so the held index is stale afterward and a subsequent drop would act on
   the wrong/absent marker. The fix releases the hold whenever the store changes
   underneath the controller. Built on the REAL store/history/editor stack; only
   the DOM keydowns are synthesized. GATE 2b: removing the release must redden
   the "wrong marker moved" assertion below. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { History } from '../state/history';
import { DungeonStore } from '../state/dungeonStore';
import { createDungeonEditor, type DungeonEditor } from '../api/dungeonEditor';
import { attachKeyboardEditController } from './keyboardEditController';
import type { StructureModeHandles } from './structureModeController';
import type { ControllerContext, ModeState } from './types';
import type { Dungeon } from '../model/types';

function memStore(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  const data: Record<string, string> = {};
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

/** A 6x6 dungeon with one fully-open floor row (y = 2), no rooms, no markers. */
function openRowDungeon(): Dungeon {
  const gridWidth = 6, gridHeight = 6;
  const floor = Array.from({ length: gridHeight }, () => new Array<number>(gridWidth).fill(0));
  const row = floor[2];
  if (row) for (let x = 0; x < gridWidth; x++) row[x] = 1;    // whole row is placeable floor
  return {
    seed: 1, name: 'Stale Target Test', depth: 'Depth 1',
    grid: { width: gridWidth, height: gridHeight, cellSize: 24 },
    floor, rooms: [], markers: [],
    tally: { rooms: 0, foes: 0, traps: 0, loot: 0, secret: 0 },
  };
}

interface Stack {
  editor: DungeonEditor;
  context: ControllerContext;
  getDungeon: () => Dungeon;
  structureModes: StructureModeHandles;
}

function realStack(dungeon: Dungeon): Stack {
  const history = new History();
  const store = new DungeonStore(history, memStore());
  const editor = createDungeonEditor(store, history);
  editor.loadFromJson(dungeon);
  const modes: ModeState = { current: null, selectedMarkerType: null };
  const structureModes: StructureModeHandles = { setMode: vi.fn(), updateModeHint: vi.fn(), detach: vi.fn() };
  return {
    editor,
    context: { editor, getDungeon: () => store.getCurrent()!, modes },
    getDungeon: () => store.getCurrent()!,
    structureModes,
  };
}

function setup(dungeon: Dungeon): Stack {
  document.body.innerHTML = '<div id="dm-map"><svg></svg></div><div id="mode-hint"></div>';
  const stack = realStack(dungeon);
  attachKeyboardEditController({
    ...stack.context,
    openNoteAtCell: vi.fn(),
    structureModes: stack.structureModes,
    openContextMenu: vi.fn(),
  });
  return stack;
}

const dmWrap = (): HTMLElement => document.getElementById('dm-map')!;
function press(key: string, init: KeyboardEventInit = {}): void {
  dmWrap().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}
function walkTo(dungeon: Dungeon, gridX: number, gridY: number): void {
  for (let step = 0; step < dungeon.grid.width; step++) press('ArrowLeft');
  for (let step = 0; step < dungeon.grid.height; step++) press('ArrowUp');
  for (let step = 0; step < gridX; step++) press('ArrowRight');
  for (let step = 0; step < gridY; step++) press('ArrowDown');
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('keyboard held marker survives no store restore', () => {
  it('an undo after pickup releases the hold — a later Enter never moves a marker at the stale index', () => {
    const stack = setup(openRowDungeon());
    // Two markers on the open row; delete the first so indices shift.
    stack.editor.addMarker('monster', 1, 2);                 // index 0
    stack.editor.addMarker('treasure', 3, 2);                // index 1
    stack.editor.deleteMarker(0);                            // -> [treasure@(3,2)] at index 0

    // Grab the survivor (treasure) — it is index 0 in the current dungeon.
    walkTo(stack.getDungeon(), 3, 2);
    press('m');

    // Undo the delete: restores [monster@(1,2), treasure@(3,2)]. Index 0 is now
    // MONSTER, not the treasure the user is holding.
    stack.editor.undo();
    const afterUndo = stack.getDungeon();
    expect(afterUndo.markers).toHaveLength(2);
    expect(afterUndo.markers[0]!.type).toBe('monster');

    const moveSpy = vi.spyOn(stack.editor, 'moveMarker');

    // Drop on an empty placeable cell. With the hold released, this must NOT move
    // any marker (it falls through to the cursor's default action).
    walkTo(stack.getDungeon(), 5, 2);
    press('Enter');

    expect(moveSpy).not.toHaveBeenCalled();                 // stale-index move must never fire
    const dungeon = stack.getDungeon();
    // Both markers remain exactly where the restored snapshot placed them.
    const monster = dungeon.markers.find((marker) => marker.type === 'monster')!;
    const treasure = dungeon.markers.find((marker) => marker.type === 'treasure')!;
    expect({ gridX: monster.gridX, gridY: monster.gridY }).toEqual({ gridX: 1, gridY: 2 });
    expect({ gridX: treasure.gridX, gridY: treasure.gridY }).toEqual({ gridX: 3, gridY: 2 });
    // Nothing was relocated onto the drop cell.
    expect(dungeon.markers.some((marker) => marker.gridX === 5 && marker.gridY === 2)).toBe(false);
  });
});
