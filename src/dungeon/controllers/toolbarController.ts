/* ============================================================
   Toolbar controller — generate menu + unsaved-changes warning, level stepper,
   undo/redo (buttons + keyboard), save/load/export, the inline-editable
   name/depth/flavor fields, and the static legend icons. All dungeon changes go
   through the DungeonEditor; the generate menu's popup lifecycle lives in the
   shared floatingMenu helper. Logic preserved verbatim from the original.
   ============================================================ */
import type { Dungeon, MarkerType } from '../model/types';
import { symbol, MARKER_PREVIEW_SPECS } from '../rendering/symbols';
import { updateFootNames } from '../rendering/domRenderer';
import { downloadDungeon, readDungeonFile, InvalidDungeonFileError } from '../persistence/dungeonFile';
import { MIN_LEVEL, MAX_LEVEL, type DungeonStore } from '../state/dungeonStore';
import { openDialog, type DialogSession } from './dialogA11y';
import { openFloatingMenu, type FloatingMenuSession } from './floatingMenu';
import { createListenerBag } from './listenerBag';
import type { GenerationMode, DungeonEditor } from '../api/dungeonEditor';

export interface ToolbarHandles {
  updateLevelUI: () => void;
  updateUndoRedoUI: () => void;
  /** Close any open popup and remove every listener this controller registered. */
  detach: () => void;
}

export function attachToolbarController(editor: DungeonEditor, store: DungeonStore): ToolbarHandles {
  const getDungeon = (): Dungeon | null => store.getCurrent();
  const bag = createListenerBag();

  // ---- level ----
  function updateLevelUI(): void {
    const level = store.getLevel();
    const number = document.getElementById('lvl-num'); if (number) number.textContent = String(level);
    const down = document.getElementById('lvl-down'), up = document.getElementById('lvl-up');
    if (down) down.classList.toggle('off', level <= MIN_LEVEL);
    if (up) up.classList.toggle('off', level >= MAX_LEVEL);
  }
  function setLevel(value: number): void { editor.setLevel(value); updateLevelUI(); }

  const levelDown = document.getElementById('lvl-down');
  if (levelDown) bag.listen(levelDown, 'click', () => setLevel(store.getLevel() - 1));
  const levelUp = document.getElementById('lvl-up');
  if (levelUp) bag.listen(levelUp, 'click', () => setLevel(store.getLevel() + 1));

  // ---- generate menu + unsaved warning ----
  const newButton = document.getElementById('btn-new');
  let pendingMode: GenerationMode = 'full';
  let genMenuSession: FloatingMenuSession | null = null;
  function closeGenMenu(): void { genMenuSession?.close(); }
  function startGenerate(mode: GenerationMode): void { pendingMode = mode; closeGenMenu(); if (store.isDirty()) openGenWarn(); else editor.generate(mode); }
  function openGenMenu(): void {
    closeGenMenu();
    const menu = document.createElement('div'); menu.className = 'cell-menu gen-menu';
    ([['Map only', 'empty'], ['Map + Markers', 'full'], ['Map + Markers + Monsters &amp; Loot', 'detailed']] as [string, GenerationMode][]).forEach((option) => {
      const button = document.createElement('button'); button.innerHTML = '<span class="ck"></span>' + option[0];
      button.addEventListener('click', () => { startGenerate(option[1]); });
      menu.appendChild(button);
    });
    genMenuSession = openFloatingMenu({
      menu,
      position: { kind: 'above', anchor: newButton! },
      ignoreOutsideOn: newButton,
      onClose: () => { genMenuSession = null; },
    });
  }
  if (newButton) bag.listen(newButton, 'click', openGenMenu);

  const genWarn = document.getElementById('gen-warn');
  let genWarnSession: DialogSession | null = null;
  function openGenWarn(): void {
    if (!genWarn) return;
    if (genWarnSession) { genWarnSession.close(); genWarnSession = null; }
    genWarnSession = openDialog({
      dialog: genWarn,
      panel: genWarn.querySelector<HTMLElement>('.note-panel')!,
      initialFocus: document.getElementById('gw-cancel')!,
      onEscape: closeGenWarn,
    });
  }
  function closeGenWarn(): void {
    if (genWarnSession) { genWarnSession.close(); genWarnSession = null; }
    else if (genWarn) genWarn.hidden = true;
  }
  if (genWarn) {
    bag.listen(genWarn.querySelector('.note-backdrop')!, 'click', closeGenWarn);
    bag.listen(document.getElementById('gw-cancel')!, 'click', closeGenWarn);
    bag.listen(document.getElementById('gw-save')!, 'click', () => { closeGenWarn(); saveDungeon(); editor.generate(pendingMode); });
    bag.listen(document.getElementById('gw-discard')!, 'click', () => { closeGenWarn(); editor.generate(pendingMode); });
  }

  // ---- undo / redo ----
  function updateUndoRedoUI(): void {
    const undo = document.getElementById('btn-undo') as HTMLButtonElement | null;
    const redo = document.getElementById('btn-redo') as HTMLButtonElement | null;
    if (undo) undo.disabled = !editor.canUndo();
    if (redo) redo.disabled = !editor.canRedo();
  }
  const undoButton = document.getElementById('btn-undo'); if (undoButton) bag.listen(undoButton, 'click', () => editor.undo());
  const redoButton = document.getElementById('btn-redo'); if (redoButton) bag.listen(redoButton, 'click', () => editor.redo());
  bag.listen<KeyboardEvent>(window, 'keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const active = document.activeElement;                       // never hijack text editing
    if (active && ((active as HTMLElement).isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    // A focus-trapped modal dialog (note editor, generate warning) owns the keyboard:
    // a snapshot restore here would swap the dungeon out from under an in-progress
    // edit whose target references the pre-restore dungeon (e.g. the note dialog's
    // Save/Cancel buttons are not text fields, so Ctrl+Z would otherwise slip through
    // and strand the note target). Suppress undo/redo while such a dialog is open.
    if (active?.closest('[role="dialog"]:not([hidden])')) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) { event.preventDefault(); editor.undo(); }
    else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); editor.redo(); }
  });

  // ---- save ----
  function saveDungeon(): void { const dungeon = getDungeon(); if (dungeon) downloadDungeon(dungeon); }
  const saveButton = document.getElementById('btn-save'); if (saveButton) bag.listen(saveButton, 'click', saveDungeon);

  // ---- export (print-to-PDF bleed layout) ----
  function cleanupBleed(): void {
    document.documentElement.classList.remove('pdf-bleed');
    const style = document.getElementById('bleed-page-style'); if (style) style.remove();
  }
  const exportButton = document.getElementById('btn-export');
  if (exportButton) bag.listen(exportButton, 'click', () => {
    cleanupBleed();
    const style = document.createElement('style'); style.id = 'bleed-page-style';
    style.textContent = '@page{ size:8.75in 11.25in; margin:0; }';
    document.head.appendChild(style);
    document.documentElement.classList.add('pdf-bleed');
    /* Print only after the bleed class has actually been laid out: the first
       frame applies styles, the second guarantees the layout flush the old
       setTimeout(,60) merely approximated. */
    requestAnimationFrame(() => { requestAnimationFrame(() => { window.print(); }); });
  });
  bag.listen(window, 'afterprint', cleanupBleed);

  // ---- load ----
  function loadFile(file: File): void {
    readDungeonFile(file)
      .then((dungeon) => { editor.loadFromJson(dungeon); updateLevelUI(); })
      .catch((error) => { if (error instanceof InvalidDungeonFileError) alert(error.message); else throw error; });
  }
  const loadButton = document.getElementById('btn-load');
  const fileInput = document.getElementById('file-load') as HTMLInputElement | null;
  if (loadButton && fileInput) {
    bag.listen(loadButton, 'click', () => { fileInput.click(); });
    bag.listen(fileInput, 'change', () => { if (fileInput.files?.[0]) loadFile(fileInput.files[0]); fileInput.value = ''; });
  }

  // ---- static legend icons (shared preview map — entrance & exit both point up) ----
  document.querySelectorAll('[data-icon]').forEach((element) => {
    const type = element.getAttribute('data-icon') as MarkerType;
    element.innerHTML = '<svg viewBox="0 0 30 30" class="legend-svg" xmlns="http://www.w3.org/2000/svg">' + symbol(MARKER_PREVIEW_SPECS[type], 15, 15) + '</svg>';
  });

  // ---- inline-editable name / depth (the DM and player pages mirror each other) ----
  function wireEditable(dmFieldId: string, playerFieldId: string, field: 'name' | 'depth'): void {
    const dmField = document.getElementById(dmFieldId), playerField = document.getElementById(playerFieldId);
    if (!dmField || !playerField) return;
    function onInput(source: HTMLElement, target: HTMLElement): () => void {
      return () => {
        const dungeon = getDungeon();
        if (dungeon) (dungeon as unknown as Record<string, string>)[field] = source.textContent.trim();
        store.setDirty(true);
        if (document.activeElement !== target) target.textContent = source.textContent;
        if (field === 'name') updateFootNames(getDungeon()?.name);
      };
    }
    bag.listen(dmField, 'input', onInput(dmField, playerField));
    bag.listen(playerField, 'input', onInput(playerField, dmField));
    [dmField, playerField].forEach((element) => {
      bag.listen<KeyboardEvent>(element, 'keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); element.blur(); } });
      bag.listen(element, 'blur', () => { const dungeon = getDungeon(); if (dungeon) (dungeon as unknown as Record<string, string>)[field] = element.textContent.trim(); });
    });
  }
  wireEditable('dungeon-name-dm', 'dungeon-name-pl', 'name');
  wireEditable('depth-dm', 'depth-pl', 'depth');

  // ---- editable + deletable closing flourish on the player map ----
  const flavor = document.getElementById('pl-flavor');
  if (flavor) {
    bag.listen(flavor, 'input', () => { const dungeon = getDungeon(); if (dungeon) dungeon.flavor = flavor.textContent || ''; store.setDirty(true); });
    bag.listen<KeyboardEvent>(flavor, 'keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); flavor.blur(); } });
    bag.listen(flavor, 'blur', () => { const dungeon = getDungeon(); if (dungeon) dungeon.flavor = (flavor.textContent || '').trim(); });
  }

  return {
    updateLevelUI,
    updateUndoRedoUI,
    detach() { closeGenMenu(); closeGenWarn(); bag.detach(); },
  };
}
