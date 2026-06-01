import { describe, it, expect } from 'vitest';
import { cellFromClient, cellClamped, edgeDir, corridorCells } from './grid';
import { straightRunF, isCorridorCell, roomIndexAt } from './topology';
import type { Dungeon, Grid } from '../model/types';

const grid: Grid = { gw: 10, gh: 8, cell: 20 };
const rect = { left: 0, top: 0, width: 200, height: 160, right: 200, bottom: 160 } as DOMRect;

describe('grid geometry', () => {
  it('maps a client point to the right cell', () => {
    expect(cellFromClient(grid, rect, 30, 50)).toMatchObject({ x: 1, y: 2, inside: true });
  });
  it('returns null outside the grid', () => {
    expect(cellFromClient(grid, rect, 9999, 50)).toBeNull();
  });
  it('clamps out-of-bounds points to the grid edge', () => {
    expect(cellClamped(grid, rect, -100, 9999)).toEqual({ x: 0, y: 7 });
  });
  it('derives the nearest boundary direction', () => {
    expect(edgeDir(grid, 0, 4)).toBe('right');
    expect(edgeDir(grid, 9, 4)).toBe('left');
    expect(edgeDir(grid, 5, 0)).toBe('down');
    expect(edgeDir(grid, 5, 7)).toBe('up');
  });
  it('builds an L-path along the longer axis first', () => {
    const cells = corridorCells(0, 0, 3, 1);
    expect(cells).toContainEqual([0, 0]);
    expect(cells).toContainEqual([3, 0]);
    expect(cells).toContainEqual([3, 1]);
  });
});

describe('straight run', () => {
  it('stops a horizontal run at a turn', () => {
    // a 3-long horizontal segment of "corridor" cells
    const present = new Set(['1,1', '2,1', '3,1']);
    const run = straightRunF(2, 1, (x, y) => present.has(`${x},${y}`));
    expect(run.horiz).toBe(true);
    expect(run.cells.length).toBe(3);
  });
});

describe('room hit-test', () => {
  it('identifies a corridor cell as floor outside any room', () => {
    const dungeon = {
      floor: [[0, 0, 0], [0, 1, 1]],
      rooms: [{ x: 1, y: 1, w: 1, h: 1 }],
    } as unknown as Dungeon;
    expect(roomIndexAt(dungeon, 1, 1)).toBe(0);
    expect(isCorridorCell(dungeon, 2, 1)).toBe(true); // floor but not in the room
    expect(isCorridorCell(dungeon, 1, 1)).toBe(false); // inside the room
  });
});
