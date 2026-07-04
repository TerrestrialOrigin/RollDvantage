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
