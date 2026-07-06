/* ============================================================
   Grid topology — pure predicates and run-tracing over a Dungeon's floors.

   All functions take the Dungeon (or a FloorGrid) explicitly; no shared state,
   no DOM. Logic preserved verbatim from the original closure helpers.
   ============================================================ */
import type { Dungeon, FloorGrid, Room } from '../model/types';

export type CellPredicate = (gridX: number, gridY: number) => boolean;

export interface StraightRun {
  cells: [number, number][];
  horiz: boolean;
}

export function isBaseFloor(dungeon: Dungeon, gridX: number, gridY: number): boolean {
  return !!(dungeon.floor[gridY]?.[gridX] === 1);
}

export function roomIndexAt(dungeon: Dungeon, gridX: number, gridY: number): number {
  const rooms = dungeon.rooms || [];
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    if (!room) continue;
    if (gridX >= room.gridX && gridX < room.gridX + room.width && gridY >= room.gridY && gridY < room.gridY + room.height) return i;
  }
  return -1;
}

export function isCorridorCell(dungeon: Dungeon, gridX: number, gridY: number): boolean {
  return !!(dungeon.floor[gridY]?.[gridX] === 1) && roomIndexAt(dungeon, gridX, gridY) < 0;
}

export function secretRoomIndexAt(dungeon: Dungeon, gridX: number, gridY: number): number {
  const secretRooms = dungeon.secretRooms ?? [];
  for (let i = 0; i < secretRooms.length; i++) {
    const room = secretRooms[i];
    if (!room) continue;
    if (gridX >= room.gridX && gridX < room.gridX + room.width && gridY >= room.gridY && gridY < room.gridY + room.height) return i;
  }
  return -1;
}

export function isSecretCorridorCell(dungeon: Dungeon, gridX: number, gridY: number): boolean {
  return !!(dungeon.secretFloor?.[gridY]?.[gridX] === 1) && secretRoomIndexAt(dungeon, gridX, gridY) < 0;
}

export function cellAlive(dungeon: Dungeon, gridX: number, gridY: number): boolean {
  return (!!dungeon.floor[gridY] && dungeon.floor[gridY][gridX] === 1) || (!!dungeon.secretFloor && !!dungeon.secretFloor[gridY] && dungeon.secretFloor[gridY][gridX] === 1);
}

export function gridHasRoomCell(room: Room, grid: FloorGrid): boolean {
  for (let row = room.gridY; row < room.gridY + room.height; row++) for (let column = room.gridX; column < room.gridX + room.width; column++) {
    if (grid[row]?.[column] === 1) return true;
  }
  return false;
}

export function placeable(dungeon: Dungeon, gridX: number, gridY: number): boolean {
  if (dungeon.floor[gridY]?.[gridX] === 1) return true;
  if (dungeon.secretFloor?.[gridY]?.[gridX] === 1) return true;
  return false;
}

/** The straight run through (originX,originY) for a given cell test: stops at a turn, junction, room, or dead end. */
export function straightRunWhere(originX: number, originY: number, isCell: CellPredicate): StraightRun {
  const at: CellPredicate = (gridX, gridY) => isCell(gridX, gridY);
  const left = at(originX - 1, originY), right = at(originX + 1, originY), up = at(originX, originY - 1), down = at(originX, originY + 1);
  let horiz: boolean;
  if ((left || right) && !(up || down)) horiz = true;
  else if ((up || down) && !(left || right)) horiz = false;
  else if (left && right) horiz = true;
  else if (up && down) horiz = false;
  else return { cells: [[originX, originY]], horiz: true };
  const cells: [number, number][] = [[originX, originY]];
  let column: number, row: number;
  if (horiz) {
    for (column = originX + 1; at(column, originY) && !(at(column, originY - 1) || at(column, originY + 1)); column++) cells.push([column, originY]);
    for (column = originX - 1; at(column, originY) && !(at(column, originY - 1) || at(column, originY + 1)); column--) cells.push([column, originY]);
  } else {
    for (row = originY + 1; at(originX, row) && !(at(originX - 1, row) || at(originX + 1, row)); row++) cells.push([originX, row]);
    for (row = originY - 1; at(originX, row) && !(at(originX - 1, row) || at(originX + 1, row)); row--) cells.push([originX, row]);
  }
  return { cells, horiz };
}

/** Straight run over base-floor corridor cells. */
export function straightRun(dungeon: Dungeon, originX: number, originY: number): StraightRun {
  return straightRunWhere(originX, originY, (gridX, gridY) => isCorridorCell(dungeon, gridX, gridY));
}
