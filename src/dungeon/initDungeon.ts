/* ============================================================
   Composition root — builds the headless core (store + history + editor),
   wires the DOM renderer as a store subscriber, and attaches the input
   controllers. This is the only module that knows about all the layers; each
   layer below it stays focused and independently testable.

   Controller attachment order mirrors the original listener-registration order
   so overlapping #dm-map pointer handlers dispatch identically.
   ============================================================ */
import { renderDungeon } from './rendering/domRenderer';
import { renderContentsKey, watchContentsKeyBreakpoint } from './contentsKey/contentsKeyView';
import { relabel } from './contentsKey/labels';
import { History } from './state/history';
import { DungeonStore } from './state/dungeonStore';
import { createDungeonEditor } from './api/dungeonEditor';
import { attachToolbarController } from './controllers/toolbarController';
import { attachDragPlaceController } from './controllers/dragPlaceController';
import { attachContextMenuController } from './controllers/contextMenuController';
import { attachStructureModeController } from './controllers/structureModeController';
import { attachKeyboardEditController } from './controllers/keyboardEditController';
import { attachNoteModalController } from './controllers/noteModalController';
import type { ControllerContext, ModeState } from './controllers/types';

export interface InitDungeonOptions {
  /** Invoked after the Contents Key rebuilds its pages, so the page-scaling
      layer can re-fit them (a typed signal, not a synthetic resize event). */
  onContentsKeyLayoutChange?: () => void;
}

export function initDungeon(options: InitDungeonOptions = {}): void {
  const { onContentsKeyLayoutChange } = options;
  const history = new History();
  const store = new DungeonStore(history, window.localStorage);
  const editor = createDungeonEditor(store, history);

  // Re-render whenever the store changes (the single chokepoint notifies here).
  store.subscribe(() => {
    const dungeon = store.getCurrent();
    if (!dungeon) return;
    const annotations = relabel(dungeon);
    renderDungeon(dungeon);
    renderContentsKey(annotations, dungeon, onContentsKeyLayoutChange);
  });

  // Re-paginate the Contents Key when the layout width changes: the responsive
  // breakpoint, or a page-size change (the frame height it paginates against
  // depends on --page-h).
  function repaginateContentsKey(): void {
    const dungeon = store.getCurrent();
    if (dungeon) renderContentsKey(relabel(dungeon), dungeon, onContentsKeyLayoutChange);
  }
  watchContentsKeyBreakpoint(repaginateContentsKey);
  window.addEventListener('chronicle:pagesizechange', repaginateContentsKey);

  const modes: ModeState = { current: null, selectedMarkerType: null };
  const context: ControllerContext = { editor, getDungeon: () => store.getCurrent(), modes };

  // Order matches the original: toolbar/legend, then drag-to-place (its #dm-map
  // pointerdown must precede the structure handlers), then structure modes.
  // The keyboard controller adds no #dm-map pointer handlers, so its position
  // only needs to follow the controllers whose handles it consumes.
  const toolbar = attachToolbarController(editor, store);
  attachDragPlaceController(context);
  const contextMenu = attachContextMenuController(context);
  const structureModes = attachStructureModeController({ ...context, openContextMenu: contextMenu.openContextMenu });
  const noteModal = attachNoteModalController(context);
  attachKeyboardEditController({ ...context, openNoteAtCell: noteModal.openNoteAtCell, structureModes, openContextMenu: contextMenu.openContextMenu });

  // Keep the undo/redo buttons in sync after every history change.
  history.setChangeListener(toolbar.updateUndoRedoUI);

  // Suppress the browser's native right-click menu (it would cover ours); keep it in text fields.
  document.addEventListener('contextmenu', (event) => {
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return;
    event.preventDefault();
  });

  // Initial paint: a fresh dungeon at the persisted level.
  toolbar.updateLevelUI();
  editor.generate();
}
