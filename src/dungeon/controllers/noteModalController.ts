/* ============================================================
   Note-modal controller — annotate a feature via double-click on the map or a
   click in the Contents Key, edited through the note dialog. The model writes
   go through the DungeonEditor (setNote/removeNote). Logic preserved verbatim.
   ============================================================ */
import type { Annotatable, CorridorNote } from '../model/types';
import { relabel, rawLabel, type AnnotationEntry, type EntryKind } from '../contentsKey/labels';
import { letterFor } from '../rendering/symbols';
import { annotatableMarkerAt, roomAt } from '../editing/featureQueries';
import { isBaseFloor } from '../geometry/topology';
import { dmSvg, cellAtClient } from './mapSurface';
import { openDialog, type DialogSession } from './dialogA11y';
import type { ControllerContext } from './types';

export interface NoteModalHandles {
  /** Open the annotation dialog for the feature at a grid cell (marker, room,
      or corridor/secret-passage square) — the same resolution as double-click.
      No-op when the cell holds nothing annotatable. */
  openNoteAtCell: (cellX: number, cellY: number) => void;
}

export function attachNoteModalController(context: ControllerContext): NoteModalHandles {
  const { editor, getDungeon, modes } = context;
  const dmWrap = document.getElementById('dm-map');

  const modal = document.getElementById('note-modal');
  const elementRef = document.getElementById('note-ref')!;
  const elementKind = document.getElementById('note-kind')!;
  const elementText = document.getElementById('note-text') as HTMLTextAreaElement;
  const elementDelete = document.getElementById('note-delete')!;

  let noteTarget: Annotatable | null = null;
  let noteList: Annotatable[] | null = null;
  let dialogSession: DialogSession | null = null;

  function openNote(target: Annotatable, kind: EntryKind, list?: Annotatable[] | null): void {
    if (!modal) return;
    const dungeon = getDungeon(); if (!dungeon) return;
    if (dialogSession) { dialogSession.close(); dialogSession = null; }
    noteTarget = target; noteList = list ?? null;
    const annotations = relabel(dungeon);
    elementKind.contentEditable = 'true';                      // every title is editable
    elementKind.classList.add('editable');
    elementKind.setAttribute('data-ph', rawLabel(dungeon, { feature: target, kind }));   // placeholder = default label
    elementKind.textContent = target.label ?? '';
    elementRef.textContent = target.referenceLabel ?? letterFor(annotations.length);
    elementText.value = target.note ?? '';
    elementDelete.style.display = (target.note || target.label) ? '' : 'none';
    dialogSession = openDialog({
      dialog: modal,
      panel: modal.querySelector<HTMLElement>('.note-panel')!,
      initialFocus: elementText,
      onEscape: closeNote,
    });
  }
  function closeNote(): void {
    if (dialogSession) { dialogSession.close(); dialogSession = null; }
    else if (modal) modal.hidden = true;
    noteTarget = null; noteList = null;
  }
  function saveNote(): void {
    if (!noteTarget) return;
    editor.setNote(noteTarget, noteList, elementText.value, elementKind.textContent || '');
    closeNote();
  }
  function deleteNote(): void {
    if (noteTarget) editor.removeNote(noteTarget, noteList);
    closeNote();
  }

  function findAnnotationByReferenceLabel(referenceLabel: string): AnnotationEntry | null {
    const annotations = relabel(getDungeon());
    for (const entry of annotations) { if (entry.feature.referenceLabel === referenceLabel) return entry; }
    return null;
  }

  // annotate the feature at a grid cell — shared by double-click and the keyboard cursor
  function openNoteAtCell(cellX: number, cellY: number): void {
    const dungeon = getDungeon(); if (!dungeon) return;
    const marker = annotatableMarkerAt(dungeon, cellX, cellY);
    if (marker) { openNote(marker, 'marker'); return; }
    const room = roomAt(dungeon, cellX, cellY);
    if (room) { openNote(room.feature, room.kind); return; }
    // corridor / secret passage -> a loose note keyed to that square
    if (isBaseFloor(dungeon, cellX, cellY) || (dungeon.secretFloor?.[cellY]?.[cellX] === 1)) {
      dungeon.corridorNotes ??= [];
      let existing: CorridorNote | null = null;
      for (const note of dungeon.corridorNotes) { if (note.gridX === cellX && note.gridY === cellY) { existing = note; break; } }
      openNote(existing ?? { gridX: cellX, gridY: cellY } as CorridorNote, 'corridor', dungeon.corridorNotes);
    }
  }

  // double-click a feature on the DM map to annotate it
  if (dmWrap) {
    dmWrap.addEventListener('dblclick', (event) => {
      if (modes.current) return;
      const dungeon = getDungeon();
      const svg = dmSvg(); if (!svg || !dungeon) return;
      const cell = cellAtClient(dungeon, event.clientX, event.clientY); if (!cell?.inside) return;
      openNoteAtCell(cell.gridX, cell.gridY);
    });
  }

  // click or keyboard-activate a Contents Key entry to edit it (same dialog as on the map)
  const ckContainer = document.getElementById('contents-key');
  function activateContentsKeyBox(box: Element): void {
    const dungeon = getDungeon(); if (!dungeon) return;
    const letterElement = box.querySelector('.ck-letter'); if (!letterElement) return;
    const entry = findAnnotationByReferenceLabel((letterElement.textContent || '').trim()); if (!entry) return;
    openNote(entry.feature, entry.kind, entry.kind === 'corridor' ? dungeon.corridorNotes! : null);
  }
  if (ckContainer) {
    ckContainer.addEventListener('click', (event) => {
      const box = (event.target as Element).closest ? (event.target as Element).closest('.ck-box') : null;
      if (box) activateContentsKeyBox(box);
    });
    ckContainer.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const box = (event.target as Element).closest ? (event.target as Element).closest('.ck-box') : null;
      if (!box) return;
      event.preventDefault();                                  // keep Space from scrolling the page
      activateContentsKeyBox(box);
    });
  }

  // modal buttons + keyboard
  if (modal) {
    document.getElementById('note-save')!.addEventListener('click', saveNote);
    elementDelete.addEventListener('click', deleteNote);
    document.getElementById('note-cancel')!.addEventListener('click', closeNote);
    (modal.querySelector('.note-backdrop')!).addEventListener('click', closeNote);
    // Escape is handled at the dialog level by openDialog — no per-field binding.
    elementText.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); saveNote(); }
    });
    elementKind.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); elementText.focus(); }
    });
  }

  return { openNoteAtCell };
}
