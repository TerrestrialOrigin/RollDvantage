import { describe, it, expect } from 'vitest';
import { generateDungeon } from 'auto-stuff-generator';
import { serializeDungeon, dungeonFilename, parseDungeonText, isValidDungeon, InvalidDungeonFileError } from './dungeonFile';
import type { Dungeon } from '../model/types';

describe('dungeon file persistence (pure core)', () => {
  it('round-trips a dungeon through serialize → parse unchanged', () => {
    const dungeon = generateDungeon(42, 2, 'full') as unknown as Dungeon;
    const restored = parseDungeonText(serializeDungeon(dungeon));
    expect(restored).toEqual(dungeon);
  });

  it('builds a slug-and-seed filename', () => {
    const dungeon = { name: 'The Mansion!!', seed: 0xc0ffee } as unknown as Dungeon;
    expect(dungeonFilename(dungeon)).toBe('the-mansion-C0FFEE.dungeon');
  });

  it('falls back to "dungeon" when unnamed', () => {
    expect(dungeonFilename({ name: '', seed: 1 } as unknown as Dungeon)).toBe('dungeon-1.dungeon');
  });

  it('accepts a valid dungeon and rejects malformed input', () => {
    expect(isValidDungeon({ grid: {}, floor: [], markers: [] })).toBe(true);
    expect(isValidDungeon({ not: 'a dungeon' })).toBe(false);
    expect(() => parseDungeonText('{"not":"a dungeon"}')).toThrow(InvalidDungeonFileError);
    expect(() => parseDungeonText('not json at all')).toThrow(InvalidDungeonFileError);
  });
});
