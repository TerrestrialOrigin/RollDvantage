/* ============================================================
   Structure-mode controller — a thin orchestrator (M12): owns the shared mode
   flag, the mode buttons + hint, and Esc handling, and composes the per-mode
   interaction modules (room / corridor / delete / default tool) that carry the
   pointer machines. All mutations go through the DungeonEditor. The modules
   preserve the original handlers verbatim; attachment order matches the
   original listener-registration order so overlapping #dm-map pointer
   handlers dispatch identically.
   ============================================================ */
import { clearPreview } from './mapSurface';
import { createListenerBag } from './listenerBag';
import { attachRoomMode } from './structureModes/roomMode';
import { attachCorridorMode } from './structureModes/corridorMode';
import { attachDeleteMode } from './structureModes/deleteMode';
import { attachDefaultTool } from './structureModes/defaultTool';
import type { StructureModeModule } from './structureModes/modeTypes';
import type { ControllerContext, EditMode } from './types';

export interface StructureModeDeps extends ControllerContext {
  openContextMenu: (gridX: number, gridY: number, clientX: number, clientY: number) => void;
}

export interface StructureModeHandles {
  /** Set (or clear, with null) the structure-editing mode — same toggle the mode buttons use. */
  setMode: (next: EditMode) => void;
  /** Restore the standard mode-hint text/visibility for the current mode. */
  updateModeHint: () => void;
  /** Remove every listener the orchestrator and its mode modules registered. */
  detach: () => void;
}

/** Clear any selected legend marker tool: shared state + button pressed styling. */
export function clearMarkerSelection(modes: ControllerContext['modes']): void {
  modes.selectedMarkerType = null;
  document.querySelectorAll('.legend-item[data-marker-type]').forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
  });
}

export function attachStructureModeController(deps: StructureModeDeps): StructureModeHandles {
  const { modes } = deps;
  const dmWrap = document.getElementById('dm-map');
  const bag = createListenerBag();
  const modeModules: StructureModeModule[] = [];
  /* The default tool's in-flight drags survive a mode switch (matching the
     original, which only reset the modal machines' state), so it is tracked
     for detach but excluded from the setMode reset below. */
  let corridorModule: StructureModeModule | null = null;
  let modalModules: StructureModeModule[] = [];

  // ---- mode switching + hint ----
  function updateModeHint(): void {
    const element = document.getElementById('mode-hint'); if (!element) return;
    if (modes.current === 'room') { element.textContent = 'Add Room: drag a rectangle across the squares, or press Enter at the keyboard cursor to anchor and again to commit. Esc to finish.'; element.hidden = false; }
    else if (modes.current === 'corridor') { element.textContent = 'Add Corridor: click (or press Enter at the keyboard cursor on) a square to start, then again to set the end. Esc to finish.'; element.hidden = false; }
    else if (modes.current === 'delete') { element.textContent = 'Delete: click a square, drag a rectangle, or press Enter at the keyboard cursor to anchor and again to erase. Esc to finish.'; element.hidden = false; }
    else { element.hidden = true; }
  }
  function setMode(next: EditMode): void {
    modes.current = (modes.current === next) ? null : next;
    if (modes.current) clearMarkerSelection(modes);   // a structure mode and a legend tool are mutually exclusive
    modalModules.forEach((mode) => mode.reset());
    clearPreview();
    const room = document.getElementById('btn-room'), corridor = document.getElementById('btn-corridor'), del = document.getElementById('btn-delete');
    if (room) room.classList.toggle('active', modes.current === 'room');
    if (corridor) corridor.classList.toggle('active', modes.current === 'corridor');
    if (del) del.classList.toggle('active', modes.current === 'delete');
    document.body.classList.toggle('mode-active', !!modes.current);
    updateModeHint();
  }

  const btnRoom = document.getElementById('btn-room'); if (btnRoom) bag.listen(btnRoom, 'click', () => setMode('room'));
  const btnCorridor = document.getElementById('btn-corridor'); if (btnCorridor) bag.listen(btnCorridor, 'click', () => setMode('corridor'));
  const btnDelete = document.getElementById('btn-delete'); if (btnDelete) bag.listen(btnDelete, 'click', () => setMode('delete'));
  bag.listen<KeyboardEvent>(window, 'keydown', (event) => { if (event.key === 'Escape') { if (modes.current) setMode(null); } });

  const handles: StructureModeHandles = {
    setMode,
    updateModeHint,
    detach() { modeModules.forEach((mode) => mode.detach()); bag.detach(); },
  };
  if (!dmWrap) return handles;

  // suppress the browser's native right-click menu over the map; reset corridor in-progress
  bag.listen<MouseEvent>(dmWrap, 'contextmenu', (event) => {
    event.preventDefault();
    if (modes.current === 'corridor') { corridorModule?.reset(); clearPreview(); }
  });

  // Same registration order as the original handlers: room, corridor, delete, default tool.
  const moduleDeps = { ...deps, dmWrap };
  const roomModule = attachRoomMode(moduleDeps);
  corridorModule = attachCorridorMode(moduleDeps);
  const deleteModule = attachDeleteMode(moduleDeps);
  const defaultToolModule = attachDefaultTool(moduleDeps);
  modalModules = [roomModule, corridorModule, deleteModule];
  modeModules.push(roomModule, corridorModule, deleteModule, defaultToolModule);

  return handles;
}
