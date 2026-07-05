/* ============================================================
   SVG symbol primitives — pure string builders for map markers.

   Every function returns an SVG fragment string. The arithmetic and string
   concatenation are preserved verbatim from the original renderer so the
   output is byte-for-byte identical (locked by golden snapshots).
   ============================================================ */
import type { Direction, MarkerType } from '../model/types';
import { INK, GOLD, GHALO, OPPOSITE_DIRECTION } from './palette';

/** A direction-pointing triangle. */
export function triangle(
  centerX: number,
  centerY: number,
  direction: Direction,
  size: number,
  fill?: string,
  stroke?: string,
  strokeWidth?: number,
): string {
  let points: number[];
  if (direction === 'down') points = [centerX, centerY + size, centerX - size, centerY - size * 0.7, centerX + size, centerY - size * 0.7];
  else if (direction === 'up') points = [centerX, centerY - size, centerX - size, centerY + size * 0.7, centerX + size, centerY + size * 0.7];
  else if (direction === 'right') points = [centerX + size, centerY, centerX - size * 0.7, centerY - size, centerX - size * 0.7, centerY + size];
  else points = [centerX - size, centerY, centerX + size * 0.7, centerY - size, centerX + size * 0.7, centerY + size];
  return '<polygon points="' + points.join(' ') + '" fill="' + (fill ?? 'none') + '" stroke="' + (stroke ?? 'none') + '" stroke-width="' + (strokeWidth ?? 0) + '" stroke-linejoin="round"/>';
}

/** A soft circular backdrop behind a marker glyph. */
export function halo(centerX: number, centerY: number, radius: number): string {
  return '<circle cx="' + centerX + '" cy="' + centerY + '" r="' + radius + '" fill="' + GHALO + '" opacity="0.92"/>';
}

/** Spreadsheet-style index → letter: 0→A, 25→Z, 26→AA, … */
export function letterFor(index: number): string {
  let out = '';
  let value = index | 0;
  do {
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return out;
}

/** The gold-ringed reference-letter badge. */
export function refBadge(centerX: number, centerY: number, letter: string): string {
  return '<g class="refbadge"><circle cx="' + centerX + '" cy="' + centerY + '" r="10.5" fill="' + GHALO + '" stroke="' + GOLD + '" stroke-width="1.8"/>' +
    '<text x="' + centerX + '" y="' + (centerY + 4.8) + '" class="ref-letter">' + letter + '</text></g>';
}

/** The glyph for a marker, optionally with its reference badge. */
export function symbol(marker: { type: MarkerType; dir?: Direction; ref?: string }, centerX: number, centerY: number): string {
  let glyph = '';
  switch (marker.type) {
    case 'entrance':
      glyph = triangle(centerX, centerY, marker.dir!, 8, GOLD);
      break;
    case 'exit':
      glyph = triangle(centerX, centerY, OPPOSITE_DIRECTION[marker.dir!] || 'up', 8, 'none', INK, 2);
      break;
    case 'trap':
      glyph = '<circle cx="' + centerX + '" cy="' + centerY + '" r="7.5" fill="' + GHALO + '" stroke="' + INK + '" stroke-width="1.8"/>' +
        '<path d="M' + (centerX - 3.4) + ' ' + (centerY - 3.4) + 'l6.8 6.8 M' + (centerX + 3.4) + ' ' + (centerY - 3.4) + 'l-6.8 6.8" stroke="' + INK + '" stroke-width="1.8" stroke-linecap="round"/>';
      break;
    case 'monster':
      glyph = halo(centerX, centerY, 8) + '<circle cx="' + centerX + '" cy="' + centerY + '" r="6" fill="' + GOLD + '"/>';
      break;
    case 'boss':
      glyph = halo(centerX, centerY, 12) +
        '<circle cx="' + centerX + '" cy="' + centerY + '" r="10" fill="none" stroke="' + INK + '" stroke-width="2"/>' +
        '<rect x="' + (centerX - 5.3) + '" y="' + (centerY - 5.3) + '" width="10.6" height="10.6" fill="' + GOLD + '" transform="rotate(45 ' + centerX + ' ' + centerY + ')"/>';
      break;
    case 'treasure':
      glyph = halo(centerX, centerY, 9) +
        '<rect x="' + (centerX - 7) + '" y="' + (centerY - 5) + '" width="14" height="10" rx="1.4" fill="oklch(0.86 0.07 82)" stroke="' + INK + '" stroke-width="1.6"/>' +
        '<path d="M' + (centerX - 7) + ' ' + (centerY - 1) + 'h14" stroke="' + INK + '" stroke-width="1.4"/>' +
        '<rect x="' + (centerX - 1.4) + '" y="' + (centerY - 2.2) + '" width="2.8" height="3.4" fill="' + INK + '"/>';
      break;
    case 'secret':
      glyph = '<circle cx="' + centerX + '" cy="' + centerY + '" r="8" fill="' + GHALO + '" stroke="' + GOLD + '" stroke-width="1.6" stroke-dasharray="3 2.4"/>' +
        '<text x="' + centerX + '" y="' + (centerY + 4.2) + '" class="mk-letter mk-gold">S</text>';
      break;
    case 'other':
      glyph = halo(centerX, centerY, 9) +
        '<rect x="' + (centerX - 7.5) + '" y="' + (centerY - 7.5) + '" width="15" height="15" fill="oklch(0.9 0.03 84)" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>';
      break;
  }
  if (marker.ref) glyph += refBadge(centerX + (marker.type === 'boss' ? 14 : 12), centerY - (marker.type === 'boss' ? 13 : 11), marker.ref);
  return '<g class="mk">' + glyph + '</g>';
}

/** The demo marker each preview icon shows, per type (entrance & exit
    triangles both point up). One exported map (M6) — used by `iconSVG` and
    the toolbar's static legend icons. */
export const MARKER_PREVIEW_SPECS: Record<MarkerType, { type: MarkerType; dir?: Direction }> = {
  entrance: { type: 'entrance', dir: 'up' }, exit: { type: 'exit', dir: 'down' },
  trap: { type: 'trap' }, monster: { type: 'monster' }, boss: { type: 'boss' },
  treasure: { type: 'treasure' }, secret: { type: 'secret' }, other: { type: 'other' },
};

/** A standalone 30×30 icon used by the legend and drag ghost. */
export function iconSVG(type: MarkerType): string {
  return '<svg viewBox="0 0 30 30" width="32" height="32" xmlns="http://www.w3.org/2000/svg">' + symbol(MARKER_PREVIEW_SPECS[type], 15, 15) + '</svg>';
}
