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
  const gridWidth = dungeon.grid.gw;
  const gridHeight = dungeon.grid.gh;
  const cell = dungeon.grid.cell;
  const base = dungeon.floor;
  const secretFloor: FloorGrid | null = options.secret && dungeon.secretFloor ? dungeon.secretFloor : null;

  function isEffectiveFloor(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < gridWidth && y < gridHeight && (base[y][x] === 1 || (!!secretFloor && secretFloor[y][x] === 1));
  }

  const width = gridWidth * cell;
  const height = gridHeight * cell;
  let svg = '';

  svg += '<svg viewBox="0 0 ' + width + ' ' + height + '" class="dmap" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';

  // floor + grid (base, on both maps)
  let rects = '';
  for (let fy = 0; fy < gridHeight; fy++) for (let fx = 0; fx < gridWidth; fx++) {
    if (base[fy][fx] === 1) rects += '<rect x="' + (fx * cell) + '" y="' + (fy * cell) + '" width="' + cell + '" height="' + cell + '" fill="' + FLOOR + '" stroke="' + GRID + '" stroke-width="0.5"/>';
  }
  // secret floor (DM only) — faint gold tint
  if (secretFloor) {
    for (let gy = 0; gy < gridHeight; gy++) for (let gx = 0; gx < gridWidth; gx++) {
      if (secretFloor[gy][gx] === 1 && base[gy][gx] !== 1)
        rects += '<rect x="' + (gx * cell) + '" y="' + (gy * cell) + '" width="' + cell + '" height="' + cell + '" fill="' + SECRET_FILL + '" stroke="' + GRID + '" stroke-width="0.5"/>';
    }
  }
  svg += '<g class="floor">' + rects + '</g>';

  // walls — from the effective grid (base ∪ secret on the DM map)
  let wallPath = '';
  for (let y = 0; y < gridHeight; y++) for (let x = 0; x < gridWidth; x++) {
    if (!isEffectiveFloor(x, y)) continue;
    const px = x * cell, py = y * cell;
    if (!isEffectiveFloor(x, y - 1)) wallPath += 'M' + px + ' ' + py + 'h' + cell;
    if (!isEffectiveFloor(x, y + 1)) wallPath += 'M' + px + ' ' + (py + cell) + 'h' + cell;
    if (!isEffectiveFloor(x - 1, y)) wallPath += 'M' + px + ' ' + py + 'v' + cell;
    if (!isEffectiveFloor(x + 1, y)) wallPath += 'M' + (px + cell) + ' ' + py + 'v' + cell;
  }
  svg += '<path class="walls" d="' + wallPath + '" fill="none" stroke="' + WALL + '" stroke-width="2.4" stroke-linecap="square"/>';

  // secret overlays (DM only): dashed gold passage centerlines + room outlines
  if (options.secret) {
    (dungeon.secretPaths ?? []).forEach(function (secretPath) {
      // Legacy L-schema paths are migrated to straight centerlines at load time.
      const pathData = 'M' + (secretPath.x1 * cell + cell / 2) + ' ' + (secretPath.y1 * cell + cell / 2) + 'L' + (secretPath.x2 * cell + cell / 2) + ' ' + (secretPath.y2 * cell + cell / 2);
      svg += '<path d="' + pathData + '" fill="none" stroke="' + GOLD + '" stroke-width="2.4" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round" opacity="0.95"/>';
    });
    (dungeon.secretRooms ?? []).forEach(function (room) {
      svg += '<rect x="' + (room.x * cell + 3) + '" y="' + (room.y * cell + 3) + '" width="' + (room.w * cell - 6) + '" height="' + (room.h * cell - 6) + '" fill="none" stroke="' + GOLD + '" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.85"/>';
    });
  }

  // markers
  const markers: Marker[] = options.dmMarkers ? dungeon.markers : dungeon.markers.filter(function (marker) { return marker.type === 'entrance'; });
  markers.forEach(function (marker) { svg += symbol(marker, marker.x * cell + cell / 2, marker.y * cell + cell / 2); });

  // room reference letters (DM only)
  if (options.dmMarkers) {
    (dungeon.rooms || []).concat(dungeon.secretRooms ?? []).forEach(function (room) {
      if (room.ref) svg += refBadge((room.x + 0.5) * cell, (room.y + 0.5) * cell, room.ref);
    });
    (dungeon.corridorNotes ?? []).forEach(function (note) {
      if (note.ref) svg += refBadge(note.x * cell + cell / 2, note.y * cell + cell / 2, note.ref);
    });
  }

  // compass
  const compassX = width - 26, compassY = 30;
  svg += '<g class="compass"><line x1="' + compassX + '" y1="' + (compassY + 14) + '" x2="' + compassX + '" y2="' + (compassY - 12) + '" stroke="' + INK + '" stroke-width="1.6"/>' +
    triangle(compassX, compassY - 12, 'up', 6, INK) + '<text x="' + compassX + '" y="' + (compassY - 18) + '" class="mk-cap">N</text></g>';

  svg += '</svg>';
  return svg;
}
