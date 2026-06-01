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
import type { ControllerContext } from './types';

export function attachNoteModalController(context: ControllerContext): void {
  const { editor, getDungeon, modes } = context;
  const dmWrap = document.getElementById('dm-map');

  const modal = document.getElementById('note-modal');
  const elementRef = document.getElementById('note-ref')!;
  const elementKind = document.getElementById('note-kind')!;
  const elementText = document.getElementById('note-text') as HTMLTextAreaElement;
  const elementDelete = document.getElementById('note-delete')!;

  let noteTarget: Annotatable | null = null;
  let noteList: Annotatable[] | null = null;

  function openNote(target: Annotatable, kind: EntryKind, list?: Annotatable[] | null): void {
    if (!modal) return;
    const dungeon = getDungeon(); if (!dungeon) return;
    noteTarget = target; noteList = list ?? null;
    const annotations = relabel(dungeon);
    elementKind.contentEditable = 'true';                      // every title is editable
    elementKind.classList.add('editable');
    elementKind.setAttribute('data-ph', rawLabel(dungeon, { o: target, kind }));   // placeholder = default label
    elementKind.textContent = target.label ?? '';
    elementRef.textContent = target.ref ?? letterFor(annotations.length);
    elementText.value = target.note ?? '';
    elementDelete.style.display = (target.note || target.label) ? '' : 'none';
    modal.hidden = false;
    setTimeout(() => { elementText.focus(); }, 30);
  }
  function closeNote(): void { if (modal) modal.hidden = true; noteTarget = null; noteList = null; }
  function saveNote(): void {
    if (!noteTarget) return;
    editor.setNote(noteTarget, noteList, elementText.value, elementKind.textContent || '');
    closeNote();
  }
  function deleteNote(): void {
    if (noteTarget) editor.removeNote(noteTarget, noteList);
    closeNote();
  }

  function findAnnotationByRef(ref: string): AnnotationEntry | null {
    const annotations = relabel(getDungeon());
    for (const entry of annotations) { if (entry.o.ref === ref) return entry; }
    return null;
  }

  // double-click a feature on the DM map to annotate it
  if (dmWrap) {
    dmWrap.addEventListener('dblclick', (event) => {
      if (modes.current) return;
      const dungeon = getDungeon();
      const svg = dmSvg(); if (!svg || !dungeon) return;
      const cell = cellAtClient(dungeon, event.clientX, event.clientY); if (!cell?.inside) return;
      const marker = annotatableMarkerAt(dungeon, cell.x, cell.y);
      if (marker) { openNote(marker, 'marker'); return; }
      const room = roomAt(dungeon, cell.x, cell.y);
      if (room) { openNote(room.o, room.kind); return; }
      // corridor / secret passage -> a loose note keyed to that square
      if (isBaseFloor(dungeon, cell.x, cell.y) || (dungeon.secretFloor?.[cell.y]?.[cell.x] === 1)) {
        dungeon.corridorNotes ??= [];
        let existing: CorridorNote | null = null;
        for (const note of dungeon.corridorNotes) { if (note.x === cell.x && note.y === cell.y) { existing = note; break; } }
        openNote(existing ?? { x: cell.x, y: cell.y } as CorridorNote, 'corridor', dungeon.corridorNotes);
      }
    });
  }

  // double-click a Contents Key entry to edit it (same dialog as on the map)
  const ckContainer = document.getElementById('contents-key');
  if (ckContainer) ckContainer.addEventListener('click', (event) => {
    const dungeon = getDungeon();
    const box = (event.target as Element).closest ? (event.target as Element).closest('.ck-box') : null;
    if (!box || !dungeon) return;
    const letterElement = box.querySelector('.ck-letter'); if (!letterElement) return;
    const entry = findAnnotationByRef((letterElement.textContent || '').trim()); if (!entry) return;
    openNote(entry.o, entry.kind, entry.kind === 'corridor' ? dungeon.corridorNotes! : null);
  });

  // modal buttons + keyboard
  if (modal) {
    document.getElementById('note-save')!.addEventListener('click', saveNote);
    elementDelete.addEventListener('click', deleteNote);
    document.getElementById('note-cancel')!.addEventListener('click', closeNote);
    (modal.querySelector('.note-backdrop')!).addEventListener('click', closeNote);
    elementText.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); saveNote(); }
      else if (event.key === 'Escape') { event.preventDefault(); closeNote(); }
    });
    elementKind.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); elementText.focus(); }
      else if (event.key === 'Escape') { event.preventDefault(); closeNote(); }
    });
  }
}
