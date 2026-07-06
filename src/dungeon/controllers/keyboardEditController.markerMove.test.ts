/* jsdom tests for keyboard marker move/retype (Change 11, F-2). Built on the
   REAL store/history/editor stack (DOM-free core) — only the DOM keydowns are
   synthesized. These are the GATE 2b mutation checks: deleting the grab/drop/
   retype dispatch must fail them. */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { generateDungeon } from 'auto-stuff-generator';
import { History } from '../state/history';
import { DungeonStore } from '../state/dungeonStore';
import { createDungeonEditor, type DungeonEditor } from '../api/dungeonEditor';
import { migrateDungeon } from '../persistence/dungeonFile';
import { attachKeyboardEditController } from './keyboardEditController';
import type { StructureModeHandles } from './structureModeController';
import type { ControllerContext, ModeState } from './types';
import type { Dungeon, Marker } from '../model/types';

function memStore(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  const data: Record<string, string> = {};
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

interface Stack {
  editor: DungeonEditor;
  context: ControllerContext;
  getDungeon: () => Dungeon;
  openNoteAtCell: Mock<(cellX: number, cellY: number) => void>;
  structureModes: StructureModeHandles;
  openContextMenu: Mock<(gridX: number, gridY: number, clientX: number, clientY: number) => void>;
}

function realStack(dungeon?: Dungeon): Stack {
  const history = new History();
  const store = new DungeonStore(history, memStore());
  const editor = createDungeonEditor(store, history);
  editor.loadFromJson(dungeon ?? migrateDungeon(
    JSON.parse(JSON.stringify(generateDungeon(0xc0ffee, 3, 'full')))));
  const modes: ModeState = { current: null, selectedMarkerType: null };
  const structureModes: StructureModeHandles = { setMode: vi.fn(), updateModeHint: vi.fn(), detach: vi.fn() };
  const openNoteAtCell: Mock<(cellX: number, cellY: number) => void> = vi.fn();
  const openContextMenu: Mock<(gridX: number, gridY: number, clientX: number, clientY: number) => void> = vi.fn();
  return {
    editor,
    context: { editor, getDungeon: () => store.getCurrent()!, modes },
    getDungeon: () => store.getCurrent()!,
    openNoteAtCell,
    structureModes,
    openContextMenu,
  };
}

/** A placeable floor cell not occupied by any marker. */
function placeableCell(dungeon: Dungeon, skip = new Set<string>()): { gridX: number; gridY: number } {
  const occupied = new Set(dungeon.markers.map((marker) => marker.gridX + ',' + marker.gridY));
  for (let gridY = 0; gridY < dungeon.grid.height; gridY++) {
    for (let gridX = 0; gridX < dungeon.grid.width; gridX++) {
      const key = gridX + ',' + gridY;
      if (dungeon.floor[gridY]?.[gridX] === 1 && !occupied.has(key) && !skip.has(key)) return { gridX, gridY };
    }
  }
  throw new Error('no placeable cell in fixture');
}

/** A non-floor (empty) cell. */
function emptyCell(dungeon: Dungeon): { gridX: number; gridY: number } {
  for (let gridY = 0; gridY < dungeon.grid.height; gridY++) {
    for (let gridX = 0; gridX < dungeon.grid.width; gridX++) {
      if (dungeon.floor[gridY]?.[gridX] !== 1) return { gridX, gridY };
    }
  }
  throw new Error('no empty cell in fixture');
}

function setup(dungeon?: Dungeon): Stack {
  document.body.innerHTML = '<div id="dm-map"><svg></svg></div><div id="mode-hint"></div>';
  const stack = realStack(dungeon);
  attachKeyboardEditController({ ...stack.context, openNoteAtCell: stack.openNoteAtCell, structureModes: stack.structureModes, openContextMenu: stack.openContextMenu });
  return stack;
}

const dmWrap = (): HTMLElement => document.getElementById('dm-map')!;

function press(key: string, init: KeyboardEventInit = {}): void {
  dmWrap().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

/** Walk the cell cursor from anywhere to an exact grid cell (clamp then step). */
function walkTo(dungeon: Dungeon, gridX: number, gridY: number): void {
  for (let step = 0; step < dungeon.grid.width; step++) press('ArrowLeft');
  for (let step = 0; step < dungeon.grid.height; step++) press('ArrowUp');
  for (let step = 0; step < gridX; step++) press('ArrowRight');
  for (let step = 0; step < gridY; step++) press('ArrowDown');
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('keyboard marker move', () => {
  it('m picks up a marker and Enter drops it on a placeable cell via moveMarker', () => {
    const stack = setup();
    const dungeon = stack.getDungeon();
    const origin = placeableCell(dungeon);
    stack.editor.addMarker('monster', origin.gridX, origin.gridY);
    const index = stack.getDungeon().markers.length - 1;
    const destination = placeableCell(stack.getDungeon(), new Set([origin.gridX + ',' + origin.gridY]));
    const moveSpy = vi.spyOn(stack.editor, 'moveMarker');

    walkTo(stack.getDungeon(), origin.gridX, origin.gridY);
    press('m');
    walkTo(stack.getDungeon(), destination.gridX, destination.gridY);
    press('Enter');

    expect(moveSpy).toHaveBeenCalledWith(index, destination.gridX, destination.gridY);
    const marker = stack.getDungeon().markers[index]!;
    expect({ gridX: marker.gridX, gridY: marker.gridY }).toEqual(destination);
    expect(stack.getDungeon().markers).toHaveLength(index + 1);   // moved, not duplicated
  });

  it('a moved marker keeps its note/label', () => {
    const stack = setup();
    const dungeon = stack.getDungeon();
    const origin = placeableCell(dungeon);
    stack.editor.addMarker('monster', origin.gridX, origin.gridY);
    const index = stack.getDungeon().markers.length - 1;
    const marker = stack.getDungeon().markers[index]!;
    stack.editor.setNote(marker, stack.getDungeon().markers, 'guardian', 'The Guardian');
    const destination = placeableCell(stack.getDungeon(), new Set([origin.gridX + ',' + origin.gridY]));

    walkTo(stack.getDungeon(), origin.gridX, origin.gridY);
    press('m');
    walkTo(stack.getDungeon(), destination.gridX, destination.gridY);
    press('Enter');

    const moved = stack.getDungeon().markers[index]!;
    expect(moved.note).toBe('guardian');
    expect(moved.label).toBe('The Guardian');
    expect({ gridX: moved.gridX, gridY: moved.gridY }).toEqual(destination);
  });

  it('m on an empty (marker-less) cell picks nothing up — Enter falls through to annotate', () => {
    const stack = setup();
    const dungeon = stack.getDungeon();
    const empty = placeableCell(dungeon);           // floor, no marker
    const moveSpy = vi.spyOn(stack.editor, 'moveMarker');

    walkTo(dungeon, empty.gridX, empty.gridY);
    press('m');                                     // nothing to grab
    press('Enter');                                 // no tool, not holding -> annotate

    expect(moveSpy).not.toHaveBeenCalled();
    expect(stack.openNoteAtCell).toHaveBeenCalledWith(empty.gridX, empty.gridY);
  });

  it('dropping a held marker on a non-placeable cell is denied (no move)', () => {
    const stack = setup();
    const dungeon = stack.getDungeon();
    const origin = placeableCell(dungeon);
    stack.editor.addMarker('monster', origin.gridX, origin.gridY);
    const index = stack.getDungeon().markers.length - 1;
    const empty = emptyCell(stack.getDungeon());
    const moveSpy = vi.spyOn(stack.editor, 'moveMarker');

    walkTo(stack.getDungeon(), origin.gridX, origin.gridY);
    press('m');
    walkTo(stack.getDungeon(), empty.gridX, empty.gridY);
    press('Enter');                                 // denied — empty cell is not placeable

    expect(moveSpy).not.toHaveBeenCalled();
    const marker = stack.getDungeon().markers[index]!;
    expect({ gridX: marker.gridX, gridY: marker.gridY }).toEqual(origin);   // unchanged, still at origin
  });

  it('Escape while holding cancels the pickup (a later Enter no longer moves)', () => {
    const stack = setup();
    const dungeon = stack.getDungeon();
    const origin = placeableCell(dungeon);
    stack.editor.addMarker('monster', origin.gridX, origin.gridY);
    const index = stack.getDungeon().markers.length - 1;
    const destination = placeableCell(stack.getDungeon(), new Set([origin.gridX + ',' + origin.gridY]));
    const moveSpy = vi.spyOn(stack.editor, 'moveMarker');

    walkTo(stack.getDungeon(), origin.gridX, origin.gridY);
    press('m');
    press('Escape');                                // cancel the pickup
    walkTo(stack.getDungeon(), destination.gridX, destination.gridY);
    press('Enter');                                 // not holding anymore

    expect(moveSpy).not.toHaveBeenCalled();
    const marker = stack.getDungeon().markers[index]!;
    expect({ gridX: marker.gridX, gridY: marker.gridY }).toEqual(origin);
  });
});

describe('keyboard marker retype', () => {
  it('t cycles a marker forward and Shift+T backward via retypeMarker', () => {
    const stack = setup();
    const dungeon = stack.getDungeon();
    const cell = placeableCell(dungeon);
    stack.editor.addMarker('monster', cell.gridX, cell.gridY);
    const index = stack.getDungeon().markers.length - 1;
    const retypeSpy = vi.spyOn(stack.editor, 'retypeMarker');

    walkTo(stack.getDungeon(), cell.gridX, cell.gridY);
    press('t');                                     // monster -> boss
    expect(retypeSpy).toHaveBeenLastCalledWith(index, 'boss');
    expect(stack.getDungeon().markers[index]!.type).toBe('boss');

    press('t');                                     // boss -> treasure
    expect(stack.getDungeon().markers[index]!.type).toBe('treasure');

    press('T', { shiftKey: true });                 // treasure -> boss
    expect(stack.getDungeon().markers[index]!.type).toBe('boss');
  });

  it('t on a marker-less cell does nothing', () => {
    const stack = setup();
    const dungeon = stack.getDungeon();
    const empty = placeableCell(dungeon);
    const retypeSpy = vi.spyOn(stack.editor, 'retypeMarker');

    walkTo(dungeon, empty.gridX, empty.gridY);
    press('t');

    expect(retypeSpy).not.toHaveBeenCalled();
  });
});

/* ---- Secret (S) badge: keyboard move/retype must preserve the invariant that
   the badge's position IS the secret status of the floor beneath it (R1). The
   pointer path already special-cases this; the keyboard path must reach parity.

   These use a hand-built dungeon with two independent horizontal corridor runs
   (no rooms, no pre-existing secrets), so the (S) badge and destination are
   exact and deterministic. */
function twoCorridorDungeon(): Dungeon {
  const gridWidth = 6, gridHeight = 6;
  const floor = Array.from({ length: gridHeight }, () => new Array<number>(gridWidth).fill(0));
  const runA = floor[1], runB = floor[4];                     // two separated runs
  if (runA) runA[1] = runA[2] = runA[3] = 1;                  // run A: (1..3, 1)
  if (runB) runB[1] = runB[2] = runB[3] = 1;                  // run B: (1..3, 4)
  return {
    seed: 1, name: 'Secret Test', depth: 'Depth 1',
    grid: { width: gridWidth, height: gridHeight, cellSize: 24 },
    floor, rooms: [], markers: [],
    tally: { rooms: 0, foes: 0, traps: 0, loot: 0, secret: 0 },
  };
}

/** The single (S) badge marker, or undefined. */
function secretBadge(dungeon: Dungeon): Marker | undefined {
  return dungeon.markers.find((marker) => marker.type === 'secret');
}

/** Make run A (row 1) secret and return the resulting (S) badge's cell. */
function secretRunA(stack: Stack): { gridX: number; gridY: number } {
  stack.editor.makeSecret(2, 1);                              // any cell of run A
  const badge = secretBadge(stack.getDungeon());
  if (!badge) throw new Error('makeSecret did not place an (S) badge');
  return { gridX: badge.gridX, gridY: badge.gridY };
}

describe('keyboard secret (S) badge move', () => {
  it('keyboard-moving the (S) badge to a convertible corridor moves the SECRET, not the raw badge', () => {
    const stack = setup(twoCorridorDungeon());
    const badge = secretRunA(stack);
    const destination = { gridX: 2, gridY: 4 };                        // a cell of the still-visible run B

    walkTo(stack.getDungeon(), badge.gridX, badge.gridY);
    press('m');
    walkTo(stack.getDungeon(), destination.gridX, destination.gridY);
    press('Enter');

    const dungeon = stack.getDungeon();
    const badges = dungeon.markers.filter((marker) => marker.type === 'secret');
    expect(badges).toHaveLength(1);                            // still exactly one badge (relocated, not duplicated)
    const moved = badges[0]!;
    // the badge sits on secret floor (its position IS the secret status) — broken today
    expect(dungeon.secretFloor?.[moved.gridY]?.[moved.gridX]).toBe(1);
    // run B became secret; run A returned to visible floor with no orphan badge
    expect(dungeon.secretFloor?.[destination.gridY]?.[destination.gridX]).toBe(1);
    expect(dungeon.floor[badge.gridY]?.[badge.gridX]).toBe(1);
    expect(dungeon.secretFloor?.[badge.gridY]?.[badge.gridX]).toBe(0);
  });

  it('keyboard-dropping the (S) badge on an already-secret cell leaves the secret untouched', () => {
    const stack = setup(twoCorridorDungeon());
    const badge = secretRunA(stack);
    // another cell of run A — placeable (secret floor) but NOT convertible (already secret)
    const alreadySecret = { gridX: badge.gridX === 1 ? 3 : 1, gridY: 1 };

    walkTo(stack.getDungeon(), badge.gridX, badge.gridY);
    press('m');
    walkTo(stack.getDungeon(), alreadySecret.gridX, alreadySecret.gridY);
    press('Enter');

    const dungeon = stack.getDungeon();
    const badges = dungeon.markers.filter((marker) => marker.type === 'secret');
    expect(badges).toHaveLength(1);
    // the badge did NOT relocate — it stays at its original midpoint (moved today)
    expect({ gridX: badges[0]!.gridX, gridY: badges[0]!.gridY }).toEqual(badge);
    expect(dungeon.secretFloor?.[badge.gridY]?.[badge.gridX]).toBe(1);
  });
});

describe('keyboard secret (S) badge retype', () => {
  it('t on an (S) badge is a no-op — it is never cycled into a placeable type', () => {
    const stack = setup(twoCorridorDungeon());
    const badge = secretRunA(stack);
    const retypeSpy = vi.spyOn(stack.editor, 'retypeMarker');

    walkTo(stack.getDungeon(), badge.gridX, badge.gridY);
    press('t');

    expect(retypeSpy).not.toHaveBeenCalled();
    const dungeon = stack.getDungeon();
    const atBadge = dungeon.markers.find((marker) => marker.gridX === badge.gridX && marker.gridY === badge.gridY);
    expect(atBadge?.type).toBe('secret');                      // still a secret badge (becomes 'boss' today)
    expect(dungeon.secretFloor?.[badge.gridY]?.[badge.gridX]).toBe(1); // secret floor intact
  });
});

/* ---- Keyboard context menu (R2): the ContextMenu key / Shift+F10 opens the same
   accessible cell menu the pointer opens on right-click, at the cursor cell — giving
   keyboard parity for the otherwise pointer-only Delete-one-marker and Make-Not-Secret.
   The unit under test is the wiring + cursor→grid mapping; openContextMenu is spied. */
describe('keyboard context menu open', () => {
  it('ContextMenu key over a marker opens the menu at the marker cell', () => {
    const stack = setup();
    const dungeon = stack.getDungeon();
    const cell = placeableCell(dungeon);
    stack.editor.addMarker('monster', cell.gridX, cell.gridY);

    walkTo(stack.getDungeon(), cell.gridX, cell.gridY);
    press('ContextMenu');

    expect(stack.openContextMenu).toHaveBeenCalledTimes(1);
    const call = stack.openContextMenu.mock.calls[0]!;
    expect([call[0], call[1]]).toEqual([cell.gridX, cell.gridY]);      // opened at the cursor's grid cell
    expect(typeof call[2]).toBe('number');                     // a client point was supplied
    expect(typeof call[3]).toBe('number');
  });

  it('Shift+F10 over a marker opens the menu at the marker cell (keyboards without a Menu key)', () => {
    const stack = setup();
    const dungeon = stack.getDungeon();
    const cell = placeableCell(dungeon);
    stack.editor.addMarker('monster', cell.gridX, cell.gridY);

    walkTo(stack.getDungeon(), cell.gridX, cell.gridY);
    press('F10', { shiftKey: true });

    expect(stack.openContextMenu).toHaveBeenCalledTimes(1);
    const call = stack.openContextMenu.mock.calls[0]!;
    expect([call[0], call[1]]).toEqual([cell.gridX, cell.gridY]);
  });

  it('the menu opens at the cursor even on an empty cell — openContextMenu itself no-ops off-feature', () => {
    // The keyboard path mirrors the pointer path: it always calls openContextMenu at the
    // cursor, which early-returns when there is no feature there. So the controller does not
    // pre-filter empty cells; it delegates the "no menu on empty space" decision to the menu.
    const stack = setup();
    const dungeon = stack.getDungeon();
    const empty = emptyCell(dungeon);

    walkTo(dungeon, empty.gridX, empty.gridY);
    press('ContextMenu');

    expect(stack.openContextMenu).toHaveBeenCalledWith(empty.gridX, empty.gridY, expect.any(Number), expect.any(Number));
  });

  it('opening the menu while a marker is held cancels the hold AND opens the menu', () => {
    const stack = setup();
    const dungeon = stack.getDungeon();
    const cell = placeableCell(dungeon);
    stack.editor.addMarker('monster', cell.gridX, cell.gridY);
    const index = stack.getDungeon().markers.length - 1;
    const destination = placeableCell(stack.getDungeon(), new Set([cell.gridX + ',' + cell.gridY]));
    const moveSpy = vi.spyOn(stack.editor, 'moveMarker');

    walkTo(stack.getDungeon(), cell.gridX, cell.gridY);
    press('m');                                                 // pick the marker up
    press('ContextMenu');                                       // opening cancels the hold
    expect(stack.openContextMenu).toHaveBeenCalledTimes(1);

    // the hold was released: a later Enter at another cell must NOT move the marker
    walkTo(stack.getDungeon(), destination.gridX, destination.gridY);
    press('Enter');
    expect(moveSpy).not.toHaveBeenCalled();
    expect({ gridX: stack.getDungeon().markers[index]!.gridX, gridY: stack.getDungeon().markers[index]!.gridY }).toEqual(cell);
  });
});
