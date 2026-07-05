/* ============================================================
   Dungeon file persistence.

   Pure core (serialize / filename / parse+validate+migrate) is unit-tested; the
   DOM wrappers (download via an <a>, read via FileReader) are thin. This is the
   app's untrusted-input boundary: `isValidDungeon` structurally validates a
   parsed file (either secret-path schema), and `migrateDungeon` normalizes the
   documented legacy SecretPath L-schema to the current straight-centerline
   schema and stamps the file version — so nothing past this boundary ever sees
   a malformed or legacy shape.
   ============================================================ */
import type { Dungeon, ExternalDungeon, SecretPath, LegacySecretPath } from '../model/types';

export const DUNGEON_SCHEMA_VERSION = 1;

/** How long a download's object URL stays alive after the click — long enough
    for the browser to begin the download; there is no observable "download
    started" condition to wait on, so this stays a timer by design. */
const OBJECT_URL_REVOKE_DELAY_MS = 1500;

export class InvalidDungeonFileError extends Error {
  constructor() {
    super('That file is not a valid RollDvantage dungeon file.');
    this.name = 'InvalidDungeonFileError';
  }
}

/** Pretty-printed JSON, exactly as the original Save produced. The internal
    grid maps back to the external `gw`/`gh` schema so files stay byte-
    compatible with earlier builds (spread keeps every key in its position). */
export function serializeDungeon(dungeon: Dungeon): string {
  const external: ExternalDungeon = {
    ...dungeon,
    grid: { gw: dungeon.grid.width, gh: dungeon.grid.height, cell: dungeon.grid.cell },
  };
  return JSON.stringify(external, null, 2);
}

/** `<name-slug>-<SEED-hex>.dungeon`, matching the original filename scheme. */
export function dungeonFilename(dungeon: Dungeon): string {
  const slug = (dungeon.name || 'dungeon').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug + '-' + (dungeon.seed >>> 0).toString(16).toUpperCase() + '.dungeon';
}

/* ---------- structural validation helpers ---------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** An integer cell coordinate inside the grid rectangle `[0, columns) × [0, rows)`. */
function isCellInBounds(x: unknown, y: unknown, columns: number, rows: number): boolean {
  return isInteger(x) && isInteger(y) && x >= 0 && x < columns && y >= 0 && y < rows;
}

/** A rows×columns matrix of numbers (the floor / secretFloor occupancy grids). */
function isNumberMatrix(value: unknown, rows: number, columns: number): boolean {
  if (!Array.isArray(value) || value.length !== rows) return false;
  return value.every((row) => Array.isArray(row) && row.length === columns && row.every((cell) => isFiniteNumber(cell)));
}

/** A room/secret-room rectangle: integer origin and dimensions that stay inside
    the grid rectangle (`x + w ≤ columns`, `y + h ≤ rows`). Optional `cx`/`cy`
    centre cells, when present, must be integer cells in bounds. */
function isValidRoom(value: unknown, columns: number, rows: number): boolean {
  if (!isRecord(value)) return false;
  if (!isInteger(value.x) || !isInteger(value.y) || !isInteger(value.w) || !isInteger(value.h)) return false;
  if (value.x < 0 || value.y < 0 || value.w < 0 || value.h < 0) return false;
  if (value.x + value.w > columns || value.y + value.h > rows) return false;
  if (value.cx != null && !isCellInBounds(value.cx, value.y, columns, rows)) return false;
  if (value.cy != null && !isCellInBounds(value.x, value.cy, columns, rows)) return false;
  return true;
}

function isValidMarker(value: unknown, columns: number, rows: number): boolean {
  return isRecord(value) && typeof value.type === 'string' && isCellInBounds(value.x, value.y, columns, rows);
}

function isValidCorridorNote(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

/** Modern secret-path endpoints are integer cells inside the grid rectangle. */
function isModernSecretPath(value: unknown, columns: number, rows: number): value is SecretPath {
  return isRecord(value) && isCellInBounds(value.x1, value.y1, columns, rows) && isCellInBounds(value.x2, value.y2, columns, rows);
}

/** Type guard for migration only — no bounds (legacy L-paths are normalized at
    load and never re-emitted; endpoints are checked finite, not in-bounds). */
function looksLikeModernSecretPath(value: unknown): value is SecretPath {
  return isRecord(value) && isFiniteNumber(value.x1) && isFiniteNumber(value.y1) && isFiniteNumber(value.x2) && isFiniteNumber(value.y2);
}

function isLegacySecretPath(value: unknown): value is LegacySecretPath {
  return isRecord(value) && isFiniteNumber(value.ax) && isFiniteNumber(value.ay) && isFiniteNumber(value.bx) && isFiniteNumber(value.by);
}

/** Secret paths validate in either schema; `migrateDungeon` normalizes afterwards.
    Modern endpoints must be in-bounds integer cells; legacy L-paths keep a
    finite-only check (they are migrated immediately at load). */
function isValidSecretPath(value: unknown, columns: number, rows: number): boolean {
  return isModernSecretPath(value, columns, rows) || isLegacySecretPath(value);
}

/** The five dungeon feature counts every render path dereferences. */
function isValidTally(value: unknown): boolean {
  return isRecord(value)
    && isFiniteNumber(value.rooms) && isFiniteNumber(value.foes) && isFiniteNumber(value.traps)
    && isFiniteNumber(value.loot) && isFiniteNumber(value.secret);
}

function isArrayOf(value: unknown, itemCheck: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(itemCheck);
}

function hasValidGrid(candidate: Record<string, unknown>): candidate is Record<string, unknown> & { grid: { gw: number; gh: number; cell: number } } {
  const grid = candidate.grid;
  return isRecord(grid) && isFiniteNumber(grid.gw) && isFiniteNumber(grid.gh) && isFiniteNumber(grid.cell);
}

/** Optional fields must be absent (undefined/null, as older files and the
    generator's empty mode emit) or valid; presence with the wrong shape rejects. */
function hasValidOptionalFields(candidate: Record<string, unknown>, rows: number, columns: number): boolean {
  if (candidate.secretFloor != null && !isNumberMatrix(candidate.secretFloor, rows, columns)) return false;
  if (candidate.secretRooms != null && !isArrayOf(candidate.secretRooms, (room) => isValidRoom(room, columns, rows))) return false;
  if (candidate.secretPaths != null && !isArrayOf(candidate.secretPaths, (path) => isValidSecretPath(path, columns, rows))) return false;
  if (candidate.corridorNotes != null && !isArrayOf(candidate.corridorNotes, isValidCorridorNote)) return false;
  return true;
}

/**
 * Structural validation of untrusted input (the external `gw`/`gh` schema —
 * `migrateDungeon` maps it to the internal shape). Verifies everything editing
 * and rendering rely on: finite seed/grid numbers, a grid-shaped numeric
 * floor, and correctly-shaped feature arrays (secret paths in either schema).
 */
export function isValidDungeon(value: unknown): value is ExternalDungeon {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.seed)) return false;
  if (typeof value.name !== 'string' || typeof value.depth !== 'string') return false;
  if (!isValidTally(value.tally)) return false;
  if (!hasValidGrid(value)) return false;
  const { gw: columns, gh: rows } = value.grid;
  if (!isNumberMatrix(value.floor, rows, columns)) return false;
  if (!isArrayOf(value.rooms, (room) => isValidRoom(room, columns, rows))) return false;
  if (!isArrayOf(value.markers, (marker) => isValidMarker(marker, columns, rows))) return false;
  return hasValidOptionalFields(value, rows, columns);
}

/* ---------- legacy migration ---------- */

/** One straight segment per leg of a legacy L-path (degenerate legs dropped). */
function legacyPathToSegments(path: LegacySecretPath): SecretPath[] {
  const corner = path.horizFirst
    ? { x: path.bx, y: path.ay }  // horizontal leg first: corner shares the start row
    : { x: path.ax, y: path.by }; // vertical leg first: corner shares the start column
  const legs: SecretPath[] = [
    { x1: path.ax, y1: path.ay, x2: corner.x, y2: corner.y },
    { x1: corner.x, y1: corner.y, x2: path.bx, y2: path.by },
  ];
  return legs.filter((leg) => leg.x1 !== leg.x2 || leg.y1 !== leg.y2);
}

/**
 * Normalize a structurally valid external dungeon to the internal schema:
 * the abbreviated `gw`/`gh` grid becomes the full-name `Grid`, legacy secret
 * paths become straight centerline segments, and the schema version is
 * stamped. Consumers past the load boundary may assume the modern shape.
 */
export function migrateDungeon(raw: ExternalDungeon): Dungeon {
  const rawPaths = (raw.secretPaths ?? []) as unknown[];
  if (rawPaths.length > 0) {
    raw.secretPaths = rawPaths.flatMap((path) =>
      looksLikeModernSecretPath(path) ? [path] : legacyPathToSegments(path as LegacySecretPath));
  }
  raw.version = DUNGEON_SCHEMA_VERSION;
  const dungeon = raw as unknown as Dungeon;
  dungeon.grid = { width: raw.grid.gw, height: raw.grid.gh, cell: raw.grid.cell };
  return dungeon;
}

/** Parse + validate + migrate dungeon JSON. Throws InvalidDungeonFileError on bad input. */
export function parseDungeonText(text: string): Dungeon {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidDungeonFileError();
  }
  if (!isValidDungeon(parsed)) throw new InvalidDungeonFileError();
  return migrateDungeon(parsed);
}

/** Trigger a browser download of the dungeon as a .dungeon file. */
export function downloadDungeon(dungeon: Dungeon): void {
  const json = serializeDungeon(dungeon);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = dungeonFilename(dungeon);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => { URL.revokeObjectURL(url); }, OBJECT_URL_REVOKE_DELAY_MS);
}

/** Read + parse + validate a File. Rejects with InvalidDungeonFileError on bad input. */
export function readDungeonFile(file: File): Promise<Dungeon> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseDungeonText(typeof reader.result === 'string' ? reader.result : ''));
      } catch (error) {
        reject(error instanceof Error ? error : new InvalidDungeonFileError());
      }
    };
    reader.onerror = () => reject(new InvalidDungeonFileError());
    reader.readAsText(file);
  });
}
