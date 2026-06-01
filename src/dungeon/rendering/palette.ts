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

/** Exit markers point opposite to the stored boundary direction. */
export const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  down: 'up',
  up: 'down',
  right: 'left',
  left: 'right',
};
