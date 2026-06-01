/* ============================================================
   DungeonStore — single source of truth for current/dirty/level.

   Owns the `refresh()` chokepoint (the original invariant: every map mutation
   funnels through one place that relabels, re-renders, marks dirty, and records
   history). Re-render is delivered via subscribe() rather than direct DOM calls,
   so the store is DOM-free and React-friendly (getState + subscribe match
   useSyncExternalStore). Level persistence goes through an injected KeyValueStore.
   ============================================================ */
import type { Dungeon } from '../model/types';
import { relabel } from '../contentsKey/labels';
import type { History } from './history';

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 6;
export const LEVEL_STORAGE_KEY = 'dungeon_level';

/** Minimal persistence seam (localStorage in the browser, in-memory in tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DungeonState {
  dungeon: Dungeon | null;
  dirty: boolean;
  level: number;
}

export function clampLevel(value: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, value));
}

export class DungeonStore {
  private current: Dungeon | null = null;
  private dirty = false;
  private level: number;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly history: History, private readonly storage: KeyValueStore) {
    const stored = parseInt(this.storage.getItem(LEVEL_STORAGE_KEY) ?? '3', 10) || 3;
    this.level = clampLevel(stored);
  }

  getCurrent(): Dungeon | null { return this.current; }
  isDirty(): boolean { return this.dirty; }
  setDirty(value: boolean): void { this.dirty = value; }
  getLevel(): number { return this.level; }

  getState(): DungeonState { return { dungeon: this.current, dirty: this.dirty, level: this.level }; }

  /** Clamp + persist the level. Does not regenerate — the caller decides that. */
  setLevel(value: number): void {
    this.level = clampLevel(value);
    this.storage.setItem(LEVEL_STORAGE_KEY, String(this.level));
  }

  /** React/useSyncExternalStore-shaped subscription; returns an unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void { this.listeners.forEach((listener) => listener()); }

  /**
   * The single chokepoint after any map mutation: relabel, re-render (notify),
   * mark dirty, and record history — in the original order.
   */
  refresh(): void {
    if (this.current) relabel(this.current);
    this.notify();
    this.dirty = true;
    this.history.record(this.current!);
  }

  /** Adopt a freshly generated/loaded dungeon: refresh, then clear the dirty flag. */
  loadFresh(dungeon: Dungeon): void {
    this.current = dungeon;
    this.refresh();
    this.dirty = false;
  }

  /** Restore a snapshot (undo/redo): relabel + re-render WITHOUT recording history. */
  restore(dungeon: Dungeon): void {
    this.current = dungeon;
    if (this.current) relabel(this.current);
    this.notify();
    this.dirty = true;
  }
}
