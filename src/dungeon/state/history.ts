/* ============================================================
   Undo/redo snapshot stack — pure, DOM-free.

   Snapshots are JSON strings of the dungeon (matching the original, which
   snapshotted via JSON.stringify(current)). Recording dedups against the
   current snapshot, truncates any redo branch, and caps the stack length.
   ============================================================ */
import type { Dungeon } from '../model/types';

export const HISTORY_MAX = 80;

export class History {
  private snapshots: string[] = [];
  private index = -1;
  private readonly max: number;
  private onChange?: () => void;

  constructor(options?: { max?: number; onChange?: () => void }) {
    this.max = options?.max ?? HISTORY_MAX;
    this.onChange = options?.onChange;
  }

  /** Wire (or rewire) the change listener — used to refresh the undo/redo UI. */
  setChangeListener(listener: () => void): void { this.onChange = listener; }

  /** Snapshot the dungeon. No-op if it is unchanged from the current snapshot. */
  record(dungeon: Dungeon): void {
    const snapshot = JSON.stringify(dungeon);
    if (this.index >= 0 && this.snapshots[this.index] === snapshot) return; // nothing actually changed
    this.snapshots = this.snapshots.slice(0, this.index + 1);               // drop any redo branch
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.max) this.snapshots.shift();
    this.index = this.snapshots.length - 1;
    this.onChange?.();
  }

  canUndo(): boolean { return this.index > 0; }
  canRedo(): boolean { return this.index < this.snapshots.length - 1; }

  /** Move back one step and return a fresh copy of that snapshot, or null. */
  undo(): Dungeon | null {
    if (this.index <= 0) return null;
    this.index--;
    this.onChange?.();
    return this.peek();
  }

  /** Move forward one step and return a fresh copy of that snapshot, or null. */
  redo(): Dungeon | null {
    if (this.index >= this.snapshots.length - 1) return null;
    this.index++;
    this.onChange?.();
    return this.peek();
  }

  private peek(): Dungeon | null {
    return this.index < 0 ? null : (JSON.parse(this.snapshots[this.index]) as Dungeon);
  }
}
