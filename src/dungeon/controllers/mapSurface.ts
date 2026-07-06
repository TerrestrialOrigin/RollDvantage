/* ============================================================
   Map surface helpers — bridge between client (pointer) coordinates and the
   DM-map SVG. Used by the input controllers. Keeps the DOM-lookup + rect math
   in one place so the controllers stay focused on gestures.
   ============================================================ */
import type { Dungeon } from '../model/types';
import { cellFromClient, cellClamped, type CellHit } from '../geometry/grid';

/** The live DM-map <svg> element, or null before first render. */
export function dmSvg(): SVGSVGElement | null {
  const wrap = document.getElementById('dm-map');
  return wrap ? wrap.querySelector('svg') : null;
}

/** Cell under a client point (null if outside the grid), using the live SVG rect. */
export function cellAtClient(dungeon: Dungeon, clientX: number, clientY: number): CellHit | null {
  const svg = dmSvg();
  if (!svg) return null;
  return cellFromClient(dungeon.grid, svg.getBoundingClientRect(), clientX, clientY);
}

/** Cell under a client point, clamped to the grid bounds. */
export function clampedCellAtClient(dungeon: Dungeon, clientX: number, clientY: number): { gridX: number; gridY: number } | null {
  const svg = dmSvg();
  if (!svg) return null;
  return cellClamped(dungeon.grid, svg.getBoundingClientRect(), clientX, clientY);
}

/** The SVG overlay group used for live edit previews (created on demand). */
export function fxGroup(): Element | null {
  const svg = dmSvg();
  if (!svg) return null;
  let group = svg.querySelector('#mapfx');
  if (!group) {
    group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', 'mapfx');
    svg.appendChild(group);
  }
  return group;
}

export function clearPreview(): void {
  const svg = dmSvg();
  if (svg) { const group = svg.querySelector('#mapfx'); if (group) group.remove(); }
}
