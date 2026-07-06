import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateDungeon } from 'auto-stuff-generator';
import { serializeDungeon, dungeonFilename, parseDungeonText, isValidDungeon, migrateDungeon, DUNGEON_SCHEMA_VERSION, InvalidDungeonFileError } from './dungeonFile';
import type { Dungeon } from '../model/types';

const V2_FIXTURE = join(__dirname, '../../../e2e/fixtures/seed-c0ffee.dungeon');
const V1_FIXTURE = join(__dirname, '../../../e2e/fixtures/seed-c0ffee-v1.dungeon');

/** Raw generator output — `auto-stuff-generator@0.5.0` emits the current full-name schema. */
function generated(mode: 'empty' | 'full' | 'detailed' = 'full'): Record<string, unknown> {
  return JSON.parse(JSON.stringify(generateDungeon(42, 2, mode))) as Record<string, unknown>;
}

/** Generator output taken through the adoption boundary (stamps the current version). */
function adopted(mode: 'empty' | 'full' | 'detailed' = 'full'): Dungeon {
  return migrateDungeon(generated(mode));
}

/** A minimal hand-built current (full-name) schema dungeon that must always validate. */
function minimalDungeon(): Record<string, unknown> {
  return {
    seed: 7,
    name: 'Tiny Vault',
    depth: 'Depth 1',
    grid: { width: 3, height: 2, cellSize: 24 },
    floor: [[0, 1, 0], [0, 1, 0]],
    rooms: [{ gridX: 1, gridY: 0, width: 1, height: 2 }],
    markers: [{ type: 'entrance', gridX: 1, gridY: 0 }],
    tally: { rooms: 1, foes: 0, traps: 0, loot: 0, secret: 0 },
  };
}

/** A dungeon in the documented version-1 abbreviated schema with an L-schema
    secretPath (ax/ay/bx/by/horizFirst) — exercises the v1 migration branch. */
function legacyDungeon(): Record<string, unknown> {
  const gridWidth = 6, gridHeight = 5;
  const floor = Array.from({ length: gridHeight }, () => new Array<number>(gridWidth).fill(0));
  const floorRowOne = floor[1];
  const floorRowTwo = floor[2];
  if (floorRowOne && floorRowTwo) {
    floorRowOne[1] = floorRowOne[2] = floorRowTwo[1] = floorRowTwo[2] = 1; // one visible room
  }
  const secretFloor = Array.from({ length: gridHeight }, () => new Array<number>(gridWidth).fill(0));
  const secretRowThree = secretFloor[3];
  if (secretRowThree) secretRowThree[1] = secretRowThree[2] = secretRowThree[3] = 1; // a secret run
  return {
    version: 1,
    seed: 123,
    name: 'Old Keep',
    depth: 'Depth 2',
    grid: { gw: gridWidth, gh: gridHeight, cell: 24 },
    floor,
    rooms: [{ x: 1, y: 1, w: 2, h: 2, id: 1 }],
    markers: [{ type: 'secret', x: 2, y: 3, placed: true, seq: 0, ref: 'A', note: 'hi' }],
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

  it('serializes the current full-name schema and stamps version 2', () => {
    const emitted = serializeDungeon(adopted());
    expect(emitted).toMatch(/"width":/);
    expect(emitted).toMatch(/"height":/);
    expect(emitted).toMatch(/"cellSize":/);
    expect(emitted).toMatch(/"version": 2/);
    expect(emitted).not.toMatch(/"gw":/);
    expect(emitted).not.toMatch(/"gh":/);
  });

  it('round-trips the committed v2 E2E fixture byte-for-byte', () => {
    const fixtureText = readFileSync(V2_FIXTURE, 'utf8');
    const loaded = parseDungeonText(fixtureText);
    expect(loaded.grid).toEqual({ width: 23, height: 25, cellSize: 24 });
    expect(loaded.version).toBe(DUNGEON_SCHEMA_VERSION);
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
    expect(isValidDungeon({ ...minimalDungeon(), grid: { width: '3', height: 2, cellSize: 24 } })).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), rooms: [{ gridX: 'a', gridY: 0, width: 1, height: 2 }] })).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), markers: [{ gridX: 1, gridY: 0 }] })).toBe(false); // no type
    expect(isValidDungeon({ ...minimalDungeon(), corridorNotes: [{ note: 'no coords' }] })).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), secretPaths: [{ startX: 1 }] })).toBe(false); // incomplete endpoints
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
    // R3: a file missing `tally` must be rejected as InvalidDungeonFileError here,
    // not slip through and throw a raw TypeError later in rendering.
    const { tally, ...noTally } = minimalDungeon();          // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(() => parseDungeonText(JSON.stringify(noTally))).toThrow(InvalidDungeonFileError);
    // A v1 abbreviated file missing tally is rejected on the legacy branch too.
    const { tally: legacyTally, ...legacyNoTally } = legacyDungeon(); // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(() => parseDungeonText(JSON.stringify(legacyNoTally))).toThrow(InvalidDungeonFileError);
  });

  it('rejects files missing required tally/name/depth or with a non-numeric tally count (R3)', () => {
    const { tally, ...noTally } = minimalDungeon();          // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(isValidDungeon(noTally)).toBe(false);              // missing tally would crash domRenderer on tally.rooms
    const { name, ...noName } = minimalDungeon();             // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(isValidDungeon(noName)).toBe(false);
    const { depth, ...noDepth } = minimalDungeon();           // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(isValidDungeon(noDepth)).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), tally: { rooms: 1, foes: 0, traps: 0, loot: 0 } })).toBe(false); // missing count
    expect(isValidDungeon({ ...minimalDungeon(), tally: { rooms: 1, foes: 0, traps: 0, loot: 0, secret: 'x' } })).toBe(false); // non-numeric count
    expect(isValidDungeon({ ...minimalDungeon(), tally: [] })).toBe(false); // wrong shape
    expect(isValidDungeon({ ...minimalDungeon(), name: 7 })).toBe(false);
    expect(isValidDungeon({ ...minimalDungeon(), depth: null })).toBe(false);
  });

  it('rejects non-integer or out-of-bounds coordinates (C4-bounds)', () => {
    // grid is width:3, height:2 — anything at or past those bounds, or fractional, is invalid.
    expect(isValidDungeon({ ...minimalDungeon(), markers: [{ type: 'monster', gridX: 9999, gridY: 0 }] })).toBe(false); // off-canvas
    expect(isValidDungeon({ ...minimalDungeon(), markers: [{ type: 'monster', gridX: 1.5, gridY: 0 }] })).toBe(false);  // fractional
    expect(isValidDungeon({ ...minimalDungeon(), markers: [{ type: 'monster', gridX: -1, gridY: 0 }] })).toBe(false);   // negative
    expect(isValidDungeon({ ...minimalDungeon(), markers: [{ type: 'monster', gridX: 3, gridY: 0 }] })).toBe(false);    // gridX === width
    expect(isValidDungeon({ ...minimalDungeon(), rooms: [{ gridX: 1, gridY: 0, width: 3, height: 2 }] })).toBe(false);  // gridX+width > width
    expect(isValidDungeon({ ...minimalDungeon(), rooms: [{ gridX: 0, gridY: 0, width: 1.5, height: 2 }] })).toBe(false);// fractional dim
    expect(isValidDungeon({ ...minimalDungeon(), secretRooms: [{ gridX: 0, gridY: 0, width: 4, height: 2 }] })).toBe(false); // secret room spills
    expect(isValidDungeon({ ...minimalDungeon(), secretPaths: [{ startX: 0, startY: 0, endX: 99, endY: 0 }] })).toBe(false); // endpoint off-canvas
    expect(isValidDungeon({ ...minimalDungeon(), secretPaths: [{ startX: 0, startY: 0, endX: 1.5, endY: 0 }] })).toBe(false); // fractional endpoint
  });

  it('accepts genuine generator output across modes/seeds/levels and existing fixtures (no over-rejection)', () => {
    for (const mode of ['empty', 'full', 'detailed'] as const) {
      for (const [seed, level] of [[42, 2], [1, 1], [999, 5], [0xc0ffee, 3]] as const) {
        expect(isValidDungeon(JSON.parse(JSON.stringify(generateDungeon(seed, level, mode))))).toBe(true);
      }
    }
    expect(isValidDungeon(JSON.parse(readFileSync(V2_FIXTURE, 'utf8')))).toBe(true);
    expect(isValidDungeon(minimalDungeon())).toBe(true);
  });
});

describe('version-1 → current migration (Directive 2 file format v2)', () => {
  it('maps a v1 abbreviated file field-by-field to the current schema and stamps version 2', () => {
    const migrated = parseDungeonText(JSON.stringify(legacyDungeon()));
    expect(migrated.version).toBe(DUNGEON_SCHEMA_VERSION);
    expect(migrated.grid).toEqual({ width: 6, height: 5, cellSize: 24 });
    expect(migrated.rooms[0]).toEqual({ gridX: 1, gridY: 1, width: 2, height: 2, id: 1 });
    expect(migrated.markers[0]).toEqual({ type: 'secret', gridX: 2, gridY: 3, placed: true, sequence: 0, referenceLabel: 'A', note: 'hi' });
    expect(JSON.stringify(migrated)).not.toMatch(/"gw"|"gh"|"cell"|"\bx\b"|"dir"|"seq"|"ref"|"x1"/);
  });

  it('migrates a straight legacy L-path to a single modern segment', () => {
    const migrated = parseDungeonText(JSON.stringify(legacyDungeon()));
    expect(migrated.secretPaths).toEqual([{ startX: 1, startY: 3, endX: 3, endY: 3 }]);
  });

  it('splits an L-shaped legacy path into one modern segment per leg', () => {
    const base = legacyDungeon();
    const horizFirst = migrateDungeon({ ...base, secretPaths: [{ ax: 0, ay: 0, bx: 2, by: 2, horizFirst: true }] });
    expect(horizFirst.secretPaths).toEqual([
      { startX: 0, startY: 0, endX: 2, endY: 0 }, // horizontal leg first
      { startX: 2, startY: 0, endX: 2, endY: 2 }, // then vertical leg
    ]);
    const vertFirst = migrateDungeon({ ...base, secretPaths: [{ ax: 0, ay: 0, bx: 2, by: 2, horizFirst: false }] });
    expect(vertFirst.secretPaths).toEqual([
      { startX: 0, startY: 0, endX: 0, endY: 2 }, // vertical leg first
      { startX: 0, startY: 2, endX: 2, endY: 2 }, // then horizontal leg
    ]);
  });

  it('passes a v1 straight path through to the renamed modern form', () => {
    const modern = { ...legacyDungeon(), secretPaths: [{ x1: 1, y1: 3, x2: 3, y2: 3 }] };
    const migrated = migrateDungeon(JSON.parse(JSON.stringify(modern)));
    expect(migrated.secretPaths).toEqual([{ startX: 1, startY: 3, endX: 3, endY: 3 }]);
  });

  it('parseDungeonText delivers legacy files already migrated with no abbreviated keys', () => {
    const loaded = parseDungeonText(JSON.stringify(legacyDungeon()));
    expect(loaded.version).toBe(DUNGEON_SCHEMA_VERSION);
    expect(loaded.secretPaths).toEqual([{ startX: 1, startY: 3, endX: 3, endY: 3 }]);
    expect(JSON.stringify(loaded)).not.toMatch(/"ax"|"horizFirst"/);
  });

  it('saving a migrated file emits only the current schema', () => {
    const loaded = parseDungeonText(JSON.stringify(legacyDungeon()));
    const emitted = serializeDungeon(loaded);
    expect(emitted).not.toMatch(/"ax"|"ay"|"bx"|"by"|"horizFirst"/);
    expect(emitted).toMatch(/"version": 2/);
  });

  it('the retained v1 fixture migrates to the identical model as the v2 fixture (round-trip proof)', () => {
    const fromV1 = parseDungeonText(readFileSync(V1_FIXTURE, 'utf8'));
    const fromV2 = parseDungeonText(readFileSync(V2_FIXTURE, 'utf8'));
    expect(fromV1).toEqual(fromV2);
    // v1 → internal → save(v2) → load → deep-equal internal
    const reloaded = parseDungeonText(serializeDungeon(fromV1));
    expect(reloaded).toEqual(fromV1);
  });
});
