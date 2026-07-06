/* ============================================================
   Secret conversion — pure, reversible mutations turning rooms/corridors into
   secret rooms/passages and back. Takes the Dungeon explicitly, no re-render.
   Logic preserved verbatim from the original (minus refresh() calls).
   ============================================================ */
import type { Dungeon } from '../model/types';
import { roomIndexAt, isCorridorCell, secretRoomIndexAt, isSecretCorridorCell, straightRun, straightRunWhere } from '../geometry/topology';

export function ensureSecretFloor(dungeon: Dungeon): void {
  if (!dungeon.secretFloor) {
    const grid: number[][] = [];
    for (let row = 0; row < dungeon.grid.height; row++) grid.push(new Array<number>(dungeon.grid.width).fill(0));
    dungeon.secretFloor = grid;
  }
}

/** Turn the room or corridor run at (gridX,gridY) into a secret room / passage. */
export function convertSecretAt(dungeon: Dungeon, gridX: number, gridY: number): void {
  if (dungeon.secretFloor?.[gridY]?.[gridX] === 1) return; // already secret
  const roomIndex = roomIndexAt(dungeon, gridX, gridY);
  if (roomIndex < 0 && !isCorridorCell(dungeon, gridX, gridY)) return; // only rooms or corridors convert
  ensureSecretFloor(dungeon);
  const secretFloor = dungeon.secretFloor!;
  if (roomIndex >= 0) {
    const room = dungeon.rooms[roomIndex];
    if (!room) return; // roomIndex >= 0 was returned by roomIndexAt
    for (let row = room.gridY; row < room.gridY + room.height; row++) {
      const floorRow = dungeon.floor[row], secretRow = secretFloor[row];
      if (!floorRow || !secretRow) continue;
      for (let column = room.gridX; column < room.gridX + room.width; column++) {
        if (floorRow[column] === 1) { floorRow[column] = 0; secretRow[column] = 1; }
      }
    }
    dungeon.rooms.splice(roomIndex, 1);
    dungeon.secretRooms = dungeon.secretRooms ?? [];
    dungeon.secretRooms.push(room); // keeps any note/letter; dashed outline marks it secret
  } else {
    const run = straightRun(dungeon, gridX, gridY);
    // Infinity sentinels: the run always contains at least (gridX,gridY), so every bound is overwritten.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    run.cells.forEach((cell) => {
      const floorRow = dungeon.floor[cell[1]], secretRow = secretFloor[cell[1]];
      if (floorRow) floorRow[cell[0]] = 0;
      if (secretRow) secretRow[cell[0]] = 1;
      if (cell[0] < minX) minX = cell[0]; if (cell[0] > maxX) maxX = cell[0]; if (cell[1] < minY) minY = cell[1]; if (cell[1] > maxY) maxY = cell[1];
    });
    dungeon.secretPaths = dungeon.secretPaths ?? [];
    if (run.horiz) dungeon.secretPaths.push({ startX: minX, startY: gridY, endX: maxX, endY: gridY }); // dashed centerline
    else dungeon.secretPaths.push({ startX: gridX, startY: minY, endX: gridX, endY: maxY });
    const mid = run.cells[Math.floor(run.cells.length / 2)];
    if (mid) dungeon.markers.push({ type: 'secret', gridX: mid[0], gridY: mid[1], placed: true }); // 'S' badge; run always contains (gridX,gridY)
  }
}

/** Reverse of convertSecretAt: bring a secret room / passage back to a visible one. */
export function unconvertSecret(dungeon: Dungeon, gridX: number, gridY: number): void {
  if (!dungeon.secretFloor) return;
  const secretFloor = dungeon.secretFloor;
  const secretIndex = secretRoomIndexAt(dungeon, gridX, gridY), gridWidth = dungeon.grid.width;
  if (secretIndex >= 0) {
    const secretRooms = dungeon.secretRooms ?? [];
    const room = secretRooms[secretIndex];
    if (!room) return;
    for (let row = room.gridY; row < room.gridY + room.height; row++) {
      const secretRow = secretFloor[row], floorRow = dungeon.floor[row];
      if (!secretRow || !floorRow) continue;
      for (let column = room.gridX; column < room.gridX + room.width; column++) {
        if (secretRow[column] === 1) { secretRow[column] = 0; floorRow[column] = 1; }
      }
    }
    secretRooms.splice(secretIndex, 1);
    dungeon.rooms.push(room);
    const inRoom = (markerX: number, markerY: number) => markerX >= room.gridX && markerX < room.gridX + room.width && markerY >= room.gridY && markerY < room.gridY + room.height;
    dungeon.markers = dungeon.markers.filter((marker) => !(marker.type === 'secret' && inRoom(marker.gridX, marker.gridY)));
    dungeon.secretPaths = (dungeon.secretPaths ?? []).filter((path) => !(inRoom(path.startX, path.startY) || inRoom(path.endX, path.endY)));
    return;
  }
  const run = straightRunWhere(gridX, gridY, (cellX, cellY) => isSecretCorridorCell(dungeon, cellX, cellY)).cells;
  const cleared: Record<number, number> = {};
  run.forEach((cell) => {
    const secretRow = secretFloor[cell[1]], floorRow = dungeon.floor[cell[1]];
    if (secretRow) secretRow[cell[0]] = 0;
    if (floorRow) floorRow[cell[0]] = 1;
    cleared[cell[1] * gridWidth + cell[0]] = 1;
  });
  dungeon.markers = dungeon.markers.filter((marker) => !(marker.type === 'secret' && cleared[marker.gridY * gridWidth + marker.gridX]));
  dungeon.secretPaths = (dungeon.secretPaths ?? []).filter((path) =>
    (secretFloor[path.startY]?.[path.startX] === 1) || (secretFloor[path.endY]?.[path.endX] === 1));
}
