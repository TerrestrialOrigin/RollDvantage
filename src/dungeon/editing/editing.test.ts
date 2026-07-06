import { describe, it, expect } from 'vitest';
import { generateDungeon } from 'auto-stuff-generator';
import { commitRoom, commitDelete } from './structureOps';
import { migrateDungeon } from '../persistence/dungeonFile';
import { convertSecretAt, unconvertSecret } from './secretOps';
import { applyNote, removeNote } from './noteOps';
import type { Dungeon } from '../model/types';

function freshDungeon(): Dungeon {
  return migrateDungeon(JSON.parse(JSON.stringify(generateDungeon(0xc0ffee, 3, 'detailed'))));
}

describe('structureOps', () => {
  it('commitRoom adds floor and a room record with a new id', () => {
    const dungeon = { grid: { width: 5, height: 5, cellSize: 20 }, floor: Array.from({ length: 5 }, () => new Array<number>(5).fill(0)), rooms: [], markers: [] } as unknown as Dungeon;
    commitRoom(dungeon, 1, 1, 2, 2);
    expect(dungeon.floor[1]?.[1]).toBe(1);
    expect(dungeon.floor[2]?.[2]).toBe(1);
    expect(dungeon.rooms).toHaveLength(1);
    expect(dungeon.rooms[0]).toMatchObject({ gridX: 1, gridY: 1, width: 2, height: 2, id: 1 });
  });

  it('commitRoom assigns max-existing-id + 1 for non-contiguous room ids (M9)', () => {
    const dungeon = {
      grid: { width: 8, height: 8, cellSize: 20 },
      floor: Array.from({ length: 8 }, () => new Array<number>(8).fill(0)),
      rooms: [{ gridX: 1, gridY: 1, width: 1, height: 1, id: 2 }, { gridX: 4, gridY: 4, width: 1, height: 1, id: 7 }],
      markers: [],
    } as unknown as Dungeon;
    commitRoom(dungeon, 6, 6, 6, 6);
    expect(dungeon.rooms).toHaveLength(3);
    expect(dungeon.rooms[2]?.id).toBe(8); // max(2, 7) + 1, not length + 1
  });

  it('commitDelete clears floor and drops orphaned rooms + markers', () => {
    const dungeon = {
      grid: { width: 4, height: 4, cellSize: 20 },
      floor: [[0, 0, 0, 0], [0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
      rooms: [{ gridX: 1, gridY: 1, width: 2, height: 2, id: 1 }],
      markers: [{ type: 'monster', gridX: 1, gridY: 1 }],
      secretPaths: [], corridorNotes: [],
    } as unknown as Dungeon;
    commitDelete(dungeon, 1, 1, 2, 2);
    expect(dungeon.floor[1]?.[1]).toBe(0);
    expect(dungeon.rooms).toHaveLength(0);   // room fully erased
    expect(dungeon.markers).toHaveLength(0); // marker on a deleted cell removed
  });
});

/** A hand-built dungeon with a plain corridor run at row 2, x=1..4 (no rooms touching it). */
function corridorDungeon(): Dungeon {
  const gridWidth = 6, gridHeight = 5;
  const floor = Array.from({ length: gridHeight }, () => new Array<number>(gridWidth).fill(0));
  const corridorRow = floor[2];
  if (corridorRow) corridorRow[1] = corridorRow[2] = corridorRow[3] = corridorRow[4] = 1;
  return {
    seed: 1, name: 'Corridor Test', depth: 'Depth 1',
    grid: { width: gridWidth, height: gridHeight, cellSize: 24 },
    floor, rooms: [], markers: [],
    tally: { rooms: 0, foes: 0, traps: 0, loot: 0, secret: 0 },
  };
}

describe('secretOps — corridor conversion round-trip (M9)', () => {
  it('converts a corridor run to a secret passage and back to the original floor', () => {
    const dungeon = corridorDungeon();
    const originalFloor = JSON.stringify(dungeon.floor);

    convertSecretAt(dungeon, 2, 2);
    // whole run moved to the secret floor, with a modern centerline + S badge
    for (let x = 1; x <= 4; x++) {
      expect(dungeon.floor[2]?.[x]).toBe(0);
      expect(dungeon.secretFloor?.[2]?.[x]).toBe(1);
    }
    expect(dungeon.secretPaths).toEqual([{ startX: 1, startY: 2, endX: 4, endY: 2 }]);
    expect(dungeon.markers.filter((marker) => marker.type === 'secret')).toHaveLength(1);

    unconvertSecret(dungeon, 2, 2);
    expect(JSON.stringify(dungeon.floor)).toBe(originalFloor);
    expect(dungeon.secretFloor!.every((row) => row.every((cell) => cell === 0))).toBe(true);
    expect(dungeon.secretPaths).toHaveLength(0);
    expect(dungeon.markers.filter((marker) => marker.type === 'secret')).toHaveLength(0);
  });
});

describe('commitDelete — secret cleanup (M9)', () => {
  it('deleting a region removes overlapped secret rooms, paths, markers, and secret floor', () => {
    const gridWidth = 6, gridHeight = 6;
    const floor = Array.from({ length: gridHeight }, () => new Array<number>(gridWidth).fill(0));
    const secretFloor = Array.from({ length: gridHeight }, () => new Array<number>(gridWidth).fill(0));
    const secretRowOne = secretFloor[1];
    const secretRowTwo = secretFloor[2];
    if (secretRowOne && secretRowTwo) {
      secretRowOne[1] = secretRowOne[2] = secretRowTwo[1] = secretRowTwo[2] = 1; // secret room
    }
    const secretRowFour = secretFloor[4];
    if (secretRowFour) secretRowFour[1] = secretRowFour[2] = secretRowFour[3] = 1; // secret passage
    const dungeon = {
      seed: 2, name: 'Secret Cleanup', depth: 'Depth 1',
      grid: { width: gridWidth, height: gridHeight, cellSize: 24 },
      floor, secretFloor,
      rooms: [],
      secretRooms: [{ gridX: 1, gridY: 1, width: 2, height: 2, id: 1 }],
      secretPaths: [{ startX: 1, startY: 4, endX: 3, endY: 4 }],
      markers: [{ type: 'secret', gridX: 2, gridY: 4, placed: true }],
      tally: { rooms: 0, foes: 0, traps: 0, loot: 0, secret: 2 },
    } as unknown as Dungeon;

    commitDelete(dungeon, 0, 0, 5, 5); // wipe everything
    expect(dungeon.secretFloor!.every((row) => row.every((cell) => cell === 0))).toBe(true);
    expect(dungeon.secretRooms).toHaveLength(0);
    expect(dungeon.secretPaths).toHaveLength(0);
    expect(dungeon.markers).toHaveLength(0);
  });
});

describe('secretOps — convert/unconvert are inverse', () => {
  it('a room round-trips through make-secret then make-not-secret', () => {
    const dungeon = freshDungeon();
    const before = JSON.stringify(dungeon);
    const room = dungeon.rooms[0];
    expect(room).toBeDefined();
    if (!room) return;
    const originX = room.gridX, originY = room.gridY;
    convertSecretAt(dungeon, originX, originY);
    // it left the visible rooms / moved to secret
    expect(dungeon.secretRooms!.length).toBeGreaterThanOrEqual(1);
    unconvertSecret(dungeon, originX, originY);
    // structure restored
    const original = JSON.parse(before) as Dungeon;
    expect(JSON.stringify(dungeon.floor)).toBe(JSON.stringify(original.floor));
    expect(dungeon.rooms.length).toBe(original.rooms.length);
  });
});

describe('noteOps', () => {
  it('applies a note and assigns a sequence', () => {
    const dungeon = { _sequence: 0, markers: [] } as unknown as Dungeon;
    const target = { } as { note?: string; sequence?: number; label?: string };
    const result = applyNote(dungeon, target, null, 'a trap here', 'Trap Room');
    expect(result).toBe('saved');
    expect(target).toMatchObject({ note: 'a trap here', label: 'Trap Room', sequence: 0 });
    expect(dungeon._sequence).toBe(1);
  });

  it('clearing title and note removes the annotation', () => {
    const dungeon = { _sequence: 1, markers: [] } as unknown as Dungeon;
    const target = { note: 'x', label: 'y', sequence: 0, ref: 'A' } as Record<string, unknown>;
    const result = applyNote(dungeon, target, null, '', '');
    expect(result).toBe('removed');
    expect(target.note).toBeUndefined();
    expect(target.referenceLabel).toBeUndefined();
  });

  it('removeNote detaches a loose note from its list', () => {
    const target = { note: 'x', sequence: 1 } as Record<string, unknown>;
    const list = [target];
    removeNote(target, list);
    expect(list).toHaveLength(0);
    expect(target.note).toBeUndefined();
  });
});
