/* ============================================================
   DOM renderer — the thin layer that writes the pure SVG/text into the page.

   This is deliberately the most replaceable layer (a future React adoption
   swaps THIS, not the core). It only reads a Dungeon and writes DOM; it holds
   no state. Element IDs match index.html exactly. Logic preserved verbatim.
   ============================================================ */
import type { Dungeon } from '../model/types';
import { buildSVG } from './mapSvg';

export function setHTML(id: string, html: string): void {
  const element = document.getElementById(id);
  if (element) element.innerHTML = html;
}

export function setText(id: string, text: string | number): void {
  const element = document.getElementById(id);
  if (element) element.textContent = String(text);
}

/** Update the running foot name across all pages. */
export function updateFootNames(name: string | undefined): void {
  const value = name ?? '';
  document.querySelectorAll('.foot-name').forEach((element) => { (element as HTMLElement).textContent = value; });
}

/** Render both maps and the header/tally text from a dungeon object. */
export function renderDungeon(dungeon: Dungeon): void {
  setHTML('dm-map', buildSVG(dungeon, { secret: true, dmMarkers: true }));
  setHTML('player-map', buildSVG(dungeon, { secret: false, dmMarkers: false }));

  setText('dungeon-name-dm', dungeon.name);
  setText('dungeon-name-pl', dungeon.name);
  setText('depth-dm', dungeon.depth);
  setText('depth-pl', dungeon.depth);
  setText('dm-subtitle', "Game Master's Map" + (dungeon.genre ? ' (genre: ' + dungeon.genre + ')' : '') + (dungeon.tone ? ' (tone: ' + dungeon.tone + ')' : ''));
  setText('pl-flavor', dungeon.flavor ?? '');

  setText('tally-rooms', dungeon.tally.rooms);
  setText('tally-foes', dungeon.tally.foes);
  setText('tally-traps', dungeon.tally.traps);
  setText('tally-loot', dungeon.tally.loot);
  setText('tally-secret', dungeon.tally.secret);

  const seedString = (dungeon.seed >>> 0).toString(16).toUpperCase();
  document.querySelectorAll('.seed-val').forEach((element) => { (element as HTMLElement).textContent = seedString; });
  updateFootNames(dungeon.name);
}
