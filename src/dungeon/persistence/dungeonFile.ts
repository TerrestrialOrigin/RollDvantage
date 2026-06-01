/* ============================================================
   Dungeon file persistence.

   Pure core (serialize / filename / parse+validate) is unit-tested; the DOM
   wrappers (download via an <a>, read via FileReader) are thin. Validation
   matches the original (reject anything missing grid/floor/markers).
   ============================================================ */
import type { Dungeon } from '../model/types';

export class InvalidDungeonFileError extends Error {
  constructor() {
    super('That file is not a valid RollDvantage dungeon file.');
    this.name = 'InvalidDungeonFileError';
  }
}

/** Pretty-printed JSON, exactly as the original Save produced. */
export function serializeDungeon(dungeon: Dungeon): string {
  return JSON.stringify(dungeon, null, 2);
}

/** `<name-slug>-<SEED-hex>.dungeon`, matching the original filename scheme. */
export function dungeonFilename(dungeon: Dungeon): string {
  const slug = (dungeon.name || 'dungeon').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug + '-' + (dungeon.seed >>> 0).toString(16).toUpperCase() + '.dungeon';
}

/** Minimal shape check the renderer relies on. */
export function isValidDungeon(value: unknown): value is Dungeon {
  const candidate = value as Partial<Dungeon> | null;
  return !!candidate && !!candidate.grid && !!candidate.floor && !!candidate.markers;
}

/** Parse + validate dungeon JSON. Throws InvalidDungeonFileError on bad input. */
export function parseDungeonText(text: string): Dungeon {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidDungeonFileError();
  }
  if (!isValidDungeon(parsed)) throw new InvalidDungeonFileError();
  return parsed;
}

/** Trigger a browser download of the dungeon as a .dungeon file. */
export function downloadDungeon(dungeon: Dungeon): void {
  const json = serializeDungeon(dungeon);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = dungeonFilename(dungeon);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => { URL.revokeObjectURL(url); }, 1500);
}

/** Read + parse + validate a File. Rejects with InvalidDungeonFileError on bad input. */
export function readDungeonFile(file: File): Promise<Dungeon> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseDungeonText(typeof reader.result === 'string' ? reader.result : ''));
      } catch (error) {
        reject(error instanceof Error ? error : new InvalidDungeonFileError());
      }
    };
    reader.onerror = () => reject(new InvalidDungeonFileError());
    reader.readAsText(file);
  });
}
