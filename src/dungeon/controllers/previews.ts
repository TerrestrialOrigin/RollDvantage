/* ============================================================
   Shared live-edit preview painters — the dashed room/delete rectangles and
   corridor cellSize trail drawn into the map's #mapfx overlay group. Used by both
   the pointer structure-mode controllers and the keyboard edit controller so
   both input paths show identical previews. Room and delete previews are the
   same dashed rectangle in different palette colors (M6), so both delegate to
   one parameterized painter; markup is byte-identical to the original strings.
   ============================================================ */
import { PREVIEW_FILL, PREVIEW_STROKE, CORRIDOR_PREVIEW_FILL, DELETE_FILL, DELETE_STROKE } from '../rendering/palette';
import { fxGroup } from './mapSurface';

function drawRectPreview(cellSize: number, startX: number, startY: number, endX: number, endY: number, fill: string, stroke: string): void {
  const group = fxGroup(); if (!group) return;
  const minX = Math.min(startX, endX), minY = Math.min(startY, endY), maxX = Math.max(startX, endX), maxY = Math.max(startY, endY);
  group.innerHTML = '<rect x="' + (minX * cellSize) + '" y="' + (minY * cellSize) + '" width="' + ((maxX - minX + 1) * cellSize) + '" height="' + ((maxY - minY + 1) * cellSize) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2" stroke-dasharray="6 4"/>';
}

export function drawRoomPreview(cellSize: number, startX: number, startY: number, endX: number, endY: number): void {
  drawRectPreview(cellSize, startX, startY, endX, endY, PREVIEW_FILL, PREVIEW_STROKE);
}

export function drawCorridorPreview(cellSize: number, cells: [number, number][]): void {
  const group = fxGroup(); if (!group) return;
  let markup = '';
  cells.forEach((point) => { markup += '<rect x="' + (point[0] * cellSize) + '" y="' + (point[1] * cellSize) + '" width="' + cellSize + '" height="' + cellSize + '" fill="' + CORRIDOR_PREVIEW_FILL + '" stroke="' + PREVIEW_STROKE + '" stroke-width="1"/>'; });
  group.innerHTML = markup;
}

export function drawDeletePreview(cellSize: number, startX: number, startY: number, endX: number, endY: number): void {
  drawRectPreview(cellSize, startX, startY, endX, endY, DELETE_FILL, DELETE_STROKE);
}
