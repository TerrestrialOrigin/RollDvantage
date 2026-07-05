/* jsdom test for N1 (invalidate-stale-targets-on-restore): the note dialog holds
   a reference (noteTarget) into the pre-undo dungeon. The dialog is focus-trapped
   but its Save/Cancel BUTTONS are not text fields, so Ctrl+Z fires there; the undo
   restores a fresh snapshot and Save then writes the note into a DETACHED object,
   silently losing it. The fix suppresses keyboard undo/redo while focus is inside
   an open modal dialog. Real store/history/editor + real toolbar + real note
   controller; only DOM events are synthesized. GATE 2b: removing the dialog-focus
   guard must redden the "note is persisted" assertion. */
import { describe, it, expect, beforeEach } from 'vitest';
import { History } from '../state/history';
import { DungeonStore } from '../state/dungeonStore';
import { createDungeonEditor, type DungeonEditor } from '../api/dungeonEditor';
import { attachToolbarController } from './toolbarController';
import { attachNoteModalController, type NoteModalHandles } from './noteModalController';
import type { ControllerContext, ModeState } from './types';
import type { Dungeon } from '../model/types';

function memStore(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  const data: Record<string, string> = {};
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

/** A 6x6 dungeon with one open floor row (y = 2), no rooms, no markers. */
function openRowDungeon(): Dungeon {
  const gridWidth = 6, gridHeight = 6;
  const floor = Array.from({ length: gridHeight }, () => new Array<number>(gridWidth).fill(0));
  const row = floor[2];
  if (row) for (let x = 0; x < gridWidth; x++) row[x] = 1;
  return {
    seed: 1, name: 'Stale Note Test', depth: 'Depth 1',
    grid: { width: gridWidth, height: gridHeight, cell: 24 },
    floor, rooms: [], markers: [],
    tally: { rooms: 0, foes: 0, traps: 0, loot: 0, secret: 0 },
  };
}

const NOTE_MODAL_HTML = `
  <div id="dm-map"><svg></svg></div>
  <div id="contents-key"></div>
  <div class="note-modal" id="note-modal" role="dialog" aria-modal="true" hidden>
    <div class="note-backdrop"></div>
    <div class="note-panel">
      <span class="note-ref" id="note-ref">A</span>
      <span class="note-kind" id="note-kind">Treasure</span>
      <textarea id="note-text" rows="5"></textarea>
      <button id="note-delete">Remove</button>
      <button id="note-cancel">Cancel</button>
      <button class="primary" id="note-save">Save Entry</button>
    </div>
  </div>`;

interface Stack {
  editor: DungeonEditor;
  store: DungeonStore;
  note: NoteModalHandles;
  getDungeon: () => Dungeon;
}

function setup(): Stack {
  document.body.innerHTML = NOTE_MODAL_HTML;
  const history = new History();
  const store = new DungeonStore(history, memStore());
  const editor = createDungeonEditor(store, history);
  editor.loadFromJson(openRowDungeon());
  const modes: ModeState = { current: null, selectedMarkerType: null };
  const context: ControllerContext = { editor, getDungeon: () => store.getCurrent(), modes };
  attachToolbarController(editor, store);
  const note = attachNoteModalController(context);
  return { editor, store, note, getDungeon: () => store.getCurrent()! };
}

function pressCtrlZ(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('note dialog target survives an undo triggered from within it', () => {
  it('Ctrl+Z with the Save button focused does not strand the note target — Save persists the note', () => {
    const stack = setup();
    // Two edits so there is history to undo, and a marker to annotate.
    stack.editor.addMarker('monster', 1, 2);                 // the marker we will annotate
    stack.editor.addMarker('trap', 3, 2);                    // creates an undo step past the monster
    expect(stack.editor.canUndo()).toBe(true);

    // Open the note dialog on the monster via the same opener the map/keyboard use.
    stack.note.openNoteAtCell(1, 2);
    const modal = document.getElementById('note-modal')!;
    expect(modal.hidden).toBe(false);                        // dialog is open

    // Move focus to the Save button (a non-text-field control inside the dialog).
    const saveButton = document.getElementById('note-save') as HTMLButtonElement;
    saveButton.focus();
    expect(document.activeElement).toBe(saveButton);

    // The undo that the pre-fix code lets through: it would restore a snapshot and
    // detach the note target.
    pressCtrlZ();

    // Type the note and save.
    (document.getElementById('note-text') as HTMLTextAreaElement).value = 'guardian of the vault';
    saveButton.click();

    // The note must land on the LIVE marker at (1,2), not a detached copy.
    const dungeon = stack.getDungeon();
    const monster = dungeon.markers.find((marker) => marker.type === 'monster' && marker.x === 1 && marker.y === 2);
    expect(monster).toBeDefined();
    expect(monster!.note).toBe('guardian of the vault');
  });
});
