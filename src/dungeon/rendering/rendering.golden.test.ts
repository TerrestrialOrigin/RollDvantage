/* PERMANENT golden: locks the pure renderer's output for fixed seeds.
   Captured from the extracted buildSVG (already proven byte-identical to the
   original by rendering.equivalence.test.ts). This snapshot guards every
   subsequent refactor group against accidental output drift. */
import { describe, it, expect } from 'vitest';
import { generateDungeon } from 'auto-stuff-generator';
import { migrateDungeon } from '../persistence/dungeonFile';
import { buildSVG } from './mapSvg';

describe('renderer golden (raw SVG strings)', () => {
  for (const [seed, level, mode] of [[0xc0ffee, 3, 'detailed'], [12345, 4, 'full'], [42, 2, 'empty']] as const) {
    it(`is stable for seed ${seed}/${level}/${mode}`, () => {
      // Through the same adoption boundary the app uses (the 0.5.0 generator already
      // emits the current full-name schema; migrateDungeon stamps the version).
      const dungeon = migrateDungeon(generateDungeon(seed, level, mode));
      expect(buildSVG(dungeon, { secret: true, dmMarkers: true })).toMatchSnapshot('dm');
      expect(buildSVG(dungeon, { secret: false, dmMarkers: false })).toMatchSnapshot('player');
    });
  }
});
