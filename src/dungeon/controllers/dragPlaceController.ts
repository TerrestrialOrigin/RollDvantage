/* ============================================================
   Drag-to-place controller — drag a legend icon onto a DM-map cell to place a
   marker, or drag an existing marker to move it. Gesture interpretation (4px
   arm threshold, ghost/highlight) lives here; every mutation goes through the
   DungeonEditor. A future touch controller is a sibling adapter calling the
   same verbs. Logic preserved verbatim from the original drag handlers.
   ============================================================ */
import type { MarkerType } from '../model/types';
import { iconSVG } from '../rendering/symbols';
import { placeable, roomIndexAt, isCorridorCell } from '../geometry/topology';
import { markerAtCell } from '../editing/featureQueries';
import { dmSvg, cellAtClient } from './mapSurface';
import { DRAG_ARM_THRESHOLD_PX } from './constants';
import { createListenerBag } from './listenerBag';
import type { ControllerContext } from './types';
import type { CellHit } from '../geometry/grid';

interface DragState {
  mode: 'place' | 'move';
  type: MarkerType;
  index: number;
  ghost: HTMLElement;
  highlight: HTMLElement;
  target: CellHit | null;
  armed: boolean;
  startX: number;
  startY: number;
}

export interface DragPlaceHandles {
  /** Abort any in-flight drag and remove every listener this controller registered. */
  detach: () => void;
}

export function attachDragPlaceController(context: ControllerContext): DragPlaceHandles {
  const { editor, getDungeon, modes } = context;
  const dmWrap = document.getElementById('dm-map');
  const bag = createListenerBag();
  let drag: DragState | null = null;

  function showTarget(cell: CellHit): void {
    const dungeon = getDungeon()!;
    const pixel = dungeon.grid.cellSize * cell.scale, highlight = drag!.highlight;
    highlight.style.display = 'block';
    highlight.style.left = (cell.rect.left + cell.gridX * dungeon.grid.cellSize * cell.scale) + 'px';
    highlight.style.top = (cell.rect.top + cell.gridY * dungeon.grid.cellSize * cell.scale) + 'px';
    highlight.style.width = pixel + 'px'; highlight.style.height = pixel + 'px';
  }

  function arm(): void {
    drag!.armed = true;
    document.body.appendChild(drag!.ghost);
    document.body.appendChild(drag!.highlight);
    document.body.style.cursor = 'grabbing';
  }

  function onMove(event: PointerEvent): void {
    if (!drag) return;
    if (!drag.armed) {
      const deltaX = event.clientX - drag.startX, deltaY = event.clientY - drag.startY;
      if (deltaX * deltaX + deltaY * deltaY < DRAG_ARM_THRESHOLD_PX * DRAG_ARM_THRESHOLD_PX) return;   // jitter under the arm threshold: a plain click isn't a move
      arm();
    }
    drag.ghost.style.left = event.clientX + 'px'; drag.ghost.style.top = event.clientY + 'px';
    const dungeon = getDungeon();
    const cell = dungeon ? cellAtClient(dungeon, event.clientX, event.clientY) : null;
    if (cell && cell.inside && dungeon && placeable(dungeon, cell.gridX, cell.gridY)) { showTarget(cell); drag.target = cell; }
    else { drag.highlight.style.display = 'none'; drag.target = null; }
  }

  function onUp(): void {
    if (!drag) return;
    const finished = drag; cleanup();
    if (finished.mode === 'move' && !finished.armed) return; // a simple click on a mark = no-op
    const cell = finished.target;
    const dungeon = getDungeon();
    if (!cell || !dungeon) return;
    if (finished.mode === 'place') {
      if (finished.type === 'secret') { editor.makeSecret(cell.gridX, cell.gridY); return; } // (S) converts a corridor/room to secret
      editor.addMarker(finished.type, cell.gridX, cell.gridY);
    } else {
      const marker = dungeon.markers[finished.index];
      if (marker) {
        if (marker.type === 'secret') {
          // the (S) badge IS the secret status — dragging it MOVES the secret.
          const originX = marker.gridX, originY = marker.gridY;
          const alreadySecret = dungeon.secretFloor?.[cell.gridY]?.[cell.gridX] === 1;
          const canConvert = !alreadySecret && (roomIndexAt(dungeon, cell.gridX, cell.gridY) >= 0 || isCorridorCell(dungeon, cell.gridX, cell.gridY));
          if (canConvert) {
            editor.unmakeSecret(originX, originY); // restore the old room/passage
            editor.makeSecret(cell.gridX, cell.gridY);     // make the dropped-on room/corridor secret
          }
          return; // a bad drop leaves the secret untouched
        }
        editor.moveMarker(finished.index, cell.gridX, cell.gridY);
      }
    }
  }

  function cleanup(): void {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.body.style.cursor = '';
    if (drag) { if (drag.ghost) drag.ghost.remove(); if (drag.highlight) drag.highlight.remove(); }
    drag = null;
  }

  function startDrag(options: { mode: 'place' | 'move'; type: MarkerType; index?: number }, event: PointerEvent): void {
    if (drag) cleanup();
    const ghost = document.createElement('div'); ghost.className = 'drag-ghost'; ghost.innerHTML = iconSVG(options.type);
    const highlight = document.createElement('div'); highlight.className = 'drag-cell'; highlight.style.display = 'none';
    drag = { mode: options.mode, type: options.type, index: options.index ?? -1, ghost, highlight, target: null, armed: false, startX: event.clientX, startY: event.clientY };
    if (options.mode === 'place') { arm(); onMove(event); }   // legend drag: grab immediately
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // legend icons -> place a new mark
  document.querySelectorAll('.legend-item').forEach((item) => {
    const icon = item.querySelector('[data-icon]'); if (!icon) return;
    bag.listen<PointerEvent>(item, 'pointerdown', (event) => {
      event.preventDefault();
      startDrag({ mode: 'place', type: icon.getAttribute('data-icon') as MarkerType }, event);
    });
  });

  // marks already on the map -> drag to move
  if (dmWrap) {
    bag.listen<PointerEvent>(dmWrap, 'pointerdown', (pointerEvent) => {
      if (modes.current) return;                 // structure-editing mode takes over
      if (pointerEvent.button !== 0) return;      // left button only
      const dungeon = getDungeon();
      const svg = dmSvg(); if (!svg || !dungeon) return;
      const cell = cellAtClient(dungeon, pointerEvent.clientX, pointerEvent.clientY); if (!cell?.inside) return;
      const index = markerAtCell(dungeon, cell.gridX, cell.gridY);
      const marker = dungeon.markers[index];
      if (index < 0 || !marker) return;           // empty square — leave it alone
      startDrag({ mode: 'move', type: marker.type, index }, pointerEvent);
    });
  }

  return {
    detach() {
      cleanup();      // aborts any in-flight drag (also removes the transient window listeners)
      bag.detach();
    },
  };
}
