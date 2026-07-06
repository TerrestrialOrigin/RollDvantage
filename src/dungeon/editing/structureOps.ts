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
  for (let row = minY; row <= maxY; row++) { const floorRow = dungeon.floor[row]; if (!floorRow) continue; for (let column = minX; column <= maxX; column++) floorRow[column] = 1; }
  const roomWidth = maxX - minX + 1, roomHeight = maxY - minY + 1;
  let maxId = 0;
  (dungeon.rooms || []).forEach((room) => { if ((room.id ?? 0) > maxId) maxId = room.id ?? 0; });
  dungeon.rooms.push({ gridX: minX, gridY: minY, width: roomWidth, height: roomHeight, centerX: Math.floor(minX + roomWidth / 2), centerY: Math.floor(minY + roomHeight / 2), id: maxId + 1 });
}

export function commitCorridor(dungeon: Dungeon, startX: number, startY: number, endX: number, endY: number): void {
  corridorCells(startX, startY, endX, endY).forEach((cell) => { const row = dungeon.floor[cell[1]]; if (row) row[cell[0]] = 1; });
}

export function commitDelete(dungeon: Dungeon, startX: number, startY: number, endX: number, endY: number): void {
  const minX = Math.min(startX, endX), minY = Math.min(startY, endY), maxX = Math.max(startX, endX), maxY = Math.max(startY, endY);
  const gridWidth = dungeon.grid.width;
  const deleted: Record<number, boolean> = {};
  for (let row = minY; row <= maxY; row++) {
    const floorRow = dungeon.floor[row], secretRow = dungeon.secretFloor?.[row];
    for (let column = minX; column <= maxX; column++) {
      if (floorRow) floorRow[column] = 0;
      if (secretRow) secretRow[column] = 0;
      deleted[row * gridWidth + column] = true;
    }
  }
  dungeon.markers = (dungeon.markers || []).filter((marker) => !deleted[marker.gridY * gridWidth + marker.gridX]);
  if (dungeon.corridorNotes) dungeon.corridorNotes = dungeon.corridorNotes.filter((note) => !deleted[note.gridY * gridWidth + note.gridX]);
  dungeon.rooms = (dungeon.rooms || []).filter((room) => gridHasRoomCell(room, dungeon.floor));
  if (dungeon.secretFloor) dungeon.secretRooms = (dungeon.secretRooms ?? []).filter((room) => gridHasRoomCell(room, dungeon.secretFloor!));
  if (dungeon.secretPaths) dungeon.secretPaths = dungeon.secretPaths.filter((path) => cellAlive(dungeon, path.startX, path.startY) && cellAlive(dungeon, path.endX, path.endY));
}
