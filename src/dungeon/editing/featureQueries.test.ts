/* Guards the M13 sentinel change in featureBBox: bounds now start at
   ±Infinity instead of 1e9/-1, which is safe because a straight run always
   contains at least its origin cell — these tests pin that invariant at the
   tightest edge (a single-cell run) and on ordinary rooms/runs. */
import { describe, it, expect } from 'vitest';
import { featureAt, featureBBox } from './featureQueries';
import { straightRun } from '../geometry/topology';
import type { Dungeon } from '../model/types';

/** 5×4 grid: an isolated single corridor cell at (1,1), a 2×2 room at (3,1). */
function fixtureDungeon(): Dungeon {
  return {
    seed: 3, name: 'BBox Fixture', depth: 'Depth 1',
    grid: { width: 5, height: 4, cellSize: 24 },
    floor: [
      [0, 0, 0, 0, 0],
      [0, 1, 0, 1, 1],
      [0, 0, 0, 1, 1],
      [0, 0, 0, 0, 0],
    ],
    rooms: [{ gridX: 3, gridY: 1, width: 2, height: 2, id: 1 }],
    markers: [],
    tally: { rooms: 1, foes: 0, traps: 0, loot: 0, secret: 0 },
  };
}

describe('featureBBox sentinel safety', () => {
  it('a straight run always contains at least its origin cell (sentinels never escape)', () => {
    const run = straightRun(fixtureDungeon(), 1, 1);
    expect(run.cells.length).toBeGreaterThanOrEqual(1);
    expect(run.cells).toContainEqual([1, 1]);
  });

  it('a single-cell corridor bounds to exactly that cell — no Infinity leaks', () => {
    const dungeon = fixtureDungeon();
    const feature = featureAt(dungeon, 1, 1)!;
    expect(feature.kind).toBe('corridor');
    expect(featureBBox(dungeon, feature, 1, 1)).toEqual({ minX: 1, minY: 1, maxX: 1, maxY: 1 });
  });

  it('a room bounds to its rectangle', () => {
    const dungeon = fixtureDungeon();
    const feature = featureAt(dungeon, 3, 1)!;
    expect(feature.kind).toBe('room');
    expect(featureBBox(dungeon, feature, 3, 1)).toEqual({ minX: 3, minY: 1, maxX: 4, maxY: 2 });
  });
});
