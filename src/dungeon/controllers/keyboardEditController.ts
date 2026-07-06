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
// roomIndexAt / isCorridorCell also gate the secret-badge move (see dropHeldMarker).
import { markerAtCell } from '../editing/featureQueries';
import { dmSvg, clearPreview } from './mapSurface';
import { drawRoomPreview, drawCorridorPreview, drawDeletePreview } from './previews';
import { clearMarkerSelection, type StructureModeHandles } from './structureModeController';
import type { ControllerContext, EditMode } from './types';

export interface KeyboardEditDeps extends ControllerContext {
  openNoteAtCell: (cellX: number, cellY: number) => void;
  structureModes: StructureModeHandles;
  /** Opens the shared cell context menu (same handle the pointer path uses), so a
      keyboard user can reach the pointer-only Delete-one-marker and Make-Not-Secret
      actions at the cursor. No new menu code — this is the existing accessible menu. */
  openContextMenu: (gridX: number, gridY: number, clientX: number, clientY: number) => void;
}

interface CellPosition { gridX: number; gridY: number; }

/** The rectangle/corridor anchor remembers which mode set it, so a mode switch
    (mouse click on a mode button) invalidates it instead of committing across modes. */
interface PendingAnchor extends CellPosition { mode: Exclude<EditMode, null>; }

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The retype cycle order, matching the context menu's marker-type list
    (the non-placed `secret` type is intentionally excluded). */
const RETYPE_ORDER: MarkerType[] = ['monster', 'boss', 'treasure', 'trap', 'entrance', 'exit', 'other'];

export function attachKeyboardEditController(deps: KeyboardEditDeps): void {
  const { editor, getDungeon, modes, openNoteAtCell, structureModes, openContextMenu } = deps;
  const dmWrap = document.getElementById('dm-map');
  if (!dmWrap) return;

  dmWrap.tabIndex = 0;
  dmWrap.setAttribute('role', 'application');
  dmWrap.setAttribute('aria-label',
    'Dungeon map editor. Use the arrow keys to move the cell cursor, Enter or Space to act at the cursor. '
    + 'On a marker, press M to pick it up and move it, or T to change its type. '
    + 'Press the Menu key or Shift+F10 for actions at the cursor. Escape to cancel.');

  let cursor: CellPosition | null = null;
  let anchor: PendingAnchor | null = null;
  /** Set while opening the context menu: focusing a menu item transiently blurs the
      map, and that blur must NOT tear down the cursor (the menu closes back to the
      map with the cursor intact). Distinguishes this from a real tab-away blur. */
  let openingMenu = false;
  /** The index of a marker "picked up" for a keyboard move, or null. Like `anchor`,
      it is a transient gesture state cleared on commit, cancel, or blur. */
  let heldMarker: number | null = null;

  function clampToGrid(dungeon: Dungeon, position: CellPosition): CellPosition {
    return {
      gridX: Math.max(0, Math.min(dungeon.grid.width - 1, position.gridX)),
      gridY: Math.max(0, Math.min(dungeon.grid.height - 1, position.gridY)),
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
    const cellSize = dungeon.grid.cellSize;
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('id', 'kbd-cursor');
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', heldMarker !== null ? 'kbd-cursor holding' : 'kbd-cursor');
    rect.setAttribute('x', String(cursor.gridX * cellSize));
    rect.setAttribute('y', String(cursor.gridY * cellSize));
    rect.setAttribute('width', String(cellSize));
    rect.setAttribute('height', String(cellSize));
    group.appendChild(rect);
    svg.appendChild(group);
  }

  function hideCursor(): void {
    cursor = null;
    const svg = dmSvg();
    const group = svg ? svg.querySelector('#kbd-cursor') : null;
    if (group) group.remove();
  }

  /** The client (viewport) pixel centre of a grid cell — the inverse of the
      client→cell math in grid.ts (cellFromClient), so the keyboard-opened context
      menu anchors exactly where a pointer click on that cell would have. Null only
      when the map SVG is not yet rendered. */
  function clientPointForCell(dungeon: Dungeon, position: CellPosition): { clientX: number; clientY: number } | null {
    const svg = dmSvg();
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const contentWidth = dungeon.grid.width * dungeon.grid.cellSize;
    const contentHeight = dungeon.grid.height * dungeon.grid.cellSize;
    const scaleX = contentWidth ? rect.width / contentWidth : 0;
    const scaleY = contentHeight ? rect.height / contentHeight : 0;
    return {
      clientX: rect.left + (position.gridX + 0.5) * dungeon.grid.cellSize * scaleX,
      clientY: rect.top + (position.gridY + 0.5) * dungeon.grid.cellSize * scaleY,
    };
  }

  editor.subscribe(() => {
    // A held marker is a raw index into the live dungeon; any store change we did
    // not initiate here — above all an undo/redo, which restores a FRESH snapshot
    // in place of the current dungeon — leaves the index pointing at the wrong or
    // absent marker. Release the hold so a later Enter cannot act on a stale index.
    // Safe against a legitimate drop: dropHeldMarker nulls heldMarker BEFORE it
    // mutates, so this guard only ever finds a hold on an externally-driven change.
    const releasedHold = heldMarker !== null;
    if (releasedHold) cancelHeld();
    if (cursor) paintCursor();                       // repaint drops the "holding" outline
    if (releasedHold && cursor) announceCursor();    // reflect the released hold in the live region
  });

  // ---- live-region status (shares #mode-hint with the structure controller) ----
  function describeCell(dungeon: Dungeon, position: CellPosition): string {
    const markerIndex = markerAtCell(dungeon, position.gridX, position.gridY);
    const marker = markerIndex >= 0 ? dungeon.markers[markerIndex] : undefined;
    if (marker) return marker.type + ' marker';
    if (roomIndexAt(dungeon, position.gridX, position.gridY) >= 0) return 'room';
    if (isCorridorCell(dungeon, position.gridX, position.gridY)) return 'corridor';
    if (isBaseFloor(dungeon, position.gridX, position.gridY)) return 'floor';
    if (dungeon.secretFloor?.[position.gridY]?.[position.gridX] === 1) return 'secret floor';
    return 'empty';
  }

  function actionHint(): string {
    if (heldMarker !== null) return 'Arrow keys to move, Enter to drop, Escape to cancel.';
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
    const cellDescription = describeCell(dungeon, cursor);
    let text = 'Row ' + (cursor.gridY + 1) + ', column ' + (cursor.gridX + 1) + ' — '
      + cellDescription + '. ' + actionHint();
    // With no tool/mode active and a marker under the cursor, surface the move/retype gestures.
    if (heldMarker === null && !modes.current && !modes.selectedMarkerType) {
      const markerIndex = markerAtCell(dungeon, cursor.gridX, cursor.gridY);
      const marker = markerIndex >= 0 ? dungeon.markers[markerIndex] : undefined;
      // the (S) badge can be moved (it relocates the secret) but never retyped.
      if (marker?.type === 'secret') text += ' M to move the secret.';
      else if (marker) text += ' M to move, T to change type.';
      // Any actionable feature (not empty space) has a context menu at the cursor,
      // mirroring where a pointer right-click would open one.
      if (cellDescription !== 'empty') text += ' Menu key or Shift+F10 for actions.';
    }
    element.textContent = text;
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
    const cellSize = dungeon.grid.cellSize;
    if (active.mode === 'room') drawRoomPreview(cellSize, active.gridX, active.gridY, target.gridX, target.gridY);
    else if (active.mode === 'delete') drawDeletePreview(cellSize, active.gridX, active.gridY, target.gridX, target.gridY);
    else drawCorridorPreview(cellSize, corridorCells(active.gridX, active.gridY, target.gridX, target.gridY));
  }

  // ---- Enter/Space dispatch ----
  function placeSelectedMarker(dungeon: Dungeon, type: MarkerType, position: CellPosition): void {
    if (!placeable(dungeon, position.gridX, position.gridY)) return;   // same denial rule as pointer drop
    if (type === 'secret') { editor.makeSecret(position.gridX, position.gridY); return; }
    editor.addMarker(type, position.gridX, position.gridY);
  }

  // ---- keyboard marker move (pick up / drop) — mirrors the pointer drag-to-move ----
  function grabMarker(dungeon: Dungeon, position: CellPosition): void {
    if (modes.current || heldMarker !== null) return;          // structure mode owns the surface; no nested grab
    const index = markerAtCell(dungeon, position.gridX, position.gridY);
    if (index < 0) return;                                     // nothing under the cursor to pick up
    heldMarker = index;
  }

  function dropHeldMarker(dungeon: Dungeon, position: CellPosition): void {
    if (heldMarker === null) return;
    if (!placeable(dungeon, position.gridX, position.gridY)) return;   // denied drop: stay held for another attempt
    const index = heldMarker;
    const marker = dungeon.markers[index];
    if (marker?.type === 'secret') {
      // the (S) badge IS the secret status — a keyboard drop MOVES the secret, never
      // the raw badge (mirrors the pointer path in dragPlaceController.onUp). Dropping
      // always ends the hold; an ineligible destination leaves the secret untouched.
      heldMarker = null;
      const alreadySecret = dungeon.secretFloor?.[position.gridY]?.[position.gridX] === 1;
      const canConvert = !alreadySecret
        && (roomIndexAt(dungeon, position.gridX, position.gridY) >= 0 || isCorridorCell(dungeon, position.gridX, position.gridY));
      if (canConvert) {
        editor.unmakeSecret(marker.gridX, marker.gridY);   // restore the origin room/passage
        editor.makeSecret(position.gridX, position.gridY); // make the dropped-on room/corridor secret
      }
      return;
    }
    heldMarker = null;
    editor.moveMarker(index, position.gridX, position.gridY);          // preserves note/label; re-derives entrance/exit dir
  }

  function cancelHeld(): void { heldMarker = null; }

  // ---- keyboard marker retype — cycle the type via the same verb the context menu uses ----
  function retypeAtCursor(dungeon: Dungeon, position: CellPosition, direction: 1 | -1): void {
    if (modes.current || heldMarker !== null) return;          // not while a mode is active or a marker is held
    const index = markerAtCell(dungeon, position.gridX, position.gridY);
    const marker = index >= 0 ? dungeon.markers[index] : undefined;
    if (!marker) return;
    if (marker.type === 'secret') return;   // the (S) badge is a status indicator, never a cyclable type (matches featureAt)
    const current = RETYPE_ORDER.indexOf(marker.type);
    const base = current < 0 ? 0 : current;
    const next = RETYPE_ORDER[(base + direction + RETYPE_ORDER.length) % RETYPE_ORDER.length]!;
    editor.retypeMarker(index, next);
  }

  // ---- keyboard context menu (ContextMenu / Shift+F10) — opens the same accessible
  //      cell menu the pointer opens on right-click, at the cursor cell ----
  function openCellMenuAtCursor(dungeon: Dungeon, position: CellPosition): void {
    // A pending gesture would sit stranded behind the menu (and a stale held index
    // must never survive to act later — the N1 bug class); cancel it first, matching
    // Escape's semantics. This is a pure UI-state reset, not an editor mutation.
    if (heldMarker !== null) cancelHeld();
    if (anchor) dropAnchor();
    paintCursor();                                              // drop any "holding" outline
    const point = clientPointForCell(dungeon, position);
    if (!point) return;
    // openContextMenu is itself a no-op on a cell with no feature (empty/void space),
    // exactly like a pointer right-click there. The menu focuses its first item, which
    // blurs the map — guard that blur so the cursor survives the round-trip.
    openingMenu = true;
    openContextMenu(position.gridX, position.gridY, point.clientX, point.clientY);
    openingMenu = false;
  }

  function actInStructureMode(dungeon: Dungeon, mode: Exclude<EditMode, null>, position: CellPosition): void {
    const active = validAnchor();
    if (!active) {
      if (mode === 'corridor' && !isBaseFloor(dungeon, position.gridX, position.gridY)) return;   // corridors start on existing floor
      anchor = { mode, gridX: position.gridX, gridY: position.gridY };
      previewFromAnchor(dungeon, anchor, position);
      return;
    }
    const start = active;
    dropAnchor();
    if (mode === 'room') editor.addRoom(start.gridX, start.gridY, position.gridX, position.gridY);
    else if (mode === 'delete') editor.deleteRegion(start.gridX, start.gridY, position.gridX, position.gridY);
    else editor.addCorridor(start.gridX, start.gridY, position.gridX, position.gridY);
  }

  function actAtCursor(dungeon: Dungeon, position: CellPosition): void {
    if (modes.current) { actInStructureMode(dungeon, modes.current, position); return; }
    if (modes.selectedMarkerType) { placeSelectedMarker(dungeon, modes.selectedMarkerType, position); return; }
    openNoteAtCell(position.gridX, position.gridY);
  }

  // ---- key handling (keydown on the focused wrapper only, so text fields
  //      elsewhere on the page are never hijacked) ----
  const ARROW_DELTAS: Record<string, CellPosition> = {
    ArrowLeft: { gridX: -1, gridY: 0 }, ArrowRight: { gridX: 1, gridY: 0 }, ArrowUp: { gridX: 0, gridY: -1 }, ArrowDown: { gridX: 0, gridY: 1 },
  };

  function ensureCursor(dungeon: Dungeon): CellPosition {
    cursor ??= clampToGrid(dungeon, { gridX: Math.floor(dungeon.grid.width / 2), gridY: Math.floor(dungeon.grid.height / 2) });
    return cursor;
  }

  function moveCursor(dungeon: Dungeon, delta: CellPosition): void {
    const position = ensureCursor(dungeon);
    cursor = clampToGrid(dungeon, { gridX: position.gridX + delta.gridX, gridY: position.gridY + delta.gridY });
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
      const position = ensureCursor(dungeon);
      if (heldMarker !== null) dropHeldMarker(dungeon, position);   // a held marker drops here (takes priority)
      else actAtCursor(dungeon, position);
      paintCursor();
      announceCursor();
      return;
    }
    const lowerKey = event.key.toLowerCase();
    if (lowerKey === 'm') {                                          // pick up the marker under the cursor
      event.preventDefault();
      grabMarker(dungeon, ensureCursor(dungeon));
      paintCursor();
      announceCursor();
      return;
    }
    if (lowerKey === 't') {                                          // cycle the marker's type (Shift = backward)
      event.preventDefault();
      retypeAtCursor(dungeon, ensureCursor(dungeon), event.shiftKey ? -1 : 1);
      paintCursor();
      announceCursor();
      return;
    }
    // Standard "open context menu from the keyboard" bindings (WAI-ARIA APG):
    // the dedicated Menu key and Shift+F10 (the fallback for keyboards without one).
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      openCellMenuAtCursor(dungeon, ensureCursor(dungeon));
      return;
    }
    if (event.key === 'Escape') {
      // consume: cancel the pending grab/anchor but stay in the mode (the structure
      // controller's window-level Esc exits the mode when nothing is pending)
      if (heldMarker !== null) { event.stopPropagation(); cancelHeld(); paintCursor(); announceCursor(); return; }
      if (validAnchor()) { event.stopPropagation(); dropAnchor(); announceCursor(); }
    }
  });

  // Pointer clicks also focus the wrapper (tabindex), so the cursor is created
  // lazily by the first key press rather than on focus — a mouse user never
  // sees it. If a cursor already exists (rare refocus race), just repaint.
  dmWrap.addEventListener('focus', () => {
    if (cursor) { paintCursor(); announceCursor(); }
  });

  dmWrap.addEventListener('blur', () => {
    if (openingMenu) return;                                    // transient focus move into the cell menu; keep the cursor
    cancelHeld();
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
