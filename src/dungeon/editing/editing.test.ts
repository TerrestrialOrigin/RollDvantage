import { describe, it, expect } from 'vitest';
import { generateDungeon } from 'auto-stuff-generator';
import { commitRoom, commitDelete } from './structureOps';
import { convertSecretAt, unconvertSecret } from './secretOps';
import { applyNote, removeNote } from './noteOps';
import type { Dungeon } from '../model/types';

function freshDungeon(): Dungeon {
  return JSON.parse(JSON.stringify(generateDungeon(0xc0ffee, 3, 'detailed'))) as Dungeon;
}

describe('structureOps', () => {
  it('commitRoom adds floor and a room record with a new id', () => {
    const dungeon = { grid: { gw: 5, gh: 5, cell: 20 }, floor: Array.from({ length: 5 }, () => new Array<number>(5).fill(0)), rooms: [], markers: [] } as unknown as Dungeon;
    commitRoom(dungeon, 1, 1, 2, 2);
    expect(dungeon.floor[1][1]).toBe(1);
    expect(dungeon.floor[2][2]).toBe(1);
    expect(dungeon.rooms).toHaveLength(1);
    expect(dungeon.rooms[0]).toMatchObject({ x: 1, y: 1, w: 2, h: 2, id: 1 });
  });

  it('commitDelete clears floor and drops orphaned rooms + markers', () => {
    const dungeon = {
      grid: { gw: 4, gh: 4, cell: 20 },
      floor: [[0, 0, 0, 0], [0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
      rooms: [{ x: 1, y: 1, w: 2, h: 2, id: 1 }],
      markers: [{ type: 'monster', x: 1, y: 1 }],
      secretPaths: [], corridorNotes: [],
    } as unknown as Dungeon;
    commitDelete(dungeon, 1, 1, 2, 2);
    expect(dungeon.floor[1][1]).toBe(0);
    expect(dungeon.rooms).toHaveLength(0);   // room fully erased
    expect(dungeon.markers).toHaveLength(0); // marker on a deleted cell removed
  });
});

/** A hand-built dungeon with a plain corridor run at row 2, x=1..4 (no rooms touching it). */
function corridorDungeon(): Dungeon {
  const gridWidth = 6, gridHeight = 5;
  const floor = Array.from({ length: gridHeight }, () => new Array<number>(gridWidth).fill(0));
  floor[2][1] = floor[2][2] = floor[2][3] = floor[2][4] = 1;
  return {
    seed: 1, name: 'Corridor Test', depth: 'Depth 1',
    grid: { gw: gridWidth, gh: gridHeight, cell: 24 },
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
      expect(dungeon.floor[2][x]).toBe(0);
      expect(dungeon.secretFloor![2][x]).toBe(1);
    }
    expect(dungeon.secretPaths).toEqual([{ x1: 1, y1: 2, x2: 4, y2: 2 }]);
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
    secretFloor[1][1] = secretFloor[1][2] = secretFloor[2][1] = secretFloor[2][2] = 1; // secret room
    secretFloor[4][1] = secretFloor[4][2] = secretFloor[4][3] = 1;                     // secret passage
    const dungeon = {
      seed: 2, name: 'Secret Cleanup', depth: 'Depth 1',
      grid: { gw: gridWidth, gh: gridHeight, cell: 24 },
      floor, secretFloor,
      rooms: [],
      secretRooms: [{ x: 1, y: 1, w: 2, h: 2, id: 1 }],
      secretPaths: [{ x1: 1, y1: 4, x2: 3, y2: 4 }],
      markers: [{ type: 'secret', x: 2, y: 4, placed: true }],
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
    const cx = room.x, cy = room.y;
    convertSecretAt(dungeon, cx, cy);
    // it left the visible rooms / moved to secret
    expect(dungeon.secretRooms!.length).toBeGreaterThanOrEqual(1);
    unconvertSecret(dungeon, cx, cy);
    // structure restored
    const original = JSON.parse(before) as Dungeon;
    expect(JSON.stringify(dungeon.floor)).toBe(JSON.stringify(original.floor));
    expect(dungeon.rooms.length).toBe(original.rooms.length);
  });
});

describe('noteOps', () => {
  it('applies a note and assigns a sequence', () => {
    const dungeon = { _seq: 0, markers: [] } as unknown as Dungeon;
    const target = { } as { note?: string; seq?: number; label?: string };
    const result = applyNote(dungeon, target, null, 'a trap here', 'Trap Room');
    expect(result).toBe('saved');
    expect(target).toMatchObject({ note: 'a trap here', label: 'Trap Room', seq: 0 });
    expect(dungeon._seq).toBe(1);
  });

  it('clearing title and note removes the annotation', () => {
    const dungeon = { _seq: 1, markers: [] } as unknown as Dungeon;
    const target = { note: 'x', label: 'y', seq: 0, ref: 'A' } as Record<string, unknown>;
    const result = applyNote(dungeon, target, null, '', '');
    expect(result).toBe('removed');
    expect(target.note).toBeUndefined();
    expect(target.ref).toBeUndefined();
  });

  it('removeNote detaches a loose note from its list', () => {
    const target = { note: 'x', seq: 1 } as Record<string, unknown>;
    const list = [target];
    removeNote(target, list);
    expect(list).toHaveLength(0);
    expect(target.note).toBeUndefined();
  });
});
