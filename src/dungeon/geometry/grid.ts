/* ============================================================
   Grid geometry — pure coordinate math between screen space and grid cells.

   These functions take an explicit Grid (and a client rect for hit-testing)
   so they have no DOM dependency. Logic is preserved verbatim from the original.
   ============================================================ */
import type { Direction, Grid } from '../model/types';

export interface CellHit {
  x: number;
  y: number;
  inside: boolean;
  rect: DOMRect;
  scale: number;
}

/** Map a client point to a grid cell using the SVG element's bounding rect. */
export function cellFromClient(grid: Grid, rect: DOMRect, clientX: number, clientY: number): CellHit | null {
  if (!rect.width || !rect.height) return null;
  const width = grid.width * grid.cell, height = grid.height * grid.cell;
  const x = Math.floor((clientX - rect.left) / rect.width * width / grid.cell);
  const y = Math.floor((clientY - rect.top) / rect.height * height / grid.cell);
  const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
  return { x, y, inside, rect, scale: rect.width / width };
}

/** Like cellFromClient but clamps to the grid bounds instead of returning null. */
export function cellClamped(grid: Grid, rect: DOMRect, clientX: number, clientY: number): { x: number; y: number } | null {
  if (!rect.width || !rect.height) return null;
  const width = grid.width * grid.cell, height = grid.height * grid.cell;
  let x = Math.floor((clientX - rect.left) / rect.width * width / grid.cell);
  let y = Math.floor((clientY - rect.top) / rect.height * height / grid.cell);
  x = Math.max(0, Math.min(grid.width - 1, x));
  y = Math.max(0, Math.min(grid.height - 1, y));
  return { x, y };
}

/** The boundary-side direction for a cell, matching how generation stores entrance/exit. */
export function edgeDir(grid: Grid, x: number, y: number): Direction {
  const gridWidth = grid.width, gridHeight = grid.height;
  let best: Direction = 'down', bestValue = y;
  if (gridHeight - 1 - y < bestValue) { bestValue = gridHeight - 1 - y; best = 'up'; }
  if (x < bestValue) { bestValue = x; best = 'right'; }
  if (gridWidth - 1 - x < bestValue) { bestValue = gridWidth - 1 - x; best = 'left'; }
  return best;
}

/** The L-shaped run of cells connecting two points (longer axis first). */
export function corridorCells(startX: number, startY: number, endX: number, endY: number): [number, number][] {
  const cells: [number, number][] = [];
  let xx: number, yy: number;
  if (Math.abs(endX - startX) >= Math.abs(endY - startY)) { // longer axis first
    for (xx = Math.min(startX, endX); xx <= Math.max(startX, endX); xx++) cells.push([xx, startY]);
    for (yy = Math.min(startY, endY); yy <= Math.max(startY, endY); yy++) cells.push([endX, yy]);
  } else {
    for (yy = Math.min(startY, endY); yy <= Math.max(startY, endY); yy++) cells.push([startX, yy]);
    for (xx = Math.min(startX, endX); xx <= Math.max(startX, endX); xx++) cells.push([xx, endY]);
  }
  return cells;
}
