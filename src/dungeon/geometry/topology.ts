/* ============================================================
   Grid topology — pure predicates and run-tracing over a Dungeon's floors.

   All functions take the Dungeon (or a FloorGrid) explicitly; no shared state,
   no DOM. Logic preserved verbatim from the original closure helpers.
   ============================================================ */
import type { Dungeon, FloorGrid, Room } from '../model/types';

export type CellPredicate = (x: number, y: number) => boolean;

export interface StraightRun {
  cells: [number, number][];
  horiz: boolean;
}

export function isBaseFloor(dungeon: Dungeon, x: number, y: number): boolean {
  return !!(dungeon.floor[y]?.[x] === 1);
}

export function roomIndexAt(dungeon: Dungeon, x: number, y: number): number {
  const rooms = dungeon.rooms || [];
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    if (x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h) return i;
  }
  return -1;
}

export function isCorridorCell(dungeon: Dungeon, x: number, y: number): boolean {
  return !!(dungeon.floor[y]?.[x] === 1) && roomIndexAt(dungeon, x, y) < 0;
}

export function secretRoomIndexAt(dungeon: Dungeon, x: number, y: number): number {
  const secretRooms = dungeon.secretRooms ?? [];
  for (let i = 0; i < secretRooms.length; i++) {
    const room = secretRooms[i];
    if (x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h) return i;
  }
  return -1;
}

export function isSecretCorridorCell(dungeon: Dungeon, x: number, y: number): boolean {
  return !!(dungeon.secretFloor?.[y]?.[x] === 1) && secretRoomIndexAt(dungeon, x, y) < 0;
}

export function cellAlive(dungeon: Dungeon, x: number, y: number): boolean {
  return (!!dungeon.floor[y] && dungeon.floor[y][x] === 1) || (!!dungeon.secretFloor && !!dungeon.secretFloor[y] && dungeon.secretFloor[y][x] === 1);
}

export function gridHasRoomCell(room: Room, grid: FloorGrid): boolean {
  for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
    if (grid[y]?.[x] === 1) return true;
  }
  return false;
}

export function placeable(dungeon: Dungeon, x: number, y: number): boolean {
  if (dungeon.floor[y]?.[x] === 1) return true;
  if (dungeon.secretFloor?.[y]?.[x] === 1) return true;
  return false;
}

/** The straight run through (dx,dy) for a given cell test: stops at a turn, junction, room, or dead end. */
export function straightRunF(dx: number, dy: number, isCell: CellPredicate): StraightRun {
  const at: CellPredicate = (x, y) => isCell(x, y);
  const left = at(dx - 1, dy), right = at(dx + 1, dy), up = at(dx, dy - 1), down = at(dx, dy + 1);
  let horiz: boolean;
  if ((left || right) && !(up || down)) horiz = true;
  else if ((up || down) && !(left || right)) horiz = false;
  else if (left && right) horiz = true;
  else if (up && down) horiz = false;
  else return { cells: [[dx, dy]], horiz: true };
  const cells: [number, number][] = [[dx, dy]];
  let x: number, y: number;
  if (horiz) {
    for (x = dx + 1; at(x, dy) && !(at(x, dy - 1) || at(x, dy + 1)); x++) cells.push([x, dy]);
    for (x = dx - 1; at(x, dy) && !(at(x, dy - 1) || at(x, dy + 1)); x--) cells.push([x, dy]);
  } else {
    for (y = dy + 1; at(dx, y) && !(at(dx - 1, y) || at(dx + 1, y)); y++) cells.push([dx, y]);
    for (y = dy - 1; at(dx, y) && !(at(dx - 1, y) || at(dx + 1, y)); y--) cells.push([dx, y]);
  }
  return { cells, horiz };
}

/** Straight run over base-floor corridor cells. */
export function straightRun(dungeon: Dungeon, dx: number, dy: number): StraightRun {
  return straightRunF(dx, dy, (x, y) => isCorridorCell(dungeon, x, y));
}
