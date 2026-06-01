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
  const width = grid.gw * grid.cell, height = grid.gh * grid.cell;
  const x = Math.floor((clientX - rect.left) / rect.width * width / grid.cell);
  const y = Math.floor((clientY - rect.top) / rect.height * height / grid.cell);
  const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  if (x < 0 || y < 0 || x >= grid.gw || y >= grid.gh) return null;
  return { x, y, inside, rect, scale: rect.width / width };
}

/** Like cellFromClient but clamps to the grid bounds instead of returning null. */
export function cellClamped(grid: Grid, rect: DOMRect, clientX: number, clientY: number): { x: number; y: number } | null {
  if (!rect.width || !rect.height) return null;
  const width = grid.gw * grid.cell, height = grid.gh * grid.cell;
  let x = Math.floor((clientX - rect.left) / rect.width * width / grid.cell);
  let y = Math.floor((clientY - rect.top) / rect.height * height / grid.cell);
  x = Math.max(0, Math.min(grid.gw - 1, x));
  y = Math.max(0, Math.min(grid.gh - 1, y));
  return { x, y };
}

/** The boundary-side direction for a cell, matching how generation stores entrance/exit. */
export function edgeDir(grid: Grid, x: number, y: number): Direction {
  const gridWidth = grid.gw, gridHeight = grid.gh;
  let best: Direction = 'down', bestValue = y;
  if (gridHeight - 1 - y < bestValue) { bestValue = gridHeight - 1 - y; best = 'up'; }
  if (x < bestValue) { bestValue = x; best = 'right'; }
  if (gridWidth - 1 - x < bestValue) { bestValue = gridWidth - 1 - x; best = 'left'; }
  return best;
}

/** The L-shaped run of cells connecting two points (longer axis first). */
export function corridorCells(ax: number, ay: number, bx: number, by: number): [number, number][] {
  const cells: [number, number][] = [];
  let xx: number, yy: number;
  if (Math.abs(bx - ax) >= Math.abs(by - ay)) { // longer axis first
    for (xx = Math.min(ax, bx); xx <= Math.max(ax, bx); xx++) cells.push([xx, ay]);
    for (yy = Math.min(ay, by); yy <= Math.max(ay, by); yy++) cells.push([bx, yy]);
  } else {
    for (yy = Math.min(ay, by); yy <= Math.max(ay, by); yy++) cells.push([ax, yy]);
    for (xx = Math.min(ax, bx); xx <= Math.max(ax, bx); xx++) cells.push([xx, by]);
  }
  return cells;
}
