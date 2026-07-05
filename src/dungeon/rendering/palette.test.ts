/* Guards the M7 palette extraction: the preview colors moved from string
   literals in previews.ts into palette.ts, and the SVG output is locked by
   the golden snapshot — these constants must stay byte-identical to the
   literals the painters used before the move. */
import { describe, it, expect } from 'vitest';
import { PREVIEW_FILL, PREVIEW_STROKE, CORRIDOR_PREVIEW_FILL, DELETE_FILL, DELETE_STROKE } from './palette';

describe('preview palette constants (M7)', () => {
  it('room/corridor preview colors equal the pre-extraction literals', () => {
    expect(PREVIEW_FILL).toBe('oklch(0.66 0.094 78 / .22)');
    expect(PREVIEW_STROKE).toBe('oklch(0.52 0.084 70)');
    expect(CORRIDOR_PREVIEW_FILL).toBe('oklch(0.66 0.094 78 / .3)');
  });

  it('delete preview colors equal the pre-extraction literals', () => {
    expect(DELETE_FILL).toBe('oklch(0.55 0.16 30 / .25)');
    expect(DELETE_STROKE).toBe('oklch(0.5 0.15 32)');
  });
});
