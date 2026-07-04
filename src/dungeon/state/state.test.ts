import { describe, it, expect } from 'vitest';
import { History } from './history';
import { DungeonStore, clampLevel, type KeyValueStore } from './dungeonStore';
import type { Dungeon } from '../model/types';

function memStore(initial: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
}
const dungeon = (name: string): Dungeon => ({ name, markers: [], rooms: [] } as unknown as Dungeon);

describe('History', () => {
  it('dedups an unchanged snapshot', () => {
    const h = new History();
    const d = dungeon('a');
    h.record(d); h.record(d);
    expect(h.canUndo()).toBe(false); // only one snapshot
  });

  it('undo/redo walk the stack and toggle availability', () => {
    const h = new History();
    h.record(dungeon('a')); h.record(dungeon('b')); h.record(dungeon('c'));
    expect(h.canUndo()).toBe(true);
    expect(h.undo()!.name).toBe('b');
    expect(h.undo()!.name).toBe('a');
    expect(h.canUndo()).toBe(false);
    expect(h.redo()!.name).toBe('b');
    expect(h.canRedo()).toBe(true);
  });

  it('a new record truncates the redo branch', () => {
    const h = new History();
    h.record(dungeon('a')); h.record(dungeon('b'));
    h.undo(); // back to a
    h.record(dungeon('c')); // diverge
    expect(h.canRedo()).toBe(false);
    expect(h.undo()!.name).toBe('a');
  });

  it('caps the stack length', () => {
    const h = new History({ max: 3 });
    ['a', 'b', 'c', 'd', 'e'].forEach((n) => h.record(dungeon(n)));
    // only the last 3 survive; walking back hits the floor at 'c'
    expect(h.undo()!.name).toBe('d');
    expect(h.undo()!.name).toBe('c');
    expect(h.canUndo()).toBe(false);
  });
});

describe('DungeonStore level', () => {
  it('clamps to 1..6', () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(99)).toBe(6);
    expect(clampLevel(4)).toBe(4);
  });

  it('restores the persisted level and writes changes back', () => {
    const storage = memStore({ dungeon_level: '5' });
    const store = new DungeonStore(new History(), storage);
    expect(store.getLevel()).toBe(5);
    store.setLevel(9);
    expect(store.getLevel()).toBe(6);
    expect(storage.getItem('dungeon_level')).toBe('6');
  });
});

describe('DungeonStore refresh/restore + history', () => {
  it('loadFresh records a baseline and clears dirty; edits mark dirty; restore does not record', () => {
    const history = new History();
    const store = new DungeonStore(history, memStore());
    store.loadFresh(dungeon('base'));
    expect(store.isDirty()).toBe(false);
    expect(history.canUndo()).toBe(false); // baseline only

    store.getCurrent()!.name = 'edited';
    store.refresh();
    expect(store.isDirty()).toBe(true);
    expect(history.canUndo()).toBe(true);

    const prior = history.undo()!; // -> baseline snapshot
    store.restore(prior);
    expect(store.getCurrent()!.name).toBe('base');
    // restore did not push a new snapshot
    expect(history.canRedo()).toBe(true);
  });

  it('notifies subscribers on refresh', () => {
    const store = new DungeonStore(new History(), memStore());
    let calls = 0;
    const off = store.subscribe(() => { calls++; });
    store.loadFresh(dungeon('x'));
    expect(calls).toBe(1);
    off();
    store.refresh();
    expect(calls).toBe(1); // unsubscribed
  });
});

describe('DungeonStore snapshot contract (useSyncExternalStore)', () => {
  it('getState returns the identical reference between mutations', () => {
    const store = new DungeonStore(new History(), memStore());
    expect(store.getState()).toBe(store.getState());
    store.loadFresh(dungeon('a'));
    const snapshot = store.getState();
    expect(store.getState()).toBe(snapshot);
  });

  it('every mutator produces a fresh snapshot reflecting the new state', () => {
    const store = new DungeonStore(new History(), memStore());
    const initial = store.getState();

    store.loadFresh(dungeon('a'));
    const afterLoad = store.getState();
    expect(afterLoad).not.toBe(initial);
    expect(afterLoad.dungeon!.name).toBe('a');
    expect(afterLoad.dirty).toBe(false);

    store.getCurrent()!.name = 'edited';
    store.refresh();
    const afterRefresh = store.getState();
    expect(afterRefresh).not.toBe(afterLoad);
    expect(afterRefresh.dirty).toBe(true);

    store.setDirty(false);
    const afterSetDirty = store.getState();
    expect(afterSetDirty).not.toBe(afterRefresh);
    expect(afterSetDirty.dirty).toBe(false);

    store.setLevel(5);
    const afterSetLevel = store.getState();
    expect(afterSetLevel).not.toBe(afterSetDirty);
    expect(afterSetLevel.level).toBe(5);

    store.restore(dungeon('restored'));
    const afterRestore = store.getState();
    expect(afterRestore).not.toBe(afterSetLevel);
    expect(afterRestore.dungeon!.name).toBe('restored');
    expect(afterRestore.dirty).toBe(true);
  });

  it('subscribers reading synchronously during refresh see settled dirty and undo availability', () => {
    const history = new History();
    const store = new DungeonStore(history, memStore());
    store.loadFresh(dungeon('base'));

    let seen: { dirty: boolean; canUndo: boolean } | null = null;
    store.subscribe(() => { seen = { dirty: store.getState().dirty, canUndo: history.canUndo() }; });
    store.getCurrent()!.name = 'edited';
    store.refresh();
    expect(seen).toEqual({ dirty: true, canUndo: true });
  });

  it('subscribers reading synchronously during loadFresh see the settled clean state', () => {
    const store = new DungeonStore(new History(), memStore());
    let seenDirty: boolean | null = null;
    store.subscribe(() => { seenDirty = store.getState().dirty; });
    store.loadFresh(dungeon('fresh'));
    expect(seenDirty).toBe(false);
  });
});

describe('History snapshot isolation (M9)', () => {
  it('mutating an undo-returned dungeon does not corrupt the stack', () => {
    const history = new History();
    history.record(dungeon('a'));
    history.record(dungeon('b'));

    const undone = history.undo()!;
    expect(undone.name).toBe('a');
    undone.name = 'corrupted';
    undone.markers.push({ type: 'monster', x: 0, y: 0 });

    expect(history.redo()!.name).toBe('b');
    const backAgain = history.undo()!;
    expect(backAgain.name).toBe('a');
    expect(backAgain.markers).toHaveLength(0);
  });
});
