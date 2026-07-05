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

export function commitRoom(dungeon: Dungeon, startX: number, startY: number, endX: number, endY: number): void {
  const minX = Math.min(startX, endX), minY = Math.min(startY, endY), maxX = Math.max(startX, endX), maxY = Math.max(startY, endY);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) { if (dungeon.floor[y]) dungeon.floor[y][x] = 1; }
  const roomWidth = maxX - minX + 1, roomHeight = maxY - minY + 1;
  let maxId = 0;
  (dungeon.rooms || []).forEach((room) => { if ((room.id ?? 0) > maxId) maxId = room.id ?? 0; });
  dungeon.rooms.push({ x: minX, y: minY, w: roomWidth, h: roomHeight, cx: Math.floor(minX + roomWidth / 2), cy: Math.floor(minY + roomHeight / 2), id: maxId + 1 });
}

export function commitCorridor(dungeon: Dungeon, startX: number, startY: number, endX: number, endY: number): void {
  corridorCells(startX, startY, endX, endY).forEach((cell) => { if (dungeon.floor[cell[1]]) dungeon.floor[cell[1]][cell[0]] = 1; });
}

export function commitDelete(dungeon: Dungeon, startX: number, startY: number, endX: number, endY: number): void {
  const minX = Math.min(startX, endX), minY = Math.min(startY, endY), maxX = Math.max(startX, endX), maxY = Math.max(startY, endY);
  const gridWidth = dungeon.grid.width;
  const deleted: Record<number, boolean> = {};
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (dungeon.floor[y]) dungeon.floor[y][x] = 0;
    if (dungeon.secretFloor?.[y]) dungeon.secretFloor[y][x] = 0;
    deleted[y * gridWidth + x] = true;
  }
  dungeon.markers = (dungeon.markers || []).filter((marker) => !deleted[marker.y * gridWidth + marker.x]);
  if (dungeon.corridorNotes) dungeon.corridorNotes = dungeon.corridorNotes.filter((note) => !deleted[note.y * gridWidth + note.x]);
  dungeon.rooms = (dungeon.rooms || []).filter((room) => gridHasRoomCell(room, dungeon.floor));
  if (dungeon.secretFloor) dungeon.secretRooms = (dungeon.secretRooms ?? []).filter((room) => gridHasRoomCell(room, dungeon.secretFloor!));
  if (dungeon.secretPaths) dungeon.secretPaths = dungeon.secretPaths.filter((path) => cellAlive(dungeon, path.x1, path.y1) && cellAlive(dungeon, path.x2, path.y2));
}
