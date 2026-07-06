/* ============================================================
   DungeonEditor — the single, DOM-free editing surface.

   Composes the store, editing ops, persistence, and history into verbs. The DOM
   controllers translate user gestures into these calls; nothing in the DOM layer
   mutates the dungeon directly. A future MCP server is a thin transport that
   constructs a DungeonEditor over an in-memory store and maps tool calls to the
   same verbs — no editor logic duplicated. This file imports NO DOM API, so it
   runs start-to-finish under Node (proven by dungeonEditor.node.test.ts).
   ============================================================ */
import { generateDungeon } from 'auto-stuff-generator';
import type { Dungeon, MarkerType, Annotatable } from '../model/types';
import { edgeDir } from '../geometry/grid';
import { commitRoom, commitCorridor, commitDelete } from '../editing/structureOps';
import { convertSecretAt, unconvertSecret } from '../editing/secretOps';
import { applyNote, removeNote } from '../editing/noteOps';
import { serializeDungeon, parseDungeonText, isValidDungeon, migrateDungeon } from '../persistence/dungeonFile';
import type { DungeonStore, DungeonState } from '../state/dungeonStore';
import type { History } from '../state/history';

export type GenerationMode = 'empty' | 'full' | 'detailed';

/** A 32-bit seed source. Defaults to Math.random; injectable for determinism. */
export type SeedSource = () => number;

/** Upper bound of the random seed range (the largest unsigned 32-bit value). */
const MAX_SEED = 0xffffffff;

const randomSeed: SeedSource = () => (Math.random() * MAX_SEED) >>> 0;

export interface DungeonEditor {
  generate(mode?: GenerationMode, seed?: number): void;
  setLevel(level: number): void;
  addMarker(type: MarkerType, x: number, y: number): void;
  moveMarker(index: number, x: number, y: number): void;
  deleteMarker(index: number): void;
  retypeMarker(index: number, type: MarkerType): void;
  addRoom(startX: number, startY: number, endX: number, endY: number): void;
  addCorridor(startX: number, startY: number, endX: number, endY: number): void;
  deleteRegion(startX: number, startY: number, endX: number, endY: number): void;
  makeSecret(x: number, y: number): void;
  unmakeSecret(x: number, y: number): void;
  setNote(target: Annotatable, list: Annotatable[] | null, noteText: string, labelText: string): 'saved' | 'removed';
  removeNote(target: Annotatable, list: Annotatable[] | null): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  loadFromJson(dungeon: Dungeon): void;
  toJson(): string;
  getState(): DungeonState;
  subscribe(listener: () => void): () => void;
}

export function createDungeonEditor(store: DungeonStore, history: History, seedSource: SeedSource = randomSeed): DungeonEditor {
  /** Run a mutation against the current dungeon then funnel through the chokepoint. */
  function edit(mutator: (dungeon: Dungeon) => void): void {
    const dungeon = store.getCurrent();
    if (!dungeon) return;
    mutator(dungeon);
    store.refresh();
  }

  function applyEdgeDir(dungeon: Dungeon, type: MarkerType, gridX: number, gridY: number): { type: MarkerType; gridX: number; gridY: number; placed: true; direction?: ReturnType<typeof edgeDir> } {
    const marker: { type: MarkerType; gridX: number; gridY: number; placed: true; direction?: ReturnType<typeof edgeDir> } = { type, gridX, gridY, placed: true };
    if (type === 'entrance' || type === 'exit') marker.direction = edgeDir(dungeon.grid, gridX, gridY);
    return marker;
  }

  return {
    generate(mode: GenerationMode = 'full', seed: number = seedSource()): void {
      const generated: unknown = generateDungeon(seed, store.getLevel(), mode);
      if (!isValidDungeon(generated)) throw new Error('generateDungeon produced a structurally invalid dungeon (seed ' + seed + ', mode ' + mode + ')');
      store.loadFresh(migrateDungeon(generated));
    },

    setLevel(level: number): void {
      store.setLevel(level);
      this.generate('full');
    },

    addMarker(type, x, y): void {
      edit((dungeon) => { dungeon.markers.push(applyEdgeDir(dungeon, type, x, y)); });
    },

    moveMarker(index, gridX, gridY): void {
      edit((dungeon) => {
        const marker = dungeon.markers[index];
        if (!marker) return;
        marker.gridX = gridX; marker.gridY = gridY;
        if (marker.type === 'entrance' || marker.type === 'exit') marker.direction = edgeDir(dungeon.grid, gridX, gridY);
      });
    },

    deleteMarker(index): void {
      edit((dungeon) => { if (dungeon.markers[index]) dungeon.markers.splice(index, 1); });
    },

    retypeMarker(index, type): void {
      edit((dungeon) => {
        const marker = dungeon.markers[index];
        if (!marker) return;
        marker.type = type;
        if (type === 'entrance' || type === 'exit') marker.direction = edgeDir(dungeon.grid, marker.gridX, marker.gridY);
      });
    },

    addRoom(startX, startY, endX, endY): void { edit((dungeon) => commitRoom(dungeon, startX, startY, endX, endY)); },
    addCorridor(startX, startY, endX, endY): void { edit((dungeon) => commitCorridor(dungeon, startX, startY, endX, endY)); },
    deleteRegion(startX, startY, endX, endY): void { edit((dungeon) => commitDelete(dungeon, startX, startY, endX, endY)); },
    makeSecret(x, y): void { edit((dungeon) => convertSecretAt(dungeon, x, y)); },
    unmakeSecret(x, y): void { edit((dungeon) => unconvertSecret(dungeon, x, y)); },

    setNote(target, list, noteText, labelText): 'saved' | 'removed' {
      const dungeon = store.getCurrent();
      if (!dungeon) return 'removed';
      const result = applyNote(dungeon, target, list, noteText, labelText);
      store.refresh();
      return result;
    },

    removeNote(target, list): void {
      edit(() => removeNote(target, list));
    },

    undo(): void { const snapshot = history.undo(); if (snapshot) store.restore(snapshot); },
    redo(): void { const snapshot = history.redo(); if (snapshot) store.restore(snapshot); },
    canUndo(): boolean { return history.canUndo(); },
    canRedo(): boolean { return history.canRedo(); },

    loadFromJson(dungeon: Dungeon): void {
      if (dungeon.level) store.setLevel(dungeon.level | 0);
      store.loadFresh(dungeon);
    },

    toJson(): string {
      const dungeon = store.getCurrent();
      return dungeon ? serializeDungeon(dungeon) : '';
    },

    getState(): DungeonState { return store.getState(); },
    subscribe(listener: () => void): () => void { return store.subscribe(listener); },
  };
}

export { parseDungeonText };
