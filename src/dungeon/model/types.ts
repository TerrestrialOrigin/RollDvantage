/* ============================================================
   Domain model — the dungeon JSON object that is the app's source of truth.

   This object is produced by `auto-stuff-generator`'s generateDungeon, serialized
   verbatim on Save, and re-hydrated via JSON.parse on Load and on every undo
   snapshot. It is therefore PLAIN DATA: no methods, fully serializable. All
   behavior over it lives in free functions (geometry, rendering, editing).

   Fields are intentionally permissive/optional to mirror the loosely-typed
   runtime object (older files may omit newer fields).
   ============================================================ */

export type MarkerType =
  | 'entrance'
  | 'exit'
  | 'trap'
  | 'monster'
  | 'boss'
  | 'treasure'
  | 'secret'
  | 'other';

export type Direction = 'up' | 'down' | 'left' | 'right';

/** A 0/1 occupancy matrix indexed as grid[y][x]. */
export type FloorGrid = number[][];

export interface Grid {
  gw: number;
  gh: number;
  cell: number;
}

/** Fields shared by anything that can carry a Contents-Key annotation. */
export interface Annotatable {
  ref?: string;
  note?: string;
  label?: string;
  seq?: number;
}

export interface Marker extends Annotatable {
  type: MarkerType;
  x: number;
  y: number;
  dir?: Direction;
  placed?: boolean;
}

export interface Room extends Annotatable {
  x: number;
  y: number;
  w: number;
  h: number;
  cx?: number;
  cy?: number;
  id?: number;
}

/** Secret passage centerline (current schema). Load-time migration guarantees
    this shape everywhere past the persistence boundary. */
export interface SecretPath {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Legacy L-schema secret passage, accepted only at the load boundary and
    migrated to straight SecretPath segments by `migrateDungeon`. */
export interface LegacySecretPath {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  horizFirst?: boolean;
}

export interface CorridorNote extends Annotatable {
  x: number;
  y: number;
}

export interface Tally {
  rooms: number;
  foes: number;
  traps: number;
  loot: number;
  secret: number;
}

export interface Dungeon {
  version?: number;
  seed: number;
  level?: number;
  name: string;
  depth: string;
  flavor?: string;
  genre?: string;
  tone?: string;
  grid: Grid;
  floor: FloorGrid;
  rooms: Room[];
  markers: Marker[];
  secretFloor?: FloorGrid;
  secretRooms?: Room[];
  secretPaths?: SecretPath[];
  corridorNotes?: CorridorNote[];
  tally: Tally;
  /** Monotonic annotation sequence counter (internal). */
  _seq?: number;
}

/** Options that select what a rendered map reveals. */
export interface RenderOptions {
  secret: boolean;
  dmMarkers: boolean;
}
