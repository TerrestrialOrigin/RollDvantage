/* CORRIDOR mode: click to start on existing floor, click again to set the end.
   Logic preserved verbatim from structureModeController's corridor machine. */
import { corridorCells } from '../../geometry/grid';
import { isBaseFloor } from '../../geometry/topology';
import { cellAtClient, clampedCellAtClient, clearPreview } from '../mapSurface';
import { drawCorridorPreview } from '../previews';
import type { StructureModeModule, StructureModeModuleDeps } from './modeTypes';

export function attachCorridorMode(deps: StructureModeModuleDeps): StructureModeModule {
  const { editor, getDungeon, modes, dmWrap } = deps;
  let corridorStart: { x: number; y: number } | null = null;

  function onClick(event: MouseEvent): void {
    if (modes.current !== 'corridor') return;
    const dungeon = getDungeon()!;
    const cell = cellAtClient(dungeon, event.clientX, event.clientY);
    if (!corridorStart) {
      if (!cell || !cell.inside || !isBaseFloor(dungeon, cell.x, cell.y)) return;   // must begin on an existing square
      corridorStart = { x: cell.x, y: cell.y };
      drawCorridorPreview(dungeon.grid.cell, [[cell.x, cell.y]]);
    } else {
      const end = cell?.inside ? cell : clampedCellAtClient(dungeon, event.clientX, event.clientY); if (!end) return;
      editor.addCorridor(corridorStart.x, corridorStart.y, end.x, end.y);
      corridorStart = null; clearPreview();
    }
  }
  function onMouseMove(event: MouseEvent): void {
    if (modes.current !== 'corridor' || !corridorStart) return;
    const cell = clampedCellAtClient(getDungeon()!, event.clientX, event.clientY); if (!cell) return;
    drawCorridorPreview(getDungeon()!.grid.cell, corridorCells(corridorStart.x, corridorStart.y, cell.x, cell.y));
  }
  dmWrap.addEventListener('click', onClick);
  dmWrap.addEventListener('mousemove', onMouseMove);

  return {
    reset() { corridorStart = null; },
    detach() {
      dmWrap.removeEventListener('click', onClick);
      dmWrap.removeEventListener('mousemove', onMouseMove);
    },
  };
}
