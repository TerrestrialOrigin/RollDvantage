/* ============================================================
   Structure editing — pure mutations that add/remove floor, rooms, corridors.

   Each takes the Dungeon explicitly and mutates it in place (matching the
   original semantics), but does NOT trigger any re-render: the caller (the
   DungeonEditor facade) owns the refresh/history chokepoint. Logic preserved
   verbatim from the original commit* helpers (minus their refresh() calls).
   ============================================================ */
import type { Dungeon } from '../model/types';
import { corridorCells } from '../geometry/grid';
import { gridHasRoomCell, cellAlive } from '../geometry/topology';

export function commitRoom(dungeon: Dungeon, x0: number, y0: number, x1: number, y1: number): void {
  const ax = Math.min(x0, x1), ay = Math.min(y0, y1), bx = Math.max(x0, x1), by = Math.max(y0, y1);
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) { if (dungeon.floor[y]) dungeon.floor[y][x] = 1; }
  const w = bx - ax + 1, h = by - ay + 1;
  let maxId = 0;
  (dungeon.rooms || []).forEach((room) => { if ((room.id ?? 0) > maxId) maxId = room.id ?? 0; });
  dungeon.rooms.push({ x: ax, y: ay, w, h, cx: Math.floor(ax + w / 2), cy: Math.floor(ay + h / 2), id: maxId + 1 });
}

export function commitCorridor(dungeon: Dungeon, ax: number, ay: number, bx: number, by: number): void {
  corridorCells(ax, ay, bx, by).forEach((cell) => { if (dungeon.floor[cell[1]]) dungeon.floor[cell[1]][cell[0]] = 1; });
}

export function commitDelete(dungeon: Dungeon, x0: number, y0: number, x1: number, y1: number): void {
  const ax = Math.min(x0, x1), ay = Math.min(y0, y1), bx = Math.max(x0, x1), by = Math.max(y0, y1);
  const gridWidth = dungeon.grid.gw;
  const deleted: Record<number, boolean> = {};
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    if (dungeon.floor[y]) dungeon.floor[y][x] = 0;
    if (dungeon.secretFloor?.[y]) dungeon.secretFloor[y][x] = 0;
    deleted[y * gridWidth + x] = true;
  }
  dungeon.markers = (dungeon.markers || []).filter((marker) => !deleted[marker.y * gridWidth + marker.x]);
  if (dungeon.corridorNotes) dungeon.corridorNotes = dungeon.corridorNotes.filter((note) => !deleted[note.y * gridWidth + note.x]);
  dungeon.rooms = (dungeon.rooms || []).filter((room) => gridHasRoomCell(room, dungeon.floor));
  if (dungeon.secretFloor) dungeon.secretRooms = (dungeon.secretRooms ?? []).filter((room) => gridHasRoomCell(room, dungeon.secretFloor!));
  if (dungeon.secretPaths) dungeon.secretPaths = dungeon.secretPaths.filter((path) => { if (path.x1 == null) return true; return cellAlive(dungeon, path.x1, path.y1!) && cellAlive(dungeon, path.x2!, path.y2!); });
}
