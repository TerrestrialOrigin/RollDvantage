/* ============================================================
   Feature hit-tests — pure queries that identify what is at a cell.
   Logic preserved verbatim from the original closure helpers.
   ============================================================ */
import type { Dungeon, Marker, Room } from '../model/types';
import { roomIndexAt, secretRoomIndexAt, isBaseFloor, straightRun, straightRunF, isSecretCorridorCell } from '../geometry/topology';

export type FeatureKind = 'marker' | 'room' | 'secret-room' | 'corridor' | 'secret-corridor';

export interface Feature {
  kind: FeatureKind;
  idx?: number;
  marker?: Marker;
  room?: Room;
}

export interface BBox { ax: number; ay: number; bx: number; by: number; }

/** Marker types that can carry an annotation. */
const ANNOTATABLE: Record<string, boolean> = { monster: true, boss: true, treasure: true, trap: true, secret: true, other: true };

/** Index of the topmost marker exactly at (x,y), or -1. */
export function markerAtCell(dungeon: Dungeon, x: number, y: number): number {
  for (let i = dungeon.markers.length - 1; i >= 0; i--) { const marker = dungeon.markers[i]; if (marker.x === x && marker.y === y) return i; }
  return -1;
}

/** The topmost annotatable (non-entrance/exit) marker at (x,y), or null. */
export function annotatableMarkerAt(dungeon: Dungeon, x: number, y: number): Marker | null {
  for (let i = dungeon.markers.length - 1; i >= 0; i--) { const marker = dungeon.markers[i]; if (marker.x === x && marker.y === y && ANNOTATABLE[marker.type]) return marker; }
  return null;
}

/** The room or secret room containing (x,y), tagged with its annotation kind, or null. */
export function roomAt(dungeon: Dungeon, x: number, y: number): { o: Room; kind: 'room' | 'sroom' } | null {
  const rooms = dungeon.rooms || [];
  for (const room of rooms) { if (x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h) return { o: room, kind: 'room' }; }
  const secretRooms = dungeon.secretRooms ?? [];
  for (const room of secretRooms) { if (x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h) return { o: room, kind: 'sroom' }; }
  return null;
}

/** Classify whatever feature occupies (x,y). */
export function featureAt(dungeon: Dungeon, x: number, y: number): Feature | null {
  const markerIndex = markerAtCell(dungeon, x, y);
  if (markerIndex >= 0 && dungeon.markers[markerIndex].type !== 'secret') return { kind: 'marker', idx: markerIndex, marker: dungeon.markers[markerIndex] };
  const roomIndex = roomIndexAt(dungeon, x, y); if (roomIndex >= 0) return { kind: 'room', room: dungeon.rooms[roomIndex] };
  const secretIndex = secretRoomIndexAt(dungeon, x, y);
  const secretRoom = secretIndex >= 0 ? (dungeon.secretRooms ?? [])[secretIndex] : undefined;
  if (secretRoom) return { kind: 'secret-room', room: secretRoom };
  if (isBaseFloor(dungeon, x, y)) return { kind: 'corridor' };
  if (dungeon.secretFloor?.[y]?.[x] === 1) return { kind: 'secret-corridor' };
  return null;
}

/** The bounding box of a feature (room rect, or the straight run through a corridor cell). */
export function featureBBox(dungeon: Dungeon, feature: Feature, gx: number, gy: number): BBox {
  if (feature.kind === 'room' || feature.kind === 'secret-room') {
    const room = feature.room;
    if (!room) return { ax: gx, ay: gy, bx: gx, by: gy }; // defensive: room features always carry their room
    return { ax: room.x, ay: room.y, bx: room.x + room.w - 1, by: room.y + room.h - 1 };
  }
  const run = (feature.kind === 'corridor') ? straightRun(dungeon, gx, gy).cells : straightRunF(gx, gy, (x, y) => isSecretCorridorCell(dungeon, x, y)).cells;
  let ax = 1e9, ay = 1e9, bx = -1, by = -1;
  run.forEach((cell) => { if (cell[0] < ax) ax = cell[0]; if (cell[0] > bx) bx = cell[0]; if (cell[1] < ay) ay = cell[1]; if (cell[1] > by) by = cell[1]; });
  return { ax, ay, bx, by };
}
