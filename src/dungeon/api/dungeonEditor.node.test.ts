// @vitest-environment node
/* ============================================================
   MCP-READINESS — drives DungeonEditor with NO DOM (node environment, no jsdom).
   If any part of the editing core touched window/document this would throw.
   This is the contract a future MCP server relies on.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { createDungeonEditor } from './dungeonEditor';
import { DungeonStore, type KeyValueStore } from '../state/dungeonStore';
import { History } from '../state/history';
import { parseDungeonText } from '../persistence/dungeonFile';

function memStore(): KeyValueStore {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
}

function makeEditor() {
  const history = new History();
  const store = new DungeonStore(history, memStore());
  // Deterministic seed source.
  const editor = createDungeonEditor(store, history, () => 0xc0ffee);
  return { editor, store };
}

describe('DungeonEditor runs headless (no DOM)', () => {
  it('confirms there is no document/window in this environment', () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
  });

  it('generates, edits, and serializes a valid dungeon', () => {
    const { editor } = makeEditor();
    editor.generate('detailed');
    const markersBefore = editor.getState().dungeon!.markers.length;

    editor.addMarker('monster', 0, 0); // (0,0) may be wall, but addMarker is unconditional
    expect(editor.getState().dungeon!.markers.length).toBe(markersBefore + 1);

    // round-trips through JSON
    const json = editor.toJson();
    const reparsed = parseDungeonText(json);
    expect(reparsed.markers.length).toBe(markersBefore + 1);
  });

  it('supports undo/redo without a DOM', () => {
    const { editor } = makeEditor();
    editor.generate('full');
    const before = editor.getState().dungeon!.markers.length;
    editor.addMarker('treasure', 1, 1);
    expect(editor.canUndo()).toBe(true);

    editor.undo();
    expect(editor.getState().dungeon!.markers.length).toBe(before);
    editor.redo();
    expect(editor.getState().dungeon!.markers.length).toBe(before + 1);
  });

  it('loads from JSON and adopts the level', () => {
    const { editor, store } = makeEditor();
    editor.generate('full', 42);
    const json = editor.toJson();
    editor.loadFromJson({ ...parseDungeonText(json), level: 5 });
    expect(store.getLevel()).toBe(5);
    expect(store.isDirty()).toBe(false);
  });

  it('loads a legacy-schema file through the real path, migrated, and secret ops work on it', () => {
    // The documented legacy shape: L-schema secretPaths (ax/ay/bx/by/horizFirst).
    const gridWidth = 6, gridHeight = 5;
    const floor = Array.from({ length: gridHeight }, () => new Array<number>(gridWidth).fill(0));
    const floorRowOne = floor[1];
    const floorRowTwo = floor[2];
    if (floorRowOne && floorRowTwo) {
      floorRowOne[1] = floorRowOne[2] = floorRowTwo[1] = floorRowTwo[2] = 1;
    }
    const secretFloor = Array.from({ length: gridHeight }, () => new Array<number>(gridWidth).fill(0));
    const secretRowThree = secretFloor[3];
    if (secretRowThree) secretRowThree[1] = secretRowThree[2] = secretRowThree[3] = 1;
    const legacyJson = JSON.stringify({
      seed: 123, name: 'Old Keep', depth: 'Depth 2', level: 2,
      grid: { gw: gridWidth, gh: gridHeight, cell: 24 },
      floor, rooms: [{ x: 1, y: 1, w: 2, h: 2, id: 1 }],
      markers: [{ type: 'secret', x: 2, y: 3, placed: true }],
      secretFloor,
      secretPaths: [{ ax: 1, ay: 3, bx: 3, by: 3, horizFirst: true }],
      tally: { rooms: 1, foes: 0, traps: 0, loot: 0, secret: 1 },
    });

    const { editor } = makeEditor();
    editor.loadFromJson(parseDungeonText(legacyJson));
    const loaded = editor.getState().dungeon!;
    expect(loaded.secretPaths).toEqual([{ startX: 1, startY: 3, endX: 3, endY: 3 }]); // migrated to full-name schema
    expect(loaded.version).toBe(2);

    // A consumer of the migrated shape works: unmake the secret passage.
    editor.unmakeSecret(2, 3);
    const after = editor.getState().dungeon!;
    expect(after.secretPaths).toHaveLength(0);
    expect(after.floor[3]?.[2]).toBe(1); // passage back on the visible floor
  });

  it('rejects structurally hostile JSON at the boundary', () => {
    expect(() => parseDungeonText('{"grid":{"gw":2,"gh":1,"cell":24},"floor":"x","markers":{},"seed":1}')).toThrow();
  });
});

describe('DungeonEditor out-of-range marker guards (M9)', () => {
  it('moveMarker/deleteMarker/retypeMarker on an out-of-range index are safe no-ops', () => {
    const { editor } = makeEditor();
    editor.generate('detailed');
    const before = JSON.stringify(editor.getState().dungeon!.markers);
    const outOfRange = editor.getState().dungeon!.markers.length + 50;

    // Each guard (if (!marker) return / if (markers[index])) means these must
    // neither throw nor mutate. Removing a guard turns these into a crash.
    expect(() => editor.moveMarker(outOfRange, 3, 3)).not.toThrow();
    expect(() => editor.retypeMarker(outOfRange, 'boss')).not.toThrow();
    expect(() => editor.deleteMarker(outOfRange)).not.toThrow();
    expect(() => editor.deleteMarker(-1)).not.toThrow();

    expect(JSON.stringify(editor.getState().dungeon!.markers)).toBe(before); // unchanged
  });
});
