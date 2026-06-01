/* ============================================================
   Structure-mode controller — Room / Corridor / Delete modes, their live
   previews, and the default tool (left-drag adds, right-drag deletes, single
   right-click opens the context menu). Owns the shared `mode` flag and the Esc
   handling for modes. All mutations go through the DungeonEditor. Logic
   preserved verbatim from the original handlers.
   ============================================================ */
import { corridorCells } from '../geometry/grid';
import { isBaseFloor } from '../geometry/topology';
import { markerAtCell } from '../editing/featureQueries';
import { dmSvg, cellAtClient, clampedCellAtClient, fxGroup, clearPreview } from './mapSurface';
import type { ControllerContext, EditMode } from './types';

export interface StructureModeDeps extends ControllerContext {
  openContextMenu: (gx: number, gy: number, clientX: number, clientY: number) => void;
}

export function attachStructureModeController(deps: StructureModeDeps): void {
  const { editor, getDungeon, modes, openContextMenu } = deps;
  const dmWrap = document.getElementById('dm-map');

  // ---- previews ----
  function drawRoomPreview(x0: number, y0: number, x1: number, y1: number): void {
    const group = fxGroup(); if (!group) return; const cell = getDungeon()!.grid.cell;
    const ax = Math.min(x0, x1), ay = Math.min(y0, y1), bx = Math.max(x0, x1), by = Math.max(y0, y1);
    group.innerHTML = '<rect x="' + (ax * cell) + '" y="' + (ay * cell) + '" width="' + ((bx - ax + 1) * cell) + '" height="' + ((by - ay + 1) * cell) + '" fill="oklch(0.66 0.094 78 / .22)" stroke="oklch(0.52 0.084 70)" stroke-width="2" stroke-dasharray="6 4"/>';
  }
  function drawCorridorPreview(cells: [number, number][]): void {
    const group = fxGroup(); if (!group) return; const cell = getDungeon()!.grid.cell; let markup = '';
    cells.forEach((point) => { markup += '<rect x="' + (point[0] * cell) + '" y="' + (point[1] * cell) + '" width="' + cell + '" height="' + cell + '" fill="oklch(0.66 0.094 78 / .3)" stroke="oklch(0.52 0.084 70)" stroke-width="1"/>'; });
    group.innerHTML = markup;
  }
  function drawDeletePreview(x0: number, y0: number, x1: number, y1: number): void {
    const group = fxGroup(); if (!group) return; const cell = getDungeon()!.grid.cell;
    const ax = Math.min(x0, x1), ay = Math.min(y0, y1), bx = Math.max(x0, x1), by = Math.max(y0, y1);
    group.innerHTML = '<rect x="' + (ax * cell) + '" y="' + (ay * cell) + '" width="' + ((bx - ax + 1) * cell) + '" height="' + ((by - ay + 1) * cell) + '" fill="oklch(0.55 0.16 30 / .25)" stroke="oklch(0.5 0.15 32)" stroke-width="2" stroke-dasharray="6 4"/>';
  }

  // ---- mode switching + hint ----
  let corridorStart: { x: number; y: number } | null = null;
  function updateModeHint(): void {
    const element = document.getElementById('mode-hint'); if (!element) return;
    if (modes.current === 'room') { element.textContent = 'Add Room: drag a rectangle across the squares. Esc to finish.'; element.hidden = false; }
    else if (modes.current === 'corridor') { element.textContent = 'Add Corridor: click a square to start, click again to set the end. Esc to finish.'; element.hidden = false; }
    else if (modes.current === 'delete') { element.textContent = 'Delete: click a square, or drag a rectangle, to erase. Esc to finish.'; element.hidden = false; }
    else { element.hidden = true; }
  }
  function setMode(next: EditMode): void {
    modes.current = (modes.current === next) ? null : next;
    corridorStart = null; roomDraw = null; delDraw = null; clearPreview();
    const room = document.getElementById('btn-room'), corridor = document.getElementById('btn-corridor'), del = document.getElementById('btn-delete');
    if (room) room.classList.toggle('active', modes.current === 'room');
    if (corridor) corridor.classList.toggle('active', modes.current === 'corridor');
    if (del) del.classList.toggle('active', modes.current === 'delete');
    document.body.classList.toggle('mode-active', !!modes.current);
    updateModeHint();
  }

  const btnRoom = document.getElementById('btn-room'); if (btnRoom) btnRoom.addEventListener('click', () => setMode('room'));
  const btnCorridor = document.getElementById('btn-corridor'); if (btnCorridor) btnCorridor.addEventListener('click', () => setMode('corridor'));
  const btnDelete = document.getElementById('btn-delete'); if (btnDelete) btnDelete.addEventListener('click', () => setMode('delete'));
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (modes.current) setMode(null); } });

  if (!dmWrap) return;

  // suppress the browser's native right-click menu over the map; reset corridor in-progress
  dmWrap.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (modes.current === 'corridor') { corridorStart = null; clearPreview(); }
  });

  // ----- ROOM mode: rubber-band rectangle -----
  let roomDraw: { sx: number; sy: number; cx: number; cy: number } | null = null;
  function roomMove(event: PointerEvent): void {
    if (!roomDraw) return;
    const cell = clampedCellAtClient(getDungeon()!, event.clientX, event.clientY); if (!cell) return;
    roomDraw.cx = cell.x; roomDraw.cy = cell.y; drawRoomPreview(roomDraw.sx, roomDraw.sy, cell.x, cell.y);
  }
  function roomUp(): void {
    window.removeEventListener('pointermove', roomMove); window.removeEventListener('pointerup', roomUp);
    if (!roomDraw) return;
    const draw = roomDraw; roomDraw = null; clearPreview();
    editor.addRoom(draw.sx, draw.sy, draw.cx, draw.cy);
  }
  dmWrap.addEventListener('pointerdown', (event) => {
    const pointer = event;
    if (modes.current !== 'room' || pointer.button !== 0) return;
    const cell = clampedCellAtClient(getDungeon()!, pointer.clientX, pointer.clientY); if (!cell) return;
    pointer.preventDefault();
    roomDraw = { sx: cell.x, sy: cell.y, cx: cell.x, cy: cell.y };
    drawRoomPreview(cell.x, cell.y, cell.x, cell.y);
    window.addEventListener('pointermove', roomMove); window.addEventListener('pointerup', roomUp);
  });

  // ----- CORRIDOR mode: click start, click end -----
  dmWrap.addEventListener('click', (event) => {
    if (modes.current !== 'corridor') return;
    const dungeon = getDungeon()!;
    const cell = cellAtClient(dungeon, event.clientX, event.clientY);
    if (!corridorStart) {
      if (!cell || !cell.inside || !isBaseFloor(dungeon, cell.x, cell.y)) return;   // must begin on an existing square
      corridorStart = { x: cell.x, y: cell.y };
      drawCorridorPreview([[cell.x, cell.y]]);
    } else {
      const end = cell?.inside ? cell : clampedCellAtClient(dungeon, event.clientX, event.clientY); if (!end) return;
      editor.addCorridor(corridorStart.x, corridorStart.y, end.x, end.y);
      corridorStart = null; clearPreview();
    }
  });
  dmWrap.addEventListener('mousemove', (event) => {
    if (modes.current !== 'corridor' || !corridorStart) return;
    const cell = clampedCellAtClient(getDungeon()!, event.clientX, event.clientY); if (!cell) return;
    drawCorridorPreview(corridorCells(corridorStart.x, corridorStart.y, cell.x, cell.y));
  });

  // ----- DELETE mode: click a square or drag a rectangle -----
  let delDraw: { sx: number; sy: number; cx: number; cy: number } | null = null;
  function delMove(event: PointerEvent): void {
    if (!delDraw) return;
    const cell = clampedCellAtClient(getDungeon()!, event.clientX, event.clientY); if (!cell) return;
    delDraw.cx = cell.x; delDraw.cy = cell.y; drawDeletePreview(delDraw.sx, delDraw.sy, cell.x, cell.y);
  }
  function delUp(): void {
    window.removeEventListener('pointermove', delMove); window.removeEventListener('pointerup', delUp);
    if (!delDraw) return;
    const draw = delDraw; delDraw = null; clearPreview();
    editor.deleteRegion(draw.sx, draw.sy, draw.cx, draw.cy);
  }
  dmWrap.addEventListener('pointerdown', (event) => {
    const pointer = event;
    if (modes.current !== 'delete' || pointer.button !== 0) return;
    const cell = clampedCellAtClient(getDungeon()!, pointer.clientX, pointer.clientY); if (!cell) return;
    pointer.preventDefault();
    delDraw = { sx: cell.x, sy: cell.y, cx: cell.x, cy: cell.y };
    drawDeletePreview(cell.x, cell.y, cell.x, cell.y);
    window.addEventListener('pointermove', delMove); window.addEventListener('pointerup', delUp);
  });

  // ----- DEFAULT TOOL (no mode): left-drag adds a corridor/room -----
  let addDraw: { kind: 'corridor' | 'room'; sx: number; sy: number; cx: number; cy: number; armed: boolean; dsx: number; dsy: number } | null = null;
  function addMove(event: PointerEvent): void {
    if (!addDraw) return;
    if (!addDraw.armed) { const dx = event.clientX - addDraw.dsx, dy = event.clientY - addDraw.dsy; if (dx * dx + dy * dy < 16) return; addDraw.armed = true; }
    const cell = clampedCellAtClient(getDungeon()!, event.clientX, event.clientY); if (!cell) return;
    addDraw.cx = cell.x; addDraw.cy = cell.y;
    if (addDraw.kind === 'corridor') drawCorridorPreview(corridorCells(addDraw.sx, addDraw.sy, cell.x, cell.y));
    else drawRoomPreview(addDraw.sx, addDraw.sy, cell.x, cell.y);
  }
  function addUp(): void {
    window.removeEventListener('pointermove', addMove); window.removeEventListener('pointerup', addUp);
    if (!addDraw) return;
    const draw = addDraw; addDraw = null; clearPreview();
    if (!draw.armed) return;   // a plain click adds nothing (reserved)
    if (draw.kind === 'corridor') editor.addCorridor(draw.sx, draw.sy, draw.cx, draw.cy);
    else editor.addRoom(draw.sx, draw.sy, draw.cx, draw.cy);
  }
  dmWrap.addEventListener('pointerdown', (event) => {
    const pointer = event;
    if (modes.current || pointer.button !== 0) return;
    const dungeon = getDungeon()!;
    const svg = dmSvg(); const inside = svg ? cellAtClient(dungeon, pointer.clientX, pointer.clientY) : null; if (!inside?.inside) return;
    if (markerAtCell(dungeon, inside.x, inside.y) >= 0) return;   // on a mark -> the move handler takes over
    addDraw = { kind: isBaseFloor(dungeon, inside.x, inside.y) ? 'corridor' : 'room', sx: inside.x, sy: inside.y, cx: inside.x, cy: inside.y, armed: false, dsx: pointer.clientX, dsy: pointer.clientY };
    window.addEventListener('pointermove', addMove); window.addEventListener('pointerup', addUp);
  });

  // ----- right-drag erases a rectangle; single right-click opens the context menu -----
  let rdelDraw: { sx: number; sy: number; cx: number; cy: number; armed: boolean; dsx: number; dsy: number } | null = null;
  function rdelMove(event: PointerEvent): void {
    if (!rdelDraw) return;
    if (!rdelDraw.armed) { const dx = event.clientX - rdelDraw.dsx, dy = event.clientY - rdelDraw.dsy; if (dx * dx + dy * dy < 16) return; rdelDraw.armed = true; }
    const cell = clampedCellAtClient(getDungeon()!, event.clientX, event.clientY); if (!cell) return;
    rdelDraw.cx = cell.x; rdelDraw.cy = cell.y; drawDeletePreview(rdelDraw.sx, rdelDraw.sy, cell.x, cell.y);
  }
  function rdelUp(): void {
    window.removeEventListener('pointermove', rdelMove); window.removeEventListener('pointerup', rdelUp);
    if (!rdelDraw) return;
    const draw = rdelDraw; rdelDraw = null; clearPreview();
    if (draw.armed) { editor.deleteRegion(draw.sx, draw.sy, draw.cx, draw.cy); }   // dragged -> erase rectangle + contents
    else { openContextMenu(draw.sx, draw.sy, draw.dsx, draw.dsy); }                 // single right-click -> context menu
  }
  dmWrap.addEventListener('pointerdown', (event) => {
    const pointer = event;
    if (modes.current || pointer.button !== 2) return;
    const cell = clampedCellAtClient(getDungeon()!, pointer.clientX, pointer.clientY); if (!cell) return;
    rdelDraw = { sx: cell.x, sy: cell.y, cx: cell.x, cy: cell.y, armed: false, dsx: pointer.clientX, dsy: pointer.clientY };
    window.addEventListener('pointermove', rdelMove); window.addEventListener('pointerup', rdelUp);
  });
}
