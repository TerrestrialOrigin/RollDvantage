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
});
