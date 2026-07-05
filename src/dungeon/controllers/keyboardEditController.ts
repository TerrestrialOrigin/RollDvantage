/* ============================================================
   Keyboard edit controller — makes the DM map operable without a pointer.

   A sibling adapter to the drag/structure controllers: the map wrapper becomes
   a single focusable tab stop with an arrow-key cell cursor, and Enter/Space
   acts at the cursor — placing the legend-selected marker, anchoring/committing
   room, corridor, and delete edits (with the same shared previews as pointer
   drags), or opening the annotation dialog. Every mutation goes through the
   same DungeonEditor verbs and validity rules as the pointer paths.
   ============================================================ */
import type { Dungeon, MarkerType } from '../model/types';
import { corridorCells } from '../geometry/grid';
import { placeable, roomIndexAt, isCorridorCell, isBaseFloor } from '../geometry/topology';
import { markerAtCell } from '../editing/featureQueries';
import { dmSvg, clearPreview } from './mapSurface';
import { drawRoomPreview, drawCorridorPreview, drawDeletePreview } from './previews';
import { clearMarkerSelection, type StructureModeHandles } from './structureModeController';
import type { ControllerContext, EditMode } from './types';

export interface KeyboardEditDeps extends ControllerContext {
  openNoteAtCell: (cellX: number, cellY: number) => void;
  structureModes: StructureModeHandles;
}

interface CellPosition { x: number; y: number; }

/** The rectangle/corridor anchor remembers which mode set it, so a mode switch
    (mouse click on a mode button) invalidates it instead of committing across modes. */
interface PendingAnchor extends CellPosition { mode: Exclude<EditMode, null>; }

const SVG_NS = 'http://www.w3.org/2000/svg';

export function attachKeyboardEditController(deps: KeyboardEditDeps): void {
  const { editor, getDungeon, modes, openNoteAtCell, structureModes } = deps;
  const dmWrap = document.getElementById('dm-map');
  if (!dmWrap) return;

  dmWrap.tabIndex = 0;
  dmWrap.setAttribute('role', 'application');
  dmWrap.setAttribute('aria-label',
    'Dungeon map editor. Use the arrow keys to move the cell cursor, Enter or Space to act at the cursor, Escape to cancel.');

  let cursor: CellPosition | null = null;
  let anchor: PendingAnchor | null = null;

  function clampToGrid(dungeon: Dungeon, position: CellPosition): CellPosition {
    return {
      x: Math.max(0, Math.min(dungeon.grid.width - 1, position.x)),
      y: Math.max(0, Math.min(dungeon.grid.height - 1, position.y)),
    };
  }

  // ---- cursor painting (the renderer rebuilds the SVG wholesale on every edit,
  //      so the cursor group is repainted from a store subscription) ----
  function paintCursor(): void {
    const svg = dmSvg();
    if (!svg) return;
    const existing = svg.querySelector('#kbd-cursor');
    if (existing) existing.remove();
    const dungeon = getDungeon();
    if (!cursor || !dungeon) return;
    cursor = clampToGrid(dungeon, cursor);
    const cell = dungeon.grid.cell;
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('id', 'kbd-cursor');
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'kbd-cursor');
    rect.setAttribute('x', String(cursor.x * cell));
    rect.setAttribute('y', String(cursor.y * cell));
    rect.setAttribute('width', String(cell));
    rect.setAttribute('height', String(cell));
    group.appendChild(rect);
    svg.appendChild(group);
  }

  function hideCursor(): void {
    cursor = null;
    const svg = dmSvg();
    const group = svg ? svg.querySelector('#kbd-cursor') : null;
    if (group) group.remove();
  }

  editor.subscribe(() => { if (cursor) paintCursor(); });

  // ---- live-region status (shares #mode-hint with the structure controller) ----
  function describeCell(dungeon: Dungeon, position: CellPosition): string {
    const markerIndex = markerAtCell(dungeon, position.x, position.y);
    const marker = markerIndex >= 0 ? dungeon.markers[markerIndex] : undefined;
    if (marker) return marker.type + ' marker';
    if (roomIndexAt(dungeon, position.x, position.y) >= 0) return 'room';
    if (isCorridorCell(dungeon, position.x, position.y)) return 'corridor';
    if (isBaseFloor(dungeon, position.x, position.y)) return 'floor';
    if (dungeon.secretFloor?.[position.y]?.[position.x] === 1) return 'secret floor';
    return 'empty';
  }

  function actionHint(): string {
    if (anchor) return 'Enter to commit, Escape to cancel.';
    if (modes.current === 'room') return 'Enter to anchor the room rectangle.';
    if (modes.current === 'corridor') return 'Enter to start the corridor.';
    if (modes.current === 'delete') return 'Enter to anchor the delete rectangle.';
    if (modes.selectedMarkerType) return 'Enter to place ' + modes.selectedMarkerType + '.';
    return 'Enter to annotate.';
  }

  function announceCursor(): void {
    const element = document.getElementById('mode-hint');
    const dungeon = getDungeon();
    if (!element || !cursor || !dungeon) return;
    element.textContent = 'Row ' + (cursor.y + 1) + ', column ' + (cursor.x + 1) + ' — '
      + describeCell(dungeon, cursor) + '. ' + actionHint();
    element.hidden = false;
  }

  function restoreStandardHint(): void { structureModes.updateModeHint(); }

  // ---- pending-anchor lifecycle ----
  function dropAnchor(): void {
    anchor = null;
    clearPreview();
  }

  /** The anchor is only valid while the mode that created it is still active. */
  function validAnchor(): PendingAnchor | null {
    if (anchor && anchor.mode !== modes.current) dropAnchor();
    return anchor;
  }

  function previewFromAnchor(dungeon: Dungeon, active: PendingAnchor, target: CellPosition): void {
    const cell = dungeon.grid.cell;
    if (active.mode === 'room') drawRoomPreview(cell, active.x, active.y, target.x, target.y);
    else if (active.mode === 'delete') drawDeletePreview(cell, active.x, active.y, target.x, target.y);
    else drawCorridorPreview(cell, corridorCells(active.x, active.y, target.x, target.y));
  }

  // ---- Enter/Space dispatch ----
  function placeSelectedMarker(dungeon: Dungeon, type: MarkerType, position: CellPosition): void {
    if (!placeable(dungeon, position.x, position.y)) return;   // same denial rule as pointer drop
    if (type === 'secret') { editor.makeSecret(position.x, position.y); return; }
    editor.addMarker(type, position.x, position.y);
  }

  function actInStructureMode(dungeon: Dungeon, mode: Exclude<EditMode, null>, position: CellPosition): void {
    const active = validAnchor();
    if (!active) {
      if (mode === 'corridor' && !isBaseFloor(dungeon, position.x, position.y)) return;   // corridors start on existing floor
      anchor = { mode, x: position.x, y: position.y };
      previewFromAnchor(dungeon, anchor, position);
      return;
    }
    const start = active;
    dropAnchor();
    if (mode === 'room') editor.addRoom(start.x, start.y, position.x, position.y);
    else if (mode === 'delete') editor.deleteRegion(start.x, start.y, position.x, position.y);
    else editor.addCorridor(start.x, start.y, position.x, position.y);
  }

  function actAtCursor(dungeon: Dungeon, position: CellPosition): void {
    if (modes.current) { actInStructureMode(dungeon, modes.current, position); return; }
    if (modes.selectedMarkerType) { placeSelectedMarker(dungeon, modes.selectedMarkerType, position); return; }
    openNoteAtCell(position.x, position.y);
  }

  // ---- key handling (keydown on the focused wrapper only, so text fields
  //      elsewhere on the page are never hijacked) ----
  const ARROW_DELTAS: Record<string, CellPosition> = {
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
  };

  function ensureCursor(dungeon: Dungeon): CellPosition {
    cursor ??= clampToGrid(dungeon, { x: Math.floor(dungeon.grid.width / 2), y: Math.floor(dungeon.grid.height / 2) });
    return cursor;
  }

  function moveCursor(dungeon: Dungeon, delta: CellPosition): void {
    const position = ensureCursor(dungeon);
    cursor = clampToGrid(dungeon, { x: position.x + delta.x, y: position.y + delta.y });
    paintCursor();
    const active = validAnchor();
    if (active) previewFromAnchor(dungeon, active, cursor);
    announceCursor();
  }

  dmWrap.addEventListener('keydown', (event) => {
    if (event.target !== dmWrap) return;                       // only when the map surface itself is focused
    if (event.altKey || event.ctrlKey || event.metaKey) return; // leave shortcuts (undo/redo) alone
    const dungeon = getDungeon();
    if (!dungeon) return;
    const delta = ARROW_DELTAS[event.key];
    if (delta) { event.preventDefault(); moveCursor(dungeon, delta); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      actAtCursor(dungeon, ensureCursor(dungeon));
      paintCursor();
      announceCursor();
      return;
    }
    if (event.key === 'Escape' && validAnchor()) {
      // consume: cancel the pending anchor but stay in the mode (the structure
      // controller's window-level Esc exits the mode when nothing is pending)
      event.stopPropagation();
      dropAnchor();
      announceCursor();
    }
  });

  // Pointer clicks also focus the wrapper (tabindex), so the cursor is created
  // lazily by the first key press rather than on focus — a mouse user never
  // sees it. If a cursor already exists (rare refocus race), just repaint.
  dmWrap.addEventListener('focus', () => {
    if (cursor) { paintCursor(); announceCursor(); }
  });

  dmWrap.addEventListener('blur', () => {
    dropAnchor();
    hideCursor();
    restoreStandardHint();
  });

  // ---- legend buttons: keyboard tool selection (drag-to-place still works
  //      off pointerdown in the drag controller, untouched) ----
  function selectMarkerType(type: MarkerType, button: Element): void {
    const selecting = modes.selectedMarkerType !== type;
    if (modes.current) structureModes.setMode(null);           // tools are mutually exclusive
    clearMarkerSelection(modes);
    if (!selecting) return;
    modes.selectedMarkerType = type;
    button.setAttribute('aria-pressed', 'true');
  }

  document.querySelectorAll('.legend-item[data-marker-type]').forEach((button) => {
    button.addEventListener('click', () => {
      selectMarkerType(button.getAttribute('data-marker-type') as MarkerType, button);
    });
  });
}
