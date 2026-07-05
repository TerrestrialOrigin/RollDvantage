/* Keyboard/AT contract of the rendered Contents Key (H6): every entry box is
   a focusable button with an accessible name identifying the entry, and a
   hostile user-authored label can never become markup — the name is applied
   as an attribute, the visible text through escapeHtml(). (jsdom) */
import { describe, it, expect, beforeEach } from 'vitest';
import { generateDungeon } from 'auto-stuff-generator';
import type { Dungeon, ExternalDungeon } from '../model/types';
import { migrateDungeon } from '../persistence/dungeonFile';
import { relabel } from './labels';
import { renderContentsKey } from './contentsKeyView';

function makeAnnotatedDungeon(): Dungeon {
  const dungeon = migrateDungeon(generateDungeon(0xc0ffee, 3, 'full') as unknown as ExternalDungeon);
  const firstMarker = dungeon.markers[0];
  if (firstMarker) firstMarker.note = 'A sleeping troll.';
  const firstRoom = dungeon.rooms[0];
  if (firstRoom) {
    firstRoom.note = 'The antechamber.';
    firstRoom.label = 'Grand Hall';
  }
  return dungeon;
}

describe('renderContentsKey button semantics', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="contents-key"></div>';
  });

  it('renders every entry as a focusable role=button with a naming aria-label', () => {
    const dungeon = makeAnnotatedDungeon();
    const annotations = relabel(dungeon);
    renderContentsKey(annotations, dungeon);
    const boxes = document.querySelectorAll('.ck-box');
    expect(boxes.length).toBe(annotations.length);
    boxes.forEach((box, index) => {
      expect(box.getAttribute('role')).toBe('button');
      expect(box.getAttribute('tabindex')).toBe('0');
      const label = box.getAttribute('aria-label')!;
      const annotation = annotations[index];
      expect(annotation).toBeDefined();
      if (!annotation) return;
      expect(label).toContain('Edit entry ' + annotation.feature.ref!);
    });
  });

  it('includes the user-supplied title in the accessible name', () => {
    const dungeon = makeAnnotatedDungeon();
    const annotations = relabel(dungeon);
    renderContentsKey(annotations, dungeon);
    const labels = Array.from(document.querySelectorAll('.ck-box'))
      .map((box) => box.getAttribute('aria-label')!);
    expect(labels.some((label) => label.includes('Grand Hall'))).toBe(true);
  });

  it('keeps a hostile label inert — attribute value and escaped text, never markup', () => {
    const dungeon = makeAnnotatedDungeon();
    const hostileRoom = dungeon.rooms[0];
    if (hostileRoom) hostileRoom.label = '"><img id="ck-pwned" src=x><b>bold</b>';
    const annotations = relabel(dungeon);
    renderContentsKey(annotations, dungeon);
    expect(document.getElementById('ck-pwned')).toBeNull();
    expect(document.querySelector('#contents-key b')).toBeNull();
    expect(document.querySelector('#contents-key img')).toBeNull();
    const hostileBox = Array.from(document.querySelectorAll('.ck-box'))
      .find((box) => box.getAttribute('aria-label')!.includes('ck-pwned'));
    expect(hostileBox).toBeDefined();                      // name carried the raw text, inertly
  });

  it('escapes a hostile reference letter at the innerHTML sink (N8)', () => {
    // relabel() normally overwrites `ref` with a plain [A-Z] letter; escaping must
    // live at the sink, not rely on that ordering invariant. Inject a hostile ref
    // AFTER relabel to prove the sink itself is safe.
    const dungeon = makeAnnotatedDungeon();
    const annotations = relabel(dungeon);
    const first = annotations[0];
    expect(first).toBeDefined();
    if (!first) return;
    first.feature.ref = '<img id="ref-pwned" src=x onerror="window.__p=1">';
    renderContentsKey(annotations, dungeon);
    expect(document.getElementById('ref-pwned')).toBeNull();
    expect(document.querySelector('#contents-key img')).toBeNull();
    const letter = document.querySelector('#contents-key .ck-letter');
    expect(letter).not.toBeNull();
    expect(letter!.textContent).toContain('<img id="ref-pwned"'); // rendered as literal text
  });

  it('invokes onLayoutChange after building pages (the typed re-fit signal)', () => {
    const dungeon = makeAnnotatedDungeon();
    let layoutChanges = 0;
    renderContentsKey(relabel(dungeon), dungeon, () => { layoutChanges += 1; });
    expect(document.querySelectorAll('.ck-box').length).toBeGreaterThan(0);
    expect(layoutChanges).toBe(1);
  });

  it('does not invoke onLayoutChange when there is nothing to render', () => {
    const dungeon = migrateDungeon(generateDungeon(1, 1, 'empty') as unknown as ExternalDungeon);
    let layoutChanges = 0;
    renderContentsKey(relabel(dungeon), dungeon, () => { layoutChanges += 1; });
    expect(layoutChanges).toBe(0);
  });
});
