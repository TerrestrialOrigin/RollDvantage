/* ============================================================
   Toolbar controller — generate menu + unsaved-changes warning, level stepper,
   undo/redo (buttons + keyboard), save/load/export, the inline-editable
   name/depth/flavor fields, and the static legend icons. All dungeon changes go
   through the DungeonEditor. Logic preserved verbatim from the original.
   ============================================================ */
import type { Dungeon, MarkerType, Direction } from '../model/types';
import { symbol } from '../rendering/symbols';
import { updateFootNames } from '../rendering/domRenderer';
import { downloadDungeon, readDungeonFile, InvalidDungeonFileError } from '../persistence/dungeonFile';
import { MIN_LEVEL, MAX_LEVEL, type DungeonStore } from '../state/dungeonStore';
import type { GenerationMode, DungeonEditor } from '../api/dungeonEditor';

export interface ToolbarHandles { updateLevelUI: () => void; updateUndoRedoUI: () => void; }

export function attachToolbarController(editor: DungeonEditor, store: DungeonStore): ToolbarHandles {
  const getDungeon = (): Dungeon | null => store.getCurrent();

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
  if (levelDown) levelDown.addEventListener('click', () => setLevel(store.getLevel() - 1));
  const levelUp = document.getElementById('lvl-up');
  if (levelUp) levelUp.addEventListener('click', () => setLevel(store.getLevel() + 1));

  // ---- generate menu + unsaved warning ----
  const newButton = document.getElementById('btn-new');
  let pendingMode: GenerationMode = 'full';
  let genMenu: HTMLElement | null = null;
  function closeGenMenu(): void { if (genMenu) { genMenu.remove(); genMenu = null; document.removeEventListener('pointerdown', genMenuOutside, true); } }
  function genMenuOutside(event: PointerEvent): void { if (genMenu && !genMenu.contains(event.target as Node) && event.target !== newButton) closeGenMenu(); }
  function startGenerate(mode: GenerationMode): void { pendingMode = mode; closeGenMenu(); if (store.isDirty()) openGenWarn(); else editor.generate(mode); }
  function openGenMenu(): void {
    closeGenMenu();
    const menu = document.createElement('div'); menu.className = 'cell-menu gen-menu';
    ([['Map only', 'empty'], ['Map + Markers', 'full'], ['Map + Markers + Monsters &amp; Loot', 'detailed']] as [string, GenerationMode][]).forEach((option) => {
      const button = document.createElement('button'); button.innerHTML = '<span class="ck"></span>' + option[0];
      button.addEventListener('click', () => { startGenerate(option[1]); });
      menu.appendChild(button);
    });
    document.body.appendChild(menu); genMenu = menu;
    const rect = newButton!.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, rect.top - menu.offsetHeight - 8) + 'px';
    setTimeout(() => { document.addEventListener('pointerdown', genMenuOutside, true); }, 0);
  }
  if (newButton) newButton.addEventListener('click', openGenMenu);

  const genWarn = document.getElementById('gen-warn');
  function openGenWarn(): void { if (genWarn) genWarn.hidden = false; }
  function closeGenWarn(): void { if (genWarn) genWarn.hidden = true; }
  if (genWarn) {
    (genWarn.querySelector('.note-backdrop')!).addEventListener('click', closeGenWarn);
    document.getElementById('gw-cancel')!.addEventListener('click', closeGenWarn);
    document.getElementById('gw-save')!.addEventListener('click', () => { closeGenWarn(); saveDungeon(); editor.generate(pendingMode); });
    document.getElementById('gw-discard')!.addEventListener('click', () => { closeGenWarn(); editor.generate(pendingMode); });
  }

  // ---- undo / redo ----
  function updateUndoRedoUI(): void {
    const undo = document.getElementById('btn-undo') as HTMLButtonElement | null;
    const redo = document.getElementById('btn-redo') as HTMLButtonElement | null;
    if (undo) undo.disabled = !editor.canUndo();
    if (redo) redo.disabled = !editor.canRedo();
  }
  const undoButton = document.getElementById('btn-undo'); if (undoButton) undoButton.addEventListener('click', () => editor.undo());
  const redoButton = document.getElementById('btn-redo'); if (redoButton) redoButton.addEventListener('click', () => editor.redo());
  window.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const active = document.activeElement;                       // never hijack text editing
    if (active && ((active as HTMLElement).isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) { event.preventDefault(); editor.undo(); }
    else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); editor.redo(); }
  });

  // ---- save ----
  function saveDungeon(): void { const dungeon = getDungeon(); if (dungeon) downloadDungeon(dungeon); }
  const saveButton = document.getElementById('btn-save'); if (saveButton) saveButton.addEventListener('click', saveDungeon);

  // ---- export (print-to-PDF bleed layout) ----
  function cleanupBleed(): void {
    document.documentElement.classList.remove('pdf-bleed');
    const style = document.getElementById('bleed-page-style'); if (style) style.remove();
  }
  const exportButton = document.getElementById('btn-export');
  if (exportButton) exportButton.addEventListener('click', () => {
    cleanupBleed();
    const style = document.createElement('style'); style.id = 'bleed-page-style';
    style.textContent = '@page{ size:8.75in 11.25in; margin:0; }';
    document.head.appendChild(style);
    document.documentElement.classList.add('pdf-bleed');
    setTimeout(() => { window.print(); }, 60);
  });
  window.addEventListener('afterprint', cleanupBleed);

  // ---- load ----
  function loadFile(file: File): void {
    readDungeonFile(file)
      .then((dungeon) => { editor.loadFromJson(dungeon); updateLevelUI(); })
      .catch((error) => { if (error instanceof InvalidDungeonFileError) alert(error.message); else throw error; });
  }
  const loadButton = document.getElementById('btn-load');
  const fileInput = document.getElementById('file-load') as HTMLInputElement | null;
  if (loadButton && fileInput) {
    loadButton.addEventListener('click', () => { fileInput.click(); });
    fileInput.addEventListener('change', () => { if (fileInput.files?.[0]) loadFile(fileInput.files[0]); fileInput.value = ''; });
  }

  // ---- static legend icons (entrance & exit triangles both point up) ----
  document.querySelectorAll('[data-icon]').forEach((element) => {
    const type = element.getAttribute('data-icon') as MarkerType;
    const demo: Record<MarkerType, { type: MarkerType; dir?: Direction }> = {
      entrance: { type: 'entrance', dir: 'up' }, exit: { type: 'exit', dir: 'down' },
      trap: { type: 'trap' }, monster: { type: 'monster' }, boss: { type: 'boss' },
      treasure: { type: 'treasure' }, secret: { type: 'secret' }, other: { type: 'other' },
    };
    element.innerHTML = '<svg viewBox="0 0 30 30" class="legend-svg" xmlns="http://www.w3.org/2000/svg">' + symbol(demo[type], 15, 15) + '</svg>';
  });

  // ---- inline-editable name / depth ----
  function wireEditable(aId: string, bId: string, field: 'name' | 'depth'): void {
    const a = document.getElementById(aId), b = document.getElementById(bId);
    if (!a || !b) return;
    function onInput(source: HTMLElement, target: HTMLElement): () => void {
      return () => {
        const dungeon = getDungeon();
        if (dungeon) (dungeon as unknown as Record<string, string>)[field] = source.textContent.trim();
        store.setDirty(true);
        if (document.activeElement !== target) target.textContent = source.textContent;
        if (field === 'name') updateFootNames(getDungeon()?.name);
      };
    }
    a.addEventListener('input', onInput(a, b));
    b.addEventListener('input', onInput(b, a));
    [a, b].forEach((element) => {
      element.addEventListener('keydown', (event) => { if ((event).key === 'Enter') { event.preventDefault(); (element).blur(); } });
      element.addEventListener('blur', () => { const dungeon = getDungeon(); if (dungeon) (dungeon as unknown as Record<string, string>)[field] = element.textContent.trim(); });
    });
  }
  wireEditable('dungeon-name-dm', 'dungeon-name-pl', 'name');
  wireEditable('depth-dm', 'depth-pl', 'depth');

  // ---- editable + deletable closing flourish on the player map ----
  const flavor = document.getElementById('pl-flavor');
  if (flavor) {
    flavor.addEventListener('input', () => { const dungeon = getDungeon(); if (dungeon) dungeon.flavor = flavor.textContent || ''; store.setDirty(true); });
    flavor.addEventListener('keydown', (event) => { if ((event).key === 'Enter') { event.preventDefault(); flavor.blur(); } });
    flavor.addEventListener('blur', () => { const dungeon = getDungeon(); if (dungeon) dungeon.flavor = (flavor.textContent || '').trim(); });
  }

  return { updateLevelUI, updateUndoRedoUI };
}
