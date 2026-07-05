/* ============================================================
   Integration: rolldvantage <-> auto-stuff-generator.

   This exercises the REAL cross-package path with NO mocks:
   it imports generateDungeon from the published package exactly
   as src/dungeon.ts does, and asserts the returned object honors
   the contract the renderer (buildSVG/renderDungeon) relies on.

   Mock-boundary rule: zero mocks on the code path being tested.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { generateDungeon } from 'auto-stuff-generator';

/** The exact fields rolldvantage's renderer reads off a dungeon object. */
function assertRenderableContract(dungeon: ReturnType<typeof generateDungeon>) {
  expect(typeof dungeon.name).toBe('string');
  expect(typeof dungeon.depth).toBe('string');
  expect(typeof dungeon.flavor).toBe('string');

  expect(dungeon.grid).toBeTruthy();
  expect(typeof dungeon.grid.gw).toBe('number');
  expect(typeof dungeon.grid.gh).toBe('number');
  expect(typeof dungeon.grid.cell).toBe('number');

  // floor is a gh x gw matrix of 0/1 cells
  expect(Array.isArray(dungeon.floor)).toBe(true);
  expect(dungeon.floor.length).toBe(dungeon.grid.gh);
  expect(dungeon.floor[0]?.length).toBe(dungeon.grid.gw);

  // markers carry the type/x/y the symbol() renderer switches on
  expect(Array.isArray(dungeon.markers)).toBe(true);
  dungeon.markers.forEach((marker) => {
    expect(typeof marker.type).toBe('string');
    expect(typeof marker.x).toBe('number');
    expect(typeof marker.y).toBe('number');
  });

  // tally drives the count panel
  expect(typeof dungeon.tally.rooms).toBe('number');
  expect(typeof dungeon.tally.foes).toBe('number');
  expect(typeof dungeon.tally.traps).toBe('number');
  expect(typeof dungeon.tally.loot).toBe('number');
  expect(typeof dungeon.tally.secret).toBe('number');
}

describe('rolldvantage consumes auto-stuff-generator', () => {
  it('generates a dungeon object that satisfies the renderer contract', () => {
    const dungeon = generateDungeon(0xc0ffee, 3, 'detailed');
    assertRenderableContract(dungeon);
  });

  it('produces an entrance marker the player map always renders', () => {
    const dungeon = generateDungeon(12345, 4, 'full');
    const hasEntrance = dungeon.markers.some((marker) => marker.type === 'entrance');
    expect(hasEntrance).toBe(true);
  });

  it('is reproducible from the consumer side for a fixed seed', () => {
    const first = generateDungeon(987654, 5, 'detailed');
    const second = generateDungeon(987654, 5, 'detailed');
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('round-trips through save/load JSON unchanged', () => {
    const dungeon = generateDungeon(42, 2, 'full');
    const saved = JSON.stringify(dungeon, null, 2);
    expect(JSON.parse(saved)).toEqual(dungeon);
  });
});
