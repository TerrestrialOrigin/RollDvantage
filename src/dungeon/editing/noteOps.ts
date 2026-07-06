/* ============================================================
   Note operations — pure model side of annotating a feature.

   The controller reads the title/text from the dialog and calls applyNote;
   the DOM concerns (closing the modal, re-rendering) stay in the controller.
   Logic preserved verbatim from the original saveNote/removeNote (minus DOM).
   ============================================================ */
import type { Dungeon, Annotatable } from '../model/types';

/** Strip a note/label/sequence/referenceLabel from a target and detach it from a loose list. */
export function removeNote(target: Annotatable, list: Annotatable[] | null): void {
  delete target.note;
  delete target.sequence;
  delete target.referenceLabel;
  delete target.label;
  if (list) { const index = list.indexOf(target); if (index >= 0) list.splice(index, 1); }
}

/**
 * Apply a title/note to a target. Empty title AND note removes the annotation.
 * `list` is the backing array for loose notes (e.g. corridorNotes) or null.
 * Returns whether the entry was saved or removed.
 */
export function applyNote(dungeon: Dungeon, target: Annotatable, list: Annotatable[] | null, noteText: string, labelText: string): 'saved' | 'removed' {
  const text = noteText.trim();
  const label = labelText.trim();
  if (label) target.label = label; else delete target.label; // blank title -> falls back to the default
  if (!text && !label) { removeNote(target, list); return 'removed'; } // nothing at all -> drop the entry
  target.note = text;
  if (target.sequence == null) { target.sequence = dungeon._sequence ?? 0; dungeon._sequence = (dungeon._sequence ?? 0) + 1; }
  if (list && !list.includes(target)) list.push(target); // loose notes join their list on save
  return 'saved';
}
