/* The map's color palette (oklch) and the entrance/exit direction inversion map.
   Values are preserved verbatim from the original renderer so output is identical. */
import type { Direction } from '../model/types';

export const FLOOR = 'oklch(0.928 0.016 82)';
export const GRID = 'oklch(0.74 0.03 78 / 0.40)';
export const WALL = 'oklch(0.30 0.02 60)';
export const INK = 'oklch(0.28 0.018 60)';
export const GOLD = 'oklch(0.52 0.084 70)';
export const GHALO = 'oklch(0.952 0.014 84)';
export const SECRET_FILL = 'oklch(0.905 0.05 80)';

/* Live-edit preview colors (M7) — used by the controllers' preview painters.
   Values are the exact literals previews.ts carried before the extraction. */
export const PREVIEW_FILL = 'oklch(0.66 0.094 78 / .22)';
export const PREVIEW_STROKE = 'oklch(0.52 0.084 70)';
export const CORRIDOR_PREVIEW_FILL = 'oklch(0.66 0.094 78 / .3)';
export const DELETE_FILL = 'oklch(0.55 0.16 30 / .25)';
export const DELETE_STROKE = 'oklch(0.5 0.15 32)';

/** Exit markers point opposite to the stored boundary direction. */
export const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  down: 'up',
  up: 'down',
  right: 'left',
  left: 'right',
};
