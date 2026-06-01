import { describe, it, expect } from 'vitest';
import { typeLabel, rawLabel, entryLabel, relabel, esc } from './labels';
import type { Dungeon } from '../model/types';

describe('contents-key labels', () => {
  it('maps marker types to titles, falling back to Mark', () => {
    expect(typeLabel('boss')).toBe('Boss');
    expect(typeLabel('unknown')).toBe('Mark');
  });

  it('labels a corridor as secret only when on the secret floor', () => {
    const dungeon = { secretFloor: [[0], [1]] } as unknown as Dungeon;
    expect(rawLabel(dungeon, { o: { x: 0, y: 0 }, kind: 'corridor' })).toBe('Corridor');
    expect(rawLabel(dungeon, { o: { x: 0, y: 1 }, kind: 'corridor' })).toBe('Secret Passage');
  });

  it('prefers a user label over the default', () => {
    const dungeon = {} as Dungeon;
    expect(entryLabel(dungeon, { o: { label: 'The Vault', type: 'treasure' }, kind: 'marker' })).toBe('The Vault');
    expect(entryLabel(dungeon, { o: { type: 'treasure' }, kind: 'marker' })).toBe('Treasure');
  });

  it('collects annotated features in sequence order and assigns letters', () => {
    const dungeon = {
      markers: [{ type: 'monster', x: 1, y: 1, note: 'b', seq: 2 }],
      rooms: [{ x: 0, y: 0, w: 1, h: 1, note: 'a', seq: 1 }],
      secretRooms: [],
      corridorNotes: [],
    } as unknown as Dungeon;
    const entries = relabel(dungeon);
    expect(entries.map((e) => e.o.ref)).toEqual(['A', 'B']);
    expect(entries[0].o.note).toBe('a'); // seq 1 sorts first
    expect(dungeon._seq).toBe(3);
  });

  it('escapes HTML-significant characters (XSS guard)', () => {
    expect(esc('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(esc('a & b')).toBe('a &amp; b');
  });
});
