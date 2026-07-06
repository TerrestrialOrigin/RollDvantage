/* CORRIDOR mode: click to start on existing floor, click again to set the end.
   Logic preserved verbatim from structureModeController's corridor machine. */
import { corridorCells } from '../../geometry/grid';
import { isBaseFloor } from '../../geometry/topology';
import { cellAtClient, clampedCellAtClient, clearPreview } from '../mapSurface';
import { drawCorridorPreview } from '../previews';
import type { StructureModeModule, StructureModeModuleDeps } from './modeTypes';

export function attachCorridorMode(deps: StructureModeModuleDeps): StructureModeModule {
  const { editor, getDungeon, modes, dmWrap } = deps;
  let corridorStart: { gridX: number; gridY: number } | null = null;

  function onClick(event: MouseEvent): void {
    if (modes.current !== 'corridor') return;
    const dungeon = getDungeon()!;
    const cell = cellAtClient(dungeon, event.clientX, event.clientY);
    if (!corridorStart) {
      if (!cell || !cell.inside || !isBaseFloor(dungeon, cell.gridX, cell.gridY)) return;   // must begin on an existing square
      corridorStart = { gridX: cell.gridX, gridY: cell.gridY };
      drawCorridorPreview(dungeon.grid.cellSize, [[cell.gridX, cell.gridY]]);
    } else {
      const end = cell?.inside ? cell : clampedCellAtClient(dungeon, event.clientX, event.clientY); if (!end) return;
      editor.addCorridor(corridorStart.gridX, corridorStart.gridY, end.gridX, end.gridY);
      corridorStart = null; clearPreview();
    }
  }
  function onMouseMove(event: MouseEvent): void {
    if (modes.current !== 'corridor' || !corridorStart) return;
    const cell = clampedCellAtClient(getDungeon()!, event.clientX, event.clientY); if (!cell) return;
    drawCorridorPreview(getDungeon()!.grid.cellSize, corridorCells(corridorStart.gridX, corridorStart.gridY, cell.gridX, cell.gridY));
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
