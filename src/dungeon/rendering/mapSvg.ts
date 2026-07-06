/* ============================================================
   Pure map renderer: a Dungeon + RenderOptions → an SVG string.

   No DOM reads/writes. Arithmetic and string concatenation are preserved
   verbatim from the original `buildSVG` so output is byte-for-byte identical
   (locked by golden snapshots). The DM map passes {secret:true,dmMarkers:true};
   the player map passes {secret:false,dmMarkers:false}.
   ============================================================ */
import type { Dungeon, RenderOptions, FloorGrid, Marker } from '../model/types';
import { FLOOR, GRID, WALL, INK, GOLD, SECRET_FILL } from './palette';
import { triangle, refBadge, symbol } from './symbols';

export function buildSVG(dungeon: Dungeon, options: RenderOptions): string {
  const gridWidth = dungeon.grid.width;
  const gridHeight = dungeon.grid.height;
  const cellSize = dungeon.grid.cellSize;
  const base = dungeon.floor;
  const secretFloor: FloorGrid | null = options.secret && dungeon.secretFloor ? dungeon.secretFloor : null;

  function isEffectiveFloor(gridX: number, gridY: number): boolean {
    return gridX >= 0 && gridY >= 0 && gridX < gridWidth && gridY < gridHeight && (base[gridY]?.[gridX] === 1 || (!!secretFloor && secretFloor[gridY]?.[gridX] === 1));
  }

  const width = gridWidth * cellSize;
  const height = gridHeight * cellSize;
  let svg = '';

  svg += '<svg viewBox="0 0 ' + width + ' ' + height + '" class="dmap" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';

  // floor + grid (base, on both maps)
  let rects = '';
  for (let row = 0; row < gridHeight; row++) for (let column = 0; column < gridWidth; column++) {
    if (base[row]?.[column] === 1) rects += '<rect x="' + (column * cellSize) + '" y="' + (row * cellSize) + '" width="' + cellSize + '" height="' + cellSize + '" fill="' + FLOOR + '" stroke="' + GRID + '" stroke-width="0.5"/>';
  }
  // secret floor (DM only) — faint gold tint
  if (secretFloor) {
    for (let row = 0; row < gridHeight; row++) for (let column = 0; column < gridWidth; column++) {
      if (secretFloor[row]?.[column] === 1 && base[row]?.[column] !== 1)
        rects += '<rect x="' + (column * cellSize) + '" y="' + (row * cellSize) + '" width="' + cellSize + '" height="' + cellSize + '" fill="' + SECRET_FILL + '" stroke="' + GRID + '" stroke-width="0.5"/>';
    }
  }
  svg += '<g class="floor">' + rects + '</g>';

  // walls — from the effective grid (base ∪ secret on the DM map)
  let wallPath = '';
  for (let row = 0; row < gridHeight; row++) for (let column = 0; column < gridWidth; column++) {
    if (!isEffectiveFloor(column, row)) continue;
    const pixelX = column * cellSize, pixelY = row * cellSize;
    if (!isEffectiveFloor(column, row - 1)) wallPath += 'M' + pixelX + ' ' + pixelY + 'h' + cellSize;
    if (!isEffectiveFloor(column, row + 1)) wallPath += 'M' + pixelX + ' ' + (pixelY + cellSize) + 'h' + cellSize;
    if (!isEffectiveFloor(column - 1, row)) wallPath += 'M' + pixelX + ' ' + pixelY + 'v' + cellSize;
    if (!isEffectiveFloor(column + 1, row)) wallPath += 'M' + (pixelX + cellSize) + ' ' + pixelY + 'v' + cellSize;
  }
  svg += '<path class="walls" d="' + wallPath + '" fill="none" stroke="' + WALL + '" stroke-width="2.4" stroke-linecap="square"/>';

  // secret overlays (DM only): dashed gold passage centerlines + room outlines
  if (options.secret) {
    (dungeon.secretPaths ?? []).forEach(function (secretPath) {
      // Legacy L-schema paths are migrated to straight centerlines at load time.
      const pathData = 'M' + (secretPath.startX * cellSize + cellSize / 2) + ' ' + (secretPath.startY * cellSize + cellSize / 2) + 'L' + (secretPath.endX * cellSize + cellSize / 2) + ' ' + (secretPath.endY * cellSize + cellSize / 2);
      svg += '<path d="' + pathData + '" fill="none" stroke="' + GOLD + '" stroke-width="2.4" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round" opacity="0.95"/>';
    });
    (dungeon.secretRooms ?? []).forEach(function (room) {
      svg += '<rect x="' + (room.gridX * cellSize + 3) + '" y="' + (room.gridY * cellSize + 3) + '" width="' + (room.width * cellSize - 6) + '" height="' + (room.height * cellSize - 6) + '" fill="none" stroke="' + GOLD + '" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.85"/>';
    });
  }

  // markers
  const markers: Marker[] = options.dmMarkers ? dungeon.markers : dungeon.markers.filter(function (marker) { return marker.type === 'entrance'; });
  markers.forEach(function (marker) { svg += symbol(marker, marker.gridX * cellSize + cellSize / 2, marker.gridY * cellSize + cellSize / 2); });

  // room reference letters (DM only)
  if (options.dmMarkers) {
    (dungeon.rooms || []).concat(dungeon.secretRooms ?? []).forEach(function (room) {
      if (room.referenceLabel) svg += refBadge((room.gridX + 0.5) * cellSize, (room.gridY + 0.5) * cellSize, room.referenceLabel);
    });
    (dungeon.corridorNotes ?? []).forEach(function (note) {
      if (note.referenceLabel) svg += refBadge(note.gridX * cellSize + cellSize / 2, note.gridY * cellSize + cellSize / 2, note.referenceLabel);
    });
  }

  // compass
  const compassX = width - 26, compassY = 30;
  svg += '<g class="compass"><line x1="' + compassX + '" y1="' + (compassY + 14) + '" x2="' + compassX + '" y2="' + (compassY - 12) + '" stroke="' + INK + '" stroke-width="1.6"/>' +
    triangle(compassX, compassY - 12, 'up', 6, INK) + '<text x="' + compassX + '" y="' + (compassY - 18) + '" class="mk-cap">N</text></g>';

  svg += '</svg>';
  return svg;
}
