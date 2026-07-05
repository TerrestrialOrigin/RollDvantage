import { describe, it, expect } from 'vitest';
import { typeLabel, rawLabel, entryLabel, relabel, escapeHtml } from './labels';
import type { Dungeon } from '../model/types';

describe('contents-key labels', () => {
  it('maps marker types to titles, falling back to Mark', () => {
    expect(typeLabel('boss')).toBe('Boss');
    expect(typeLabel('unknown')).toBe('Mark');
  });

  it('labels a corridor as secret only when on the secret floor', () => {
    const dungeon = { secretFloor: [[0], [1]] } as unknown as Dungeon;
    expect(rawLabel(dungeon, { feature: { x: 0, y: 0 }, kind: 'corridor' })).toBe('Corridor');
    expect(rawLabel(dungeon, { feature: { x: 0, y: 1 }, kind: 'corridor' })).toBe('Secret Passage');
  });

  it('prefers a user label over the default', () => {
    const dungeon = {} as Dungeon;
    expect(entryLabel(dungeon, { feature: { label: 'The Vault', type: 'treasure' }, kind: 'marker' })).toBe('The Vault');
    expect(entryLabel(dungeon, { feature: { type: 'treasure' }, kind: 'marker' })).toBe('Treasure');
  });

  it('collects annotated features in sequence order and assigns letters', () => {
    const dungeon = {
      markers: [{ type: 'monster', x: 1, y: 1, note: 'b', seq: 2 }],
      rooms: [{ x: 0, y: 0, w: 1, h: 1, note: 'a', seq: 1 }],
      secretRooms: [],
      corridorNotes: [],
    } as unknown as Dungeon;
    const entries = relabel(dungeon);
    expect(entries.map((e) => e.feature.ref)).toEqual(['A', 'B']);
    expect(entries[0].feature.note).toBe('a'); // seq 1 sorts first
    expect(dungeon._seq).toBe(3);
  });

  it('escapes HTML-significant characters (XSS guard)', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes quotes for attribute-context safety', () => {
    expect(escapeHtml('"double" and \'single\'')).toBe('&quot;double&quot; and &#39;single&#39;');
  });
});
