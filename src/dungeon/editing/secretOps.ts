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
    for (let y = 0; y < dungeon.grid.height; y++) grid.push(new Array<number>(dungeon.grid.width).fill(0));
    dungeon.secretFloor = grid;
  }
}

/** Turn the room or corridor run at (x,y) into a secret room / passage. */
export function convertSecretAt(dungeon: Dungeon, x: number, y: number): void {
  if (dungeon.secretFloor?.[y]?.[x] === 1) return; // already secret
  const roomIndex = roomIndexAt(dungeon, x, y);
  if (roomIndex < 0 && !isCorridorCell(dungeon, x, y)) return; // only rooms or corridors convert
  ensureSecretFloor(dungeon);
  const secretFloor = dungeon.secretFloor!;
  if (roomIndex >= 0) {
    const room = dungeon.rooms[roomIndex];
    for (let yy = room.y; yy < room.y + room.h; yy++) for (let xx = room.x; xx < room.x + room.w; xx++) {
      if (dungeon.floor[yy]?.[xx] === 1) { dungeon.floor[yy][xx] = 0; secretFloor[yy][xx] = 1; }
    }
    dungeon.rooms.splice(roomIndex, 1);
    dungeon.secretRooms = dungeon.secretRooms ?? [];
    dungeon.secretRooms.push(room); // keeps any note/letter; dashed outline marks it secret
  } else {
    const run = straightRun(dungeon, x, y);
    // Infinity sentinels: the run always contains at least (x,y), so every bound is overwritten.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    run.cells.forEach((cell) => {
      dungeon.floor[cell[1]][cell[0]] = 0; secretFloor[cell[1]][cell[0]] = 1;
      if (cell[0] < minX) minX = cell[0]; if (cell[0] > maxX) maxX = cell[0]; if (cell[1] < minY) minY = cell[1]; if (cell[1] > maxY) maxY = cell[1];
    });
    dungeon.secretPaths = dungeon.secretPaths ?? [];
    if (run.horiz) dungeon.secretPaths.push({ x1: minX, y1: y, x2: maxX, y2: y }); // dashed centerline
    else dungeon.secretPaths.push({ x1: x, y1: minY, x2: x, y2: maxY });
    const mid = run.cells[Math.floor(run.cells.length / 2)];
    dungeon.markers.push({ type: 'secret', x: mid[0], y: mid[1], placed: true }); // 'S' badge
  }
}

/** Reverse of convertSecretAt: bring a secret room / passage back to a visible one. */
export function unconvertSecret(dungeon: Dungeon, x: number, y: number): void {
  if (!dungeon.secretFloor) return;
  const secretFloor = dungeon.secretFloor;
  const secretIndex = secretRoomIndexAt(dungeon, x, y), gridWidth = dungeon.grid.width;
  if (secretIndex >= 0) {
    const secretRooms = dungeon.secretRooms ?? [];
    const room = secretRooms[secretIndex];
    if (!room) return;
    for (let yy = room.y; yy < room.y + room.h; yy++) for (let xx = room.x; xx < room.x + room.w; xx++) {
      if (secretFloor[yy][xx] === 1) { secretFloor[yy][xx] = 0; dungeon.floor[yy][xx] = 1; }
    }
    secretRooms.splice(secretIndex, 1);
    dungeon.rooms.push(room);
    const inRoom = (mx: number, my: number) => mx >= room.x && mx < room.x + room.w && my >= room.y && my < room.y + room.h;
    dungeon.markers = dungeon.markers.filter((marker) => !(marker.type === 'secret' && inRoom(marker.x, marker.y)));
    dungeon.secretPaths = (dungeon.secretPaths ?? []).filter((path) => !(inRoom(path.x1, path.y1) || inRoom(path.x2, path.y2)));
    return;
  }
  const run = straightRunWhere(x, y, (cx, cy) => isSecretCorridorCell(dungeon, cx, cy)).cells;
  const cleared: Record<number, number> = {};
  run.forEach((cell) => { secretFloor[cell[1]][cell[0]] = 0; dungeon.floor[cell[1]][cell[0]] = 1; cleared[cell[1] * gridWidth + cell[0]] = 1; });
  dungeon.markers = dungeon.markers.filter((marker) => !(marker.type === 'secret' && cleared[marker.y * gridWidth + marker.x]));
  dungeon.secretPaths = (dungeon.secretPaths ?? []).filter((path) =>
    (secretFloor[path.y1]?.[path.x1] === 1) || (secretFloor[path.y2]?.[path.x2] === 1));
}
