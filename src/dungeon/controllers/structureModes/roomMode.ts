/* ROOM mode: rubber-band a rectangle, commit on release. Logic preserved
   verbatim from structureModeController's room machine (M12 extraction). */
import { clampedCellAtClient, clearPreview } from '../mapSurface';
import { drawRoomPreview } from '../previews';
import type { StructureModeModule, StructureModeModuleDeps } from './modeTypes';

interface RectDrag { startX: number; startY: number; currentX: number; currentY: number; }

export function attachRoomMode(deps: StructureModeModuleDeps): StructureModeModule {
  const { editor, getDungeon, modes, dmWrap } = deps;
  let drag: RectDrag | null = null;

  function onPointerMove(event: PointerEvent): void {
    if (!drag) return;
    const cell = clampedCellAtClient(getDungeon()!, event.clientX, event.clientY); if (!cell) return;
    drag.currentX = cell.x; drag.currentY = cell.y;
    drawRoomPreview(getDungeon()!.grid.cell, drag.startX, drag.startY, cell.x, cell.y);
  }
  function onPointerUp(): void {
    window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp);
    if (!drag) return;
    const finished = drag; drag = null; clearPreview();
    editor.addRoom(finished.startX, finished.startY, finished.currentX, finished.currentY);
  }
  function onPointerDown(event: PointerEvent): void {
    if (modes.current !== 'room' || event.button !== 0) return;
    const cell = clampedCellAtClient(getDungeon()!, event.clientX, event.clientY); if (!cell) return;
    event.preventDefault();
    drag = { startX: cell.x, startY: cell.y, currentX: cell.x, currentY: cell.y };
    drawRoomPreview(getDungeon()!.grid.cell, cell.x, cell.y, cell.x, cell.y);
    window.addEventListener('pointermove', onPointerMove); window.addEventListener('pointerup', onPointerUp);
  }
  dmWrap.addEventListener('pointerdown', onPointerDown);

  return {
    reset() { drag = null; },
    detach() {
      dmWrap.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    },
  };
}
