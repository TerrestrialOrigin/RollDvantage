/* ============================================================
   Dungeon file persistence.

   Pure core (serialize / filename / parse+validate+migrate) is unit-tested; the
   DOM wrappers (download via an <a>, read via FileReader) are thin. This is the
   app's untrusted-input boundary: it structurally validates a parsed file in the
   current full-name schema OR the version-1 abbreviated schema, then migrates
   everything to the current schema and stamps the file version — so nothing past
   this boundary ever sees a malformed, abbreviated, or legacy shape.

   The ONLY place in the app permitted to reference the historical abbreviated
   JSON keys (`gw`/`gh`/`cell`, `x`/`y`/`w`/`h`, `dir`/`seq`/`ref`, `x1`..`y2`,
   `ax`..`by`) is this module: they document an on-disk legacy format the app no
   longer owns. Everywhere else the naming rule is absolute.
   ============================================================ */
import type { Dungeon, SecretPath, Room, Marker, CorridorNote } from '../model/types';

export const DUNGEON_SCHEMA_VERSION = 2;

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

/** Pretty-printed JSON in the current full-name schema, stamped `version: 2`.
    The in-memory dungeon is already the current shape (both generation and load
    normalize to it), so serialization is verbatim apart from the version stamp. */
export function serializeDungeon(dungeon: Dungeon): string {
  return JSON.stringify({ ...dungeon, version: DUNGEON_SCHEMA_VERSION }, null, 2);
}

/** `<name-slug>-<SEED-hex>.dungeon`, matching the original filename scheme. */
export function dungeonFilename(dungeon: Dungeon): string {
  const slug = (dungeon.name || 'dungeon').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug + '-' + (dungeon.seed >>> 0).toString(16).toUpperCase() + '.dungeon';
}

/* ---------- shared structural helpers ---------- */

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
function isCellInBounds(gridX: unknown, gridY: unknown, columns: number, rows: number): boolean {
  return isInteger(gridX) && isInteger(gridY) && gridX >= 0 && gridX < columns && gridY >= 0 && gridY < rows;
}

/** A rows×columns matrix of numbers (the floor / secretFloor occupancy grids). */
function isNumberMatrix(value: unknown, rows: number, columns: number): boolean {
  if (!Array.isArray(value) || value.length !== rows) return false;
  return value.every((row) => Array.isArray(row) && row.length === columns && row.every((cell) => isFiniteNumber(cell)));
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

/* ---------- current (full-name) schema validation ---------- */

/** A room/secret-room rectangle in the current schema: integer origin and
    dimensions inside the grid rectangle. Optional `centerX`/`centerY`, when
    present, must be integer cells in bounds. */
function isValidRoom(value: unknown, columns: number, rows: number): boolean {
  if (!isRecord(value)) return false;
  if (!isInteger(value.gridX) || !isInteger(value.gridY) || !isInteger(value.width) || !isInteger(value.height)) return false;
  if (value.gridX < 0 || value.gridY < 0 || value.width < 0 || value.height < 0) return false;
  if (value.gridX + value.width > columns || value.gridY + value.height > rows) return false;
  if (value.centerX != null && !isCellInBounds(value.centerX, value.gridY, columns, rows)) return false;
  if (value.centerY != null && !isCellInBounds(value.gridX, value.centerY, columns, rows)) return false;
  return true;
}

function isValidMarker(value: unknown, columns: number, rows: number): boolean {
  return isRecord(value) && typeof value.type === 'string' && isCellInBounds(value.gridX, value.gridY, columns, rows);
}

function isValidCorridorNote(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.gridX) && isFiniteNumber(value.gridY);
}

/** Current secret-path endpoints are integer cells inside the grid rectangle. */
function isValidSecretPath(value: unknown, columns: number, rows: number): boolean {
  return isRecord(value) && isCellInBounds(value.startX, value.startY, columns, rows) && isCellInBounds(value.endX, value.endY, columns, rows);
}

function hasValidGrid(candidate: Record<string, unknown>): candidate is Record<string, unknown> & { grid: { width: number; height: number; cellSize: number } } {
  const grid = candidate.grid;
  return isRecord(grid) && isFiniteNumber(grid.width) && isFiniteNumber(grid.height) && isFiniteNumber(grid.cellSize);
}

function hasValidOptionalFields(candidate: Record<string, unknown>, rows: number, columns: number): boolean {
  if (candidate.secretFloor != null && !isNumberMatrix(candidate.secretFloor, rows, columns)) return false;
  if (candidate.secretRooms != null && !isArrayOf(candidate.secretRooms, (room) => isValidRoom(room, columns, rows))) return false;
  if (candidate.secretPaths != null && !isArrayOf(candidate.secretPaths, (path) => isValidSecretPath(path, columns, rows))) return false;
  if (candidate.corridorNotes != null && !isArrayOf(candidate.corridorNotes, isValidCorridorNote)) return false;
  return true;
}

/**
 * Structural validation of untrusted input in the current full-name schema —
 * also exactly what `auto-stuff-generator@0.5.0`'s `generateDungeon` emits, so
 * fresh generations and current-schema files share this check. Verifies
 * everything editing and rendering rely on.
 */
export function isValidDungeon(value: unknown): value is Dungeon {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.seed)) return false;
  if (typeof value.name !== 'string' || typeof value.depth !== 'string') return false;
  if (!isValidTally(value.tally)) return false;
  if (!hasValidGrid(value)) return false;
  const columns = value.grid.width;
  const rows = value.grid.height;
  if (!isNumberMatrix(value.floor, rows, columns)) return false;
  if (!isArrayOf(value.rooms, (room) => isValidRoom(room, columns, rows))) return false;
  if (!isArrayOf(value.markers, (marker) => isValidMarker(marker, columns, rows))) return false;
  return hasValidOptionalFields(value, rows, columns);
}

/* ---------- version-1 (abbreviated) legacy schema ---------- */

/** Legacy abbreviated grid. Migration-only; do not reference these keys elsewhere. */
interface LegacyGridV1 { gw: number; gh: number; cell: number }

/** Legacy L-schema secret passage, accepted only at the load boundary and
    migrated to straight SecretPath segments. */
interface LegacySecretPath { ax: number; ay: number; bx: number; by: number; horizFirst?: boolean }

/** Legacy straight secret passage (abbreviated keys). */
interface LegacySecretPathV1 { x1: number; y1: number; x2: number; y2: number }

function hasLegacyGrid(candidate: Record<string, unknown>): candidate is Record<string, unknown> & { grid: LegacyGridV1 } {
  const grid = candidate.grid;
  return isRecord(grid) && isFiniteNumber(grid.gw) && isFiniteNumber(grid.gh) && isFiniteNumber(grid.cell);
}

/** A file uses the version-1 abbreviated schema when its grid carries the old `gw` key. */
function isLegacyV1(candidate: Record<string, unknown>): boolean {
  return isRecord(candidate.grid) && 'gw' in candidate.grid;
}

function isValidLegacyRoom(value: unknown, columns: number, rows: number): boolean {
  if (!isRecord(value)) return false;
  if (!isInteger(value.x) || !isInteger(value.y) || !isInteger(value.w) || !isInteger(value.h)) return false;
  if (value.x < 0 || value.y < 0 || value.w < 0 || value.h < 0) return false;
  if (value.x + value.w > columns || value.y + value.h > rows) return false;
  if (value.cx != null && !isCellInBounds(value.cx, value.y, columns, rows)) return false;
  if (value.cy != null && !isCellInBounds(value.x, value.cy, columns, rows)) return false;
  return true;
}

function isValidLegacyMarker(value: unknown, columns: number, rows: number): boolean {
  return isRecord(value) && typeof value.type === 'string' && isCellInBounds(value.x, value.y, columns, rows);
}

function isValidLegacyCorridorNote(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

/** Modern (straight) legacy secret-path endpoints are integer cells in bounds. */
function isLegacyModernSecretPath(value: unknown, columns: number, rows: number): value is LegacySecretPathV1 {
  return isRecord(value) && isCellInBounds(value.x1, value.y1, columns, rows) && isCellInBounds(value.x2, value.y2, columns, rows);
}

/** Type guard for migration only — no bounds (L-paths are normalized at load). */
function looksLikeLegacyModernSecretPath(value: unknown): value is LegacySecretPathV1 {
  return isRecord(value) && isFiniteNumber(value.x1) && isFiniteNumber(value.y1) && isFiniteNumber(value.x2) && isFiniteNumber(value.y2);
}

function isLegacySecretPath(value: unknown): value is LegacySecretPath {
  return isRecord(value) && isFiniteNumber(value.ax) && isFiniteNumber(value.ay) && isFiniteNumber(value.bx) && isFiniteNumber(value.by);
}

function isValidLegacySecretPath(value: unknown, columns: number, rows: number): boolean {
  return isLegacyModernSecretPath(value, columns, rows) || isLegacySecretPath(value);
}

function hasValidLegacyOptionalFields(candidate: Record<string, unknown>, rows: number, columns: number): boolean {
  if (candidate.secretFloor != null && !isNumberMatrix(candidate.secretFloor, rows, columns)) return false;
  if (candidate.secretRooms != null && !isArrayOf(candidate.secretRooms, (room) => isValidLegacyRoom(room, columns, rows))) return false;
  if (candidate.secretPaths != null && !isArrayOf(candidate.secretPaths, (path) => isValidLegacySecretPath(path, columns, rows))) return false;
  if (candidate.corridorNotes != null && !isArrayOf(candidate.corridorNotes, isValidLegacyCorridorNote)) return false;
  return true;
}

/** Structural validation of a version-1 abbreviated file (the pre-rename rules,
    unchanged, under the old keys) before it is migrated to the current schema. */
function isValidLegacyDungeon(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.seed)) return false;
  if (typeof value.name !== 'string' || typeof value.depth !== 'string') return false;
  if (!isValidTally(value.tally)) return false;
  if (!hasLegacyGrid(value)) return false;
  const columns = value.grid.gw;
  const rows = value.grid.gh;
  if (!isNumberMatrix(value.floor, rows, columns)) return false;
  if (!isArrayOf(value.rooms, (room) => isValidLegacyRoom(room, columns, rows))) return false;
  if (!isArrayOf(value.markers, (marker) => isValidLegacyMarker(marker, columns, rows))) return false;
  return hasValidLegacyOptionalFields(value, rows, columns);
}

/* ---------- version-1 → current migration ---------- */

/** Copy the optional annotation fields of a legacy feature onto its migrated
    form under the current names, omitting fields the source lacks. */
function migrateAnnotation(source: Record<string, unknown>, target: Record<string, unknown>): void {
  if (source.ref !== undefined) target.referenceLabel = source.ref;
  if (source.note !== undefined) target.note = source.note;
  if (source.label !== undefined) target.label = source.label;
  if (source.seq !== undefined) target.sequence = source.seq;
}

function migrateLegacyRoom(source: Record<string, unknown>): Room {
  const room: Record<string, unknown> = { gridX: source.x, gridY: source.y, width: source.w, height: source.h };
  if (source.cx !== undefined) room.centerX = source.cx;
  if (source.cy !== undefined) room.centerY = source.cy;
  if (source.id !== undefined) room.id = source.id;
  migrateAnnotation(source, room);
  return room as unknown as Room;
}

function migrateLegacyMarker(source: Record<string, unknown>): Marker {
  const marker: Record<string, unknown> = { type: source.type, gridX: source.x, gridY: source.y };
  if (source.dir !== undefined) marker.direction = source.dir;
  if (source.placed !== undefined) marker.placed = source.placed;
  migrateAnnotation(source, marker);
  return marker as unknown as Marker;
}

function migrateLegacyCorridorNote(source: Record<string, unknown>): CorridorNote {
  const note: Record<string, unknown> = { gridX: source.x, gridY: source.y };
  migrateAnnotation(source, note);
  return note as unknown as CorridorNote;
}

/** One straight segment per leg of a legacy L-path (degenerate legs dropped). */
function legacyPathToSegments(path: LegacySecretPath): SecretPath[] {
  const corner = path.horizFirst
    ? { x: path.bx, y: path.ay }  // horizontal leg first: corner shares the start row
    : { x: path.ax, y: path.by }; // vertical leg first: corner shares the start column
  const legs: SecretPath[] = [
    { startX: path.ax, startY: path.ay, endX: corner.x, endY: corner.y },
    { startX: corner.x, startY: corner.y, endX: path.bx, endY: path.by },
  ];
  return legs.filter((leg) => leg.startX !== leg.endX || leg.startY !== leg.endY);
}

function migrateLegacySecretPaths(rawPaths: unknown[]): SecretPath[] {
  return rawPaths.flatMap((path) =>
    looksLikeLegacyModernSecretPath(path)
      ? [{ startX: path.x1, startY: path.y1, endX: path.x2, endY: path.y2 }]
      : legacyPathToSegments(path as LegacySecretPath));
}

/** Map a validated version-1 abbreviated dungeon to the current full-name schema. */
function migrateLegacyDungeon(raw: Record<string, unknown>): Dungeon {
  const grid = raw.grid as LegacyGridV1;
  const migrated: Record<string, unknown> = {
    ...raw,
    version: DUNGEON_SCHEMA_VERSION,
    grid: { width: grid.gw, height: grid.gh, cellSize: grid.cell },
    rooms: (raw.rooms as Record<string, unknown>[]).map(migrateLegacyRoom),
    markers: (raw.markers as Record<string, unknown>[]).map(migrateLegacyMarker),
  };
  if (raw.secretRooms != null) migrated.secretRooms = (raw.secretRooms as Record<string, unknown>[]).map(migrateLegacyRoom);
  if (raw.secretPaths != null) migrated.secretPaths = migrateLegacySecretPaths(raw.secretPaths as unknown[]);
  if (raw.corridorNotes != null) migrated.corridorNotes = (raw.corridorNotes as Record<string, unknown>[]).map(migrateLegacyCorridorNote);
  return migrated as unknown as Dungeon;
}

/**
 * Normalize a validated dungeon to the current schema and stamp the version.
 * A version-1 abbreviated dungeon is field-mapped to full names; a current-
 * schema dungeon (a v2 file or a fresh 0.5.0 generation) is adopted as-is with
 * the version stamped. Consumers past this boundary assume the current schema.
 */
export function migrateDungeon(raw: unknown): Dungeon {
  if (isRecord(raw) && isLegacyV1(raw)) return migrateLegacyDungeon(raw);
  const dungeon = raw as Dungeon;
  dungeon.version = DUNGEON_SCHEMA_VERSION;
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
  if (!isRecord(parsed)) throw new InvalidDungeonFileError();
  if (isLegacyV1(parsed)) {
    if (!isValidLegacyDungeon(parsed)) throw new InvalidDungeonFileError();
    return migrateLegacyDungeon(parsed);
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
