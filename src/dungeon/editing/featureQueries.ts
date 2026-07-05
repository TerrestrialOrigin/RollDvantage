/* ============================================================
   Feature hit-tests — pure queries that identify what is at a cell.
   Logic preserved verbatim from the original closure helpers.
   ============================================================ */
import type { Dungeon, Marker, Room } from '../model/types';
import { roomIndexAt, secretRoomIndexAt, isBaseFloor, straightRun, straightRunWhere, isSecretCorridorCell } from '../geometry/topology';

export type FeatureKind = 'marker' | 'room' | 'secret-room' | 'corridor' | 'secret-corridor';

export interface Feature {
  kind: FeatureKind;
  index?: number;
  marker?: Marker;
  room?: Room;
}

export interface BBox { minX: number; minY: number; maxX: number; maxY: number; }

/** Marker types that can carry an annotation. */
const ANNOTATABLE: Record<string, boolean> = { monster: true, boss: true, treasure: true, trap: true, secret: true, other: true };

/** Index of the topmost marker exactly at (x,y), or -1. */
export function markerAtCell(dungeon: Dungeon, x: number, y: number): number {
  for (let i = dungeon.markers.length - 1; i >= 0; i--) { const marker = dungeon.markers[i]; if (!marker) continue; if (marker.x === x && marker.y === y) return i; }
  return -1;
}

/** The topmost annotatable (non-entrance/exit) marker at (x,y), or null. */
export function annotatableMarkerAt(dungeon: Dungeon, x: number, y: number): Marker | null {
  for (let i = dungeon.markers.length - 1; i >= 0; i--) { const marker = dungeon.markers[i]; if (!marker) continue; if (marker.x === x && marker.y === y && ANNOTATABLE[marker.type]) return marker; }
  return null;
}

/** The room or secret room containing (x,y), tagged with its annotation kind, or null. */
export function roomAt(dungeon: Dungeon, x: number, y: number): { feature: Room; kind: 'room' | 'secretRoom' } | null {
  const rooms = dungeon.rooms || [];
  for (const room of rooms) { if (x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h) return { feature: room, kind: 'room' }; }
  const secretRooms = dungeon.secretRooms ?? [];
  for (const room of secretRooms) { if (x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h) return { feature: room, kind: 'secretRoom' }; }
  return null;
}

/** Classify whatever feature occupies (x,y). */
export function featureAt(dungeon: Dungeon, x: number, y: number): Feature | null {
  const markerIndex = markerAtCell(dungeon, x, y);
  const topMarker = markerIndex >= 0 ? dungeon.markers[markerIndex] : undefined;
  if (topMarker && topMarker.type !== 'secret') return { kind: 'marker', index: markerIndex, marker: topMarker };
  const roomIndex = roomIndexAt(dungeon, x, y);
  const room = roomIndex >= 0 ? dungeon.rooms[roomIndex] : undefined;
  if (room) return { kind: 'room', room };
  const secretIndex = secretRoomIndexAt(dungeon, x, y);
  const secretRoom = secretIndex >= 0 ? (dungeon.secretRooms ?? [])[secretIndex] : undefined;
  if (secretRoom) return { kind: 'secret-room', room: secretRoom };
  if (isBaseFloor(dungeon, x, y)) return { kind: 'corridor' };
  if (dungeon.secretFloor?.[y]?.[x] === 1) return { kind: 'secret-corridor' };
  return null;
}

/** The bounding box of a feature (room rect, or the straight run through a corridor cell). */
export function featureBBox(dungeon: Dungeon, feature: Feature, gridX: number, gridY: number): BBox {
  if (feature.kind === 'room' || feature.kind === 'secret-room') {
    const room = feature.room;
    if (!room) return { minX: gridX, minY: gridY, maxX: gridX, maxY: gridY }; // defensive: room features always carry their room
    return { minX: room.x, minY: room.y, maxX: room.x + room.w - 1, maxY: room.y + room.h - 1 };
  }
  const run = (feature.kind === 'corridor') ? straightRun(dungeon, gridX, gridY).cells : straightRunWhere(gridX, gridY, (x, y) => isSecretCorridorCell(dungeon, x, y)).cells;
  // Infinity sentinels (not 1e9/-1): runs are never empty — straightRunWhere
  // always includes the origin cell — so every bound is overwritten below.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  run.forEach((cell) => { if (cell[0] < minX) minX = cell[0]; if (cell[0] > maxX) maxX = cell[0]; if (cell[1] < minY) minY = cell[1]; if (cell[1] > maxY) maxY = cell[1]; });
  return { minX, minY, maxX, maxY };
}
