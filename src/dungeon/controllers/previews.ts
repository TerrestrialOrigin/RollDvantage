/* ============================================================
   Shared live-edit preview painters — the dashed room/delete rectangles and
   corridor cell trail drawn into the map's #mapfx overlay group. Used by both
   the pointer structure-mode controller and the keyboard edit controller so
   both input paths show identical previews. Bodies preserved verbatim from
   structureModeController; callers pass the dungeon's cell size.
   ============================================================ */
import { fxGroup } from './mapSurface';

export function drawRoomPreview(cell: number, x0: number, y0: number, x1: number, y1: number): void {
  const group = fxGroup(); if (!group) return;
  const ax = Math.min(x0, x1), ay = Math.min(y0, y1), bx = Math.max(x0, x1), by = Math.max(y0, y1);
  group.innerHTML = '<rect x="' + (ax * cell) + '" y="' + (ay * cell) + '" width="' + ((bx - ax + 1) * cell) + '" height="' + ((by - ay + 1) * cell) + '" fill="oklch(0.66 0.094 78 / .22)" stroke="oklch(0.52 0.084 70)" stroke-width="2" stroke-dasharray="6 4"/>';
}

export function drawCorridorPreview(cell: number, cells: [number, number][]): void {
  const group = fxGroup(); if (!group) return;
  let markup = '';
  cells.forEach((point) => { markup += '<rect x="' + (point[0] * cell) + '" y="' + (point[1] * cell) + '" width="' + cell + '" height="' + cell + '" fill="oklch(0.66 0.094 78 / .3)" stroke="oklch(0.52 0.084 70)" stroke-width="1"/>'; });
  group.innerHTML = markup;
}

export function drawDeletePreview(cell: number, x0: number, y0: number, x1: number, y1: number): void {
  const group = fxGroup(); if (!group) return;
  const ax = Math.min(x0, x1), ay = Math.min(y0, y1), bx = Math.max(x0, x1), by = Math.max(y0, y1);
  group.innerHTML = '<rect x="' + (ax * cell) + '" y="' + (ay * cell) + '" width="' + ((bx - ax + 1) * cell) + '" height="' + ((by - ay + 1) * cell) + '" fill="oklch(0.55 0.16 30 / .25)" stroke="oklch(0.5 0.15 32)" stroke-width="2" stroke-dasharray="6 4"/>';
}
