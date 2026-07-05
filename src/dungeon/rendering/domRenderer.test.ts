/* Accessible-name contract of the DOM renderer: both injected map SVGs expose
   role="img" and a meaningful aria-label, applied via attribute APIs so a
   hostile dungeon name can never become markup. (jsdom) */
import { describe, it, expect, beforeEach } from 'vitest';
import { generateDungeon } from 'auto-stuff-generator';
import type { Dungeon, ExternalDungeon } from '../model/types';
import { renderDungeon } from './domRenderer';
import { migrateDungeon } from '../persistence/dungeonFile';

function makeDungeon(): Dungeon {
  return migrateDungeon(generateDungeon(0xc0ffee, 3, 'full') as unknown as ExternalDungeon);
}

describe('renderDungeon accessible names', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="dm-map"></div><div id="player-map"></div>';
  });

  it('exposes the DM map as an image named with dungeon name, room count, and depth', () => {
    const dungeon = makeDungeon();
    renderDungeon(dungeon);
    const svg = document.querySelector('#dm-map svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    const label = svg.getAttribute('aria-label')!;
    expect(label).toContain(dungeon.name);
    expect(label).toContain("Game Master's map");
    expect(label).toContain(String(dungeon.tally.rooms));
    expect(label).toContain(String(dungeon.depth));
  });

  it('exposes the player map as an image identifying it as the player map', () => {
    const dungeon = makeDungeon();
    renderDungeon(dungeon);
    const svg = document.querySelector('#player-map svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    const label = svg.getAttribute('aria-label')!;
    expect(label).toContain(dungeon.name);
    expect(label.toLowerCase()).toContain('player map');
  });

  it('keeps a hostile dungeon name inert (attribute value, never markup)', () => {
    const dungeon = makeDungeon();
    dungeon.name = '"><img id="pwned" src=x> <b>bold</b>';
    renderDungeon(dungeon);
    expect(document.getElementById('pwned')).toBeNull();
    expect(document.querySelector('#dm-map b')).toBeNull();
    const label = document.querySelector('#dm-map svg')!.getAttribute('aria-label')!;
    expect(label).toContain(dungeon.name);
  });

  it('updates the accessible name on re-render', () => {
    const dungeon = makeDungeon();
    renderDungeon(dungeon);
    dungeon.name = 'Renamed Depths';
    renderDungeon(dungeon);
    expect(document.querySelector('#dm-map svg')!.getAttribute('aria-label')).toContain('Renamed Depths');
  });
});
