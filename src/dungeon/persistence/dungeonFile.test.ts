import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateDungeon } from 'auto-stuff-generator';
import { serializeDungeon, dungeonFilename, parseDungeonText, isValidDungeon, migrateDungeon, DUNGEON_SCHEMA_VERSION, InvalidDungeonFileError } from './dungeonFile';
import type { Dungeon, ExternalDungeon } from '../model/types';

/** Raw generator output — the external schema (`grid.gw/gh`), pre-adoption. */
function generated(mode: 'empty' | 'full' | 'detailed' = 'full'): ExternalDungeon {
  return JSON.parse(JSON.stringify(generateDungeon(42, 2, mode))) as ExternalDungeon;
}

/** Generator output taken through the adoption boundary (internal schema). */
function adopted(mode: 'empty' | 'full' | 'detailed' = 'full'): Dungeon {
  return migrateDungeon(generated(mode));
}

/** A minimal hand-built current-schema dungeon that must always validate. */
function minimalDungeon(): Record<string, unknown> {
  return {
    seed: 7,
    name: 'Tiny Vault',
    depth: 'Depth 1',
    grid: { gw: 3, gh: 2, cell: 24 },
    floor: [[0, 1, 0], [0, 1, 0]],
    rooms: [{ x: 1, y: 0, w: 1, h: 2 }],
    markers: [{ type: 'entrance', x: 1, y: 0 }],
    tally: { rooms: 1, foes: 0, traps: 0, loot: 0, secret: 0 },
  };
}

/** A dungeon in the documented legacy shape: L-schema secretPaths (ax/ay/bx/by/horizFirst). */
function legacyDungeon(): Record<string, unknown> {
  const gridWidth = 6, gridHeight = 5;
  const floor = Array.from({ length: gridHeight }, () => new Array<number>(gridWidth).fill(0));
  floor[1][1] = floor[1][2] = floor[2][1] = floor[2][2] = 1; // one visible room
  const secretFloor = Array.from({ length: gridHeight }, () => new Array<number>(gridWidth).fill(0));
  secretFloor[3][1] = secretFloor[3][2] = secretFloor[3][3] = 1; // a secret run
  return {
    seed: 123,
    name: 'Old Keep',
    depth: 'Depth 2',
    grid: { gw: gridWidth, gh: gridHeight, cell: 24 },
    floor,
    rooms: [{ x: 1, y: 1, w: 2, h: 2, id: 1 }],
    markers: [{ type: 'secret', x: 2, y: 3, placed: true }],
    secretFloor,
    secretPaths: [{ ax: 1, ay: 3, bx: 3, by: 3, horizFirst: true }],
    tally: { rooms: 1, foes: 0, traps: 0, loot: 0, secret: 1 },
  };
}

describe('dungeon file persistence (pure core)', () => {
  it('round-trips a dungeon through serialize → parse completely unchanged', () => {
    const dungeon = adopted();   // adoption already stamps the version
    const restored = parseDungeonText(serializeDungeon(dungeon));
    expect(restored).toEqual(dungeon);
  });

  it('serializes the internal grid back to the external gw/gh schema', () => {
    const emitted = serializeDungeon(adopted());
    expect(emitted).toMatch(/"gw":/);
    expect(emitted).toMatch(/"gh":/);
    expect(emitted).not.toMatch(/"width":/);
    expect(emitted).not.toMatch(/"height":/);
  });

  it('round-trips the committed E2E fixture byte-for-byte (gw/gh adapter is serialization-neutral)', () => {
    const fixtureText = readFileSync(join(__dirname, '../../../e2e/fixtures/seed-c0ffee.dungeon'), 'utf8');
    const loaded = parseDungeonText(fixtureText);
    expect(loaded.grid).toEqual({ width: 23, height: 25, cell: 24 });
    expect(serializeDungeon(loaded)).toBe(fixtureText.trimEnd());
  });

  it('builds a slug-and-seed filename', () => {
    const dungeon = { name: 'The Mansion!!', seed: 0xc0ffee } as unknown as Dungeon;
    expect(dungeonFilename(dungeon)).toBe('the-mansion-C0FFEE.dungeon');
  });

  it('falls back to "dungeon" when unnamed', () => {
    expect(dungeonFilename({ name: '', seed: 1 } as unknown as Dungeon)).toBe('dungeon-1.dungeon');
  });
});

describe('structural validation (H4/M3)', () => {
  it('accepts generated dungeons in every mode and a minimal hand-built file', () => {
    expect(isValidDungeon(generated('empty'))).toBe(true);
    expect(isValidDungeon(generated('full'))).toBe(true);
    expect(isValidDungeon(generated('detailed'))).toBe(true);
    expect(isValidDungeon(minimalDungeon())).toBe(true);
    expect(isValidDungeon(legacyDungeon())).toBe(true); // legacy schema validates, then migrates
  });

  it('rejects the shapes the old truthy check wrongly accepted', () => {
    // Each of these passed `!!grid && !!floor && !!markers` and crashed deep in editing.
    expect(isValidDungeon({ grid: {}, floor: [], markers: [] })).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), floor: 'x' })).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), markers: {} })).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), rooms: undefined })).toBe(false);
  });

  it('rejects non-dungeon values and malformed fields', () => {
    expect(isValidDungeon(null)).toBe(false);
    expect(isValidDungeon('a string')).toBe(false);
    expect(isValidDungeon({ not: 'a dungeon' })).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), seed: '7' })).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), seed: Infinity })).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), grid: { gw: '3', gh: 2, cell: 24 } })).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), rooms: [{ x: 'a', y: 0, w: 1, h: 2 }] })).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), markers: [{ x: 1, y: 0 }] })).toBe(false); // no type
    expect(isValidDungeon({ ...minimalDungeon(), corridorNotes: [{ note: 'no coords' }] })).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), secretPaths: [{ x1: 1 }] })).toBe(false); // neither schema
  });

  it('rejects a floor that does not match the grid rectangle', () => {
    expect(isValidDungeon({ ...minimalDungeon(), floor: [[0, 1, 0]] })).toBe(false);          // wrong row count
    expect(isValidDungeon({ ...minimalDungeon(), floor: [[0, 1, 0], [0, 1]] })).toBe(false);   // ragged row
    expect(isValidDungeon({ ...minimalDungeon(), floor: [[0, 1, 0], [0, 'x', 0]] })).toBe(false); // non-numeric cell
    expect(isValidDungeon({ ...minimalDungeon(), secretFloor: [[0, 1, 0]] })).toBe(false);     // secretFloor same rules
  });

  it('parseDungeonText rejects at the boundary with a clear error', () => {
    expect(() => parseDungeonText('not json at all')).toThrow(InvalidDungeonFileError);
    expect(() => parseDungeonText('{"not":"a dungeon"}')).toThrow(InvalidDungeonFileError);
    expect(() => parseDungeonText(JSON.stringify({ ...minimalDungeon(), floor: 'x' }))).toThrow(InvalidDungeonFileError);
  });
});

describe('legacy migration (H4)', () => {
  it('migrates a straight legacy path to a single modern segment and stamps the version', () => {
    const migrated = migrateDungeon(JSON.parse(JSON.stringify(legacyDungeon())) as ExternalDungeon);
    expect(migrated.version).toBe(DUNGEON_SCHEMA_VERSION);
    expect(migrated.secretPaths).toEqual([{ x1: 1, y1: 3, x2: 3, y2: 3 }]);
  });

  it('splits an L-shaped legacy path into one modern segment per leg', () => {
    const base = legacyDungeon();
    const horizFirst = migrateDungeon({ ...base, secretPaths: [{ ax: 0, ay: 0, bx: 2, by: 2, horizFirst: true }] } as unknown as ExternalDungeon);
    expect(horizFirst.secretPaths).toEqual([
      { x1: 0, y1: 0, x2: 2, y2: 0 }, // horizontal leg first
      { x1: 2, y1: 0, x2: 2, y2: 2 }, // then vertical leg
    ]);
    const vertFirst = migrateDungeon({ ...base, secretPaths: [{ ax: 0, ay: 0, bx: 2, by: 2, horizFirst: false }] } as unknown as ExternalDungeon);
    expect(vertFirst.secretPaths).toEqual([
      { x1: 0, y1: 0, x2: 0, y2: 2 }, // vertical leg first
      { x1: 0, y1: 2, x2: 2, y2: 2 }, // then horizontal leg
    ]);
  });

  it('passes modern paths through unchanged', () => {
    const modern = { ...legacyDungeon(), secretPaths: [{ x1: 1, y1: 3, x2: 3, y2: 3 }] };
    const migrated = migrateDungeon(JSON.parse(JSON.stringify(modern)) as ExternalDungeon);
    expect(migrated.secretPaths).toEqual([{ x1: 1, y1: 3, x2: 3, y2: 3 }]);
  });

  it('parseDungeonText delivers legacy files already migrated', () => {
    const loaded = parseDungeonText(JSON.stringify(legacyDungeon()));
    expect(loaded.version).toBe(DUNGEON_SCHEMA_VERSION);
    expect(loaded.secretPaths).toEqual([{ x1: 1, y1: 3, x2: 3, y2: 3 }]);
    expect(JSON.stringify(loaded)).not.toMatch(/"ax"|"horizFirst"/);
  });

  it('saving a migrated file emits only the current schema', () => {
    const loaded = parseDungeonText(JSON.stringify(legacyDungeon()));
    const emitted = serializeDungeon(loaded);
    expect(emitted).not.toMatch(/"ax"|"ay"|"bx"|"by"|"horizFirst"/);
    expect(emitted).toContain('"version"');
  });
});
