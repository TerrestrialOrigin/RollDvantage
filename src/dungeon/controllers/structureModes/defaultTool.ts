/* DEFAULT tool (no mode active): left-drag adds a corridor/room from the
   pressed square; right-drag erases a rectangle; a single right-click opens
   the context menu. Logic preserved verbatim from structureModeController's
   two default-tool machines (M12 extraction), with the drag-arm threshold
   named (M13) and coordinates given intent-revealing names (M8). */
import { corridorCells } from '../../geometry/grid';
import { isBaseFloor } from '../../geometry/topology';
import { markerAtCell } from '../../editing/featureQueries';
import { dmSvg, cellAtClient, clampedCellAtClient, clearPreview } from '../mapSurface';
import { drawRoomPreview, drawCorridorPreview, drawDeletePreview } from '../previews';
import { DRAG_ARM_THRESHOLD_PX } from '../constants';
import type { StructureModeModule, StructureModeModuleDeps } from './modeTypes';

export interface DefaultToolDeps extends StructureModeModuleDeps {
  openContextMenu: (gridX: number, gridY: number, clientX: number, clientY: number) => void;
}

interface AddDrag {
  kind: 'corridor' | 'room';
  startX: number; startY: number;
  currentX: number; currentY: number;
  armed: boolean;
  dragStartClientX: number; dragStartClientY: number;
}

type EraseDrag = Omit<AddDrag, 'kind'>;

function withinArmThreshold(event: PointerEvent, drag: { dragStartClientX: number; dragStartClientY: number }): boolean {
  const deltaX = event.clientX - drag.dragStartClientX, deltaY = event.clientY - drag.dragStartClientY;
  return deltaX * deltaX + deltaY * deltaY < DRAG_ARM_THRESHOLD_PX * DRAG_ARM_THRESHOLD_PX;
}

export function attachDefaultTool(deps: DefaultToolDeps): StructureModeModule {
  const { editor, getDungeon, modes, dmWrap, openContextMenu } = deps;

  // ----- left-drag adds a corridor/room -----
  let addDrag: AddDrag | null = null;
  function onAddMove(event: PointerEvent): void {
    if (!addDrag) return;
    if (!addDrag.armed) { if (withinArmThreshold(event, addDrag)) return; addDrag.armed = true; }
    const cell = clampedCellAtClient(getDungeon()!, event.clientX, event.clientY); if (!cell) return;
    addDrag.currentX = cell.x; addDrag.currentY = cell.y;
    if (addDrag.kind === 'corridor') drawCorridorPreview(getDungeon()!.grid.cell, corridorCells(addDrag.startX, addDrag.startY, cell.x, cell.y));
    else drawRoomPreview(getDungeon()!.grid.cell, addDrag.startX, addDrag.startY, cell.x, cell.y);
  }
  function onAddUp(): void {
    window.removeEventListener('pointermove', onAddMove); window.removeEventListener('pointerup', onAddUp);
    if (!addDrag) return;
    const finished = addDrag; addDrag = null; clearPreview();
    if (!finished.armed) return;   // a plain click adds nothing (reserved)
    if (finished.kind === 'corridor') editor.addCorridor(finished.startX, finished.startY, finished.currentX, finished.currentY);
    else editor.addRoom(finished.startX, finished.startY, finished.currentX, finished.currentY);
  }
  function onAddDown(event: PointerEvent): void {
    if (modes.current || event.button !== 0) return;
    const dungeon = getDungeon()!;
    const svg = dmSvg(); const inside = svg ? cellAtClient(dungeon, event.clientX, event.clientY) : null; if (!inside?.inside) return;
    if (markerAtCell(dungeon, inside.x, inside.y) >= 0) return;   // on a mark -> the move handler takes over
    addDrag = {
      kind: isBaseFloor(dungeon, inside.x, inside.y) ? 'corridor' : 'room',
      startX: inside.x, startY: inside.y, currentX: inside.x, currentY: inside.y,
      armed: false, dragStartClientX: event.clientX, dragStartClientY: event.clientY,
    };
    window.addEventListener('pointermove', onAddMove); window.addEventListener('pointerup', onAddUp);
  }
  dmWrap.addEventListener('pointerdown', onAddDown);

  // ----- right-drag erases a rectangle; single right-click opens the context menu -----
  let eraseDrag: EraseDrag | null = null;
  function onEraseMove(event: PointerEvent): void {
    if (!eraseDrag) return;
    if (!eraseDrag.armed) { if (withinArmThreshold(event, eraseDrag)) return; eraseDrag.armed = true; }
    const cell = clampedCellAtClient(getDungeon()!, event.clientX, event.clientY); if (!cell) return;
    eraseDrag.currentX = cell.x; eraseDrag.currentY = cell.y;
    drawDeletePreview(getDungeon()!.grid.cell, eraseDrag.startX, eraseDrag.startY, cell.x, cell.y);
  }
  function onEraseUp(): void {
    window.removeEventListener('pointermove', onEraseMove); window.removeEventListener('pointerup', onEraseUp);
    if (!eraseDrag) return;
    const finished = eraseDrag; eraseDrag = null; clearPreview();
    if (finished.armed) { editor.deleteRegion(finished.startX, finished.startY, finished.currentX, finished.currentY); }   // dragged -> erase rectangle + contents
    else { openContextMenu(finished.startX, finished.startY, finished.dragStartClientX, finished.dragStartClientY); }      // single right-click -> context menu
  }
  function onEraseDown(event: PointerEvent): void {
    if (modes.current || event.button !== 2) return;
    const cell = clampedCellAtClient(getDungeon()!, event.clientX, event.clientY); if (!cell) return;
    eraseDrag = {
      startX: cell.x, startY: cell.y, currentX: cell.x, currentY: cell.y,
      armed: false, dragStartClientX: event.clientX, dragStartClientY: event.clientY,
    };
    window.addEventListener('pointermove', onEraseMove); window.addEventListener('pointerup', onEraseUp);
  }
  dmWrap.addEventListener('pointerdown', onEraseDown);

  return {
    reset() { addDrag = null; eraseDrag = null; },
    detach() {
      dmWrap.removeEventListener('pointerdown', onAddDown);
      dmWrap.removeEventListener('pointerdown', onEraseDown);
      window.removeEventListener('pointermove', onAddMove);
      window.removeEventListener('pointerup', onAddUp);
      window.removeEventListener('pointermove', onEraseMove);
      window.removeEventListener('pointerup', onEraseUp);
    },
  };
}
