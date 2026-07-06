/* ============================================================
   Grid geometry — pure coordinate math between screen space and grid cells.

   These functions take an explicit Grid (and a client rect for hit-testing)
   so they have no DOM dependency. Logic is preserved verbatim from the original.
   ============================================================ */
import type { Direction, Grid } from '../model/types';

export interface CellHit {
  gridX: number;
  gridY: number;
  inside: boolean;
  rect: DOMRect;
  scale: number;
}

/** Map a client point to a grid cell using the SVG element's bounding rect. */
export function cellFromClient(grid: Grid, rect: DOMRect, clientX: number, clientY: number): CellHit | null {
  if (!rect.width || !rect.height) return null;
  const pixelWidth = grid.width * grid.cellSize, pixelHeight = grid.height * grid.cellSize;
  const gridX = Math.floor((clientX - rect.left) / rect.width * pixelWidth / grid.cellSize);
  const gridY = Math.floor((clientY - rect.top) / rect.height * pixelHeight / grid.cellSize);
  const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  if (gridX < 0 || gridY < 0 || gridX >= grid.width || gridY >= grid.height) return null;
  return { gridX, gridY, inside, rect, scale: rect.width / pixelWidth };
}

/** Like cellFromClient but clamps to the grid bounds instead of returning null. */
export function cellClamped(grid: Grid, rect: DOMRect, clientX: number, clientY: number): { gridX: number; gridY: number } | null {
  if (!rect.width || !rect.height) return null;
  const pixelWidth = grid.width * grid.cellSize, pixelHeight = grid.height * grid.cellSize;
  let gridX = Math.floor((clientX - rect.left) / rect.width * pixelWidth / grid.cellSize);
  let gridY = Math.floor((clientY - rect.top) / rect.height * pixelHeight / grid.cellSize);
  gridX = Math.max(0, Math.min(grid.width - 1, gridX));
  gridY = Math.max(0, Math.min(grid.height - 1, gridY));
  return { gridX, gridY };
}

/** The boundary-side direction for a cell, matching how generation stores entrance/exit. */
export function edgeDir(grid: Grid, gridX: number, gridY: number): Direction {
  const gridWidth = grid.width, gridHeight = grid.height;
  let best: Direction = 'down', bestValue = gridY;
  if (gridHeight - 1 - gridY < bestValue) { bestValue = gridHeight - 1 - gridY; best = 'up'; }
  if (gridX < bestValue) { bestValue = gridX; best = 'right'; }
  if (gridWidth - 1 - gridX < bestValue) { bestValue = gridWidth - 1 - gridX; best = 'left'; }
  return best;
}

/** The L-shaped run of cells connecting two points (longer axis first). */
export function corridorCells(startX: number, startY: number, endX: number, endY: number): [number, number][] {
  const cells: [number, number][] = [];
  let column: number, row: number;
  if (Math.abs(endX - startX) >= Math.abs(endY - startY)) { // longer axis first
    for (column = Math.min(startX, endX); column <= Math.max(startX, endX); column++) cells.push([column, startY]);
    for (row = Math.min(startY, endY); row <= Math.max(startY, endY); row++) cells.push([endX, row]);
  } else {
    for (row = Math.min(startY, endY); row <= Math.max(startY, endY); row++) cells.push([startX, row]);
    for (column = Math.min(startX, endX); column <= Math.max(startX, endX); column++) cells.push([column, endY]);
  }
  return cells;
}
