import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, 'fixtures/seed-c0ffee.dungeon');

/* ============================================================
   E2E — accessible map editing (H5). Real browser, full `npm run dev` stack,
   no mocks. Everything here is driven by the KEYBOARD: an arrow-key cell
   cursor over the DM map, Enter/Space acting at the cursor, focusable legend
   tool buttons, accessible map names, and visible focus indicators.
   ============================================================ */

test.use({ viewport: { width: 1400, height: 2400 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('#dm-map svg');
  await page.setInputFiles('#file-load', FIXTURE);            // deterministic map
  await expect(page.locator('#dungeon-name-dm')).toHaveText('The Mansion');
});

/** Grid geometry + occupancy read from the live page (no mocks). */
interface GridInfo {
  gridWidth: number; gridHeight: number;
  floorCells: string[];                                        // "x,y" keys of base-floor cells
}
async function readGrid(page: Page): Promise<GridInfo> {
  return page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('#dm-map svg')!;
    const viewBox = svg.viewBox.baseVal;
    const firstFloorRect = svg.querySelector<SVGRectElement>('.floor rect')!;
    const cell = parseFloat(firstFloorRect.getAttribute('width')!);
    const floorCells: string[] = [];
    svg.querySelectorAll<SVGRectElement>('.floor rect').forEach((rect) => {
      const cellX = Math.round(parseFloat(rect.getAttribute('x')!) / cell);
      const cellY = Math.round(parseFloat(rect.getAttribute('y')!) / cell);
      floorCells.push(cellX + ',' + cellY);
    });
    return { gridWidth: Math.round(viewBox.width / cell), gridHeight: Math.round(viewBox.height / cell), floorCells };
  });
}

/** Current keyboard-cursor grid position, read from the live cursor rect. */
async function cursorPosition(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('#dm-map svg')!;
    const rect = svg.querySelector('#kbd-cursor rect')!;
    const cell = parseFloat(rect.getAttribute('width')!);
    return { x: Math.round(parseFloat(rect.getAttribute('x')!) / cell), y: Math.round(parseFloat(rect.getAttribute('y')!) / cell) };
  });
}

/** Focus the map surface and walk the cursor to an exact grid cell: clamp into
    the top-left corner (a known position), then step to the target. */
async function moveCursorTo(page: Page, targetX: number, targetY: number): Promise<void> {
  const grid = await readGrid(page);
  await page.locator('#dm-map').focus();
  for (let step = 0; step < grid.gridWidth; step++) await page.keyboard.press('ArrowLeft');
  for (let step = 0; step < grid.gridHeight; step++) await page.keyboard.press('ArrowUp');
  for (let step = 0; step < targetX; step++) await page.keyboard.press('ArrowRight');
  for (let step = 0; step < targetY; step++) await page.keyboard.press('ArrowDown');
}

/** A floor cell with no marker on it (placeable). Marker glyphs bake absolute
    coordinates in, so occupancy is derived from each glyph's bbox center. */
async function findPlaceableCell(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('#dm-map svg')!;
    const firstFloorRect = svg.querySelector<SVGRectElement>('.floor rect')!;
    const cell = parseFloat(firstFloorRect.getAttribute('width')!);
    const occupied = new Set<string>();
    svg.querySelectorAll('g.mk').forEach((marker) => {
      const box = (marker as SVGGElement).getBBox();
      const centerX = box.x + box.width / 2, centerY = box.y + box.height / 2;
      occupied.add(Math.floor(centerX / cell) + ',' + Math.floor(centerY / cell));
    });
    const floorRects = Array.from(svg.querySelectorAll<SVGRectElement>('.floor rect'));
    for (const rect of floorRects) {
      const cellX = Math.round(parseFloat(rect.getAttribute('x')!) / cell);
      const cellY = Math.round(parseFloat(rect.getAttribute('y')!) / cell);
      if (!occupied.has(cellX + ',' + cellY)) return { x: cellX, y: cellY };
    }
    throw new Error('no placeable cell found');
  });
}

/** An empty (non-floor) cell, for denial + room-building tests. */
async function findEmptyCell(page: Page): Promise<{ x: number; y: number }> {
  const grid = await readGrid(page);
  const floor = new Set(grid.floorCells);
  for (let y = 0; y < grid.gridHeight; y++) {
    for (let x = 0; x < grid.gridWidth; x++) {
      if (!floor.has(x + ',' + y)) return { x, y };
    }
  }
  throw new Error('no empty cell found');
}

/** Press Tab (bounded) until the element matching `selector` has focus. Proves
    the target is genuinely keyboard-reachable and yields real :focus-visible. */
async function tabTo(page: Page, selector: string, maxPresses = 80): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());  // reset focus
  for (let press = 0; press < maxPresses; press++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(
      (targetSelector) => document.activeElement === document.querySelector(targetSelector), selector);
    if (focused) return;
  }
  throw new Error('never reached ' + selector + ' by Tab');
}

test('arrow keys move a visible cell cursor that clamps at the grid edge', async ({ page }) => {
  await page.locator('#dm-map').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#kbd-cursor rect')).toHaveCount(1);

  const grid = await readGrid(page);
  for (let step = 0; step < grid.gridWidth + 5; step++) await page.keyboard.press('ArrowLeft');
  for (let step = 0; step < grid.gridHeight + 5; step++) await page.keyboard.press('ArrowUp');
  expect(await cursorPosition(page)).toEqual({ x: 0, y: 0 });        // clamped, never left the grid

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  expect(await cursorPosition(page)).toEqual({ x: 1, y: 1 });

  // the polite live region announces the cursor position and available action
  await expect(page.locator('#mode-hint')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#mode-hint')).toContainText('Row 2, column 2');
});

test('keyboard-selected legend tool places a marker at the cursor; cursor survives the re-render', async ({ page }) => {
  const before = await page.locator('#dm-map .mk').count();
  const target = await findPlaceableCell(page);

  const monsterButton = page.locator('.legend-item[data-marker-type="monster"]');
  await monsterButton.focus();
  await page.keyboard.press('Enter');
  await expect(monsterButton).toHaveAttribute('aria-pressed', 'true');

  await moveCursorTo(page, target.x, target.y);
  await page.keyboard.press('Enter');

  await expect(page.locator('#dm-map .mk')).toHaveCount(before + 1);
  await expect(page.locator('#kbd-cursor rect')).toHaveCount(1);     // repainted after the edit re-render
  expect(await cursorPosition(page)).toEqual(target);
});

test('placement on a non-floor cell is denied — dungeon unchanged (denial)', async ({ page }) => {
  const before = await page.locator('#dm-map .mk').count();
  const floorBefore = await page.locator('#dm-map .floor rect').count();
  const empty = await findEmptyCell(page);

  await page.locator('.legend-item[data-marker-type="monster"]').click();
  await moveCursorTo(page, empty.x, empty.y);
  await page.keyboard.press('Enter');
  await page.keyboard.press(' ');

  await expect(page.locator('#dm-map .mk')).toHaveCount(before);
  await expect(page.locator('#dm-map .floor rect')).toHaveCount(floorBefore);
});

test('adds a room entirely by keyboard', async ({ page }) => {
  const floorBefore = await page.locator('#dm-map .floor rect').count();
  const corner = await findEmptyCell(page);

  await page.click('#btn-room');
  await moveCursorTo(page, corner.x, corner.y);
  await page.keyboard.press('Enter');                                 // anchor
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#mapfx rect')).toHaveCount(1);           // live preview while extending
  await page.keyboard.press('Enter');                                 // commit

  const floorAfter = await page.locator('#dm-map .floor rect').count();
  expect(floorAfter).toBeGreaterThan(floorBefore);                    // 2x2 region contains new floor
});

test('adds a corridor entirely by keyboard', async ({ page }) => {
  const grid = await readGrid(page);
  const floorSet = new Set(grid.floorCells);
  const floorBefore = grid.floorCells.length;

  // start on floor (required), end on an empty cell in the same row/column area
  const start = await findPlaceableCell(page);
  let end: { x: number; y: number } | null = null;
  for (let distance = 2; distance < grid.gridWidth && !end; distance++) {
    const candidateX = start.x + distance;
    if (candidateX < grid.gridWidth && !floorSet.has(candidateX + ',' + start.y)) end = { x: candidateX, y: start.y };
  }
  expect(end, 'fixture must have an empty cell right of a floor cell').not.toBeNull();

  await page.click('#btn-corridor');
  await moveCursorTo(page, start.x, start.y);
  await page.keyboard.press('Enter');                                 // set corridor start
  for (let step = start.x; step < end!.x; step++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');                                 // commit corridor

  await expect
    .poll(async () => (await page.locator('#dm-map .floor rect').count()))
    .toBeGreaterThan(floorBefore);
});

test('deletes a region entirely by keyboard', async ({ page }) => {
  const floorBefore = await page.locator('#dm-map .floor rect').count();
  const target = await findPlaceableCell(page);

  await page.click('#btn-delete');
  await moveCursorTo(page, target.x, target.y);
  await page.keyboard.press('Enter');                                 // anchor
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');                                 // erase 2x1 region

  const floorAfter = await page.locator('#dm-map .floor rect').count();
  expect(floorAfter).toBeLessThan(floorBefore);
});

test('Escape cancels a pending keyboard rectangle but stays in the mode; second Escape exits', async ({ page }) => {
  const target = await findPlaceableCell(page);
  await page.click('#btn-room');
  await moveCursorTo(page, target.x, target.y);
  await page.keyboard.press('Enter');                                 // anchor
  await expect(page.locator('#mapfx rect')).toHaveCount(1);

  await page.keyboard.press('Escape');                                // cancel anchor only
  await expect(page.locator('#mapfx')).toHaveCount(0);
  await expect(page.locator('#btn-room')).toHaveClass(/active/);      // still in Room mode

  await page.keyboard.press('Escape');                                // now exit the mode
  await expect(page.locator('#btn-room')).not.toHaveClass(/active/);
});

test('annotates a room by keyboard: Enter opens the note dialog, saving adds a Contents Key entry', async ({ page }) => {
  const entriesBefore = await page.locator('.ck-box').count();

  // find a room cell: any floor cell inside a room outline — use a placeable
  // cell and rely on the modal opening for room/corridor/marker alike
  const target = await findPlaceableCell(page);
  await moveCursorTo(page, target.x, target.y);
  await page.keyboard.press('Enter');                                 // no tool active -> annotate

  await expect(page.locator('#note-modal')).toBeVisible();
  await page.locator('#note-text').fill('Keyboard-added note');
  await page.click('#note-save');
  await expect(page.locator('#note-modal')).toBeHidden();

  await expect(page.locator('.ck-box')).toHaveCount(entriesBefore + 1);
});

test('legend tool selection and structure modes are mutually exclusive', async ({ page }) => {
  const monsterButton = page.locator('.legend-item[data-marker-type="monster"]');
  await monsterButton.click();
  await expect(monsterButton).toHaveAttribute('aria-pressed', 'true');

  await page.click('#btn-room');                                      // activating a mode clears the tool
  await expect(monsterButton).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#btn-room')).toHaveClass(/active/);

  await monsterButton.click();                                        // selecting a tool clears the mode
  await expect(monsterButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#btn-room')).not.toHaveClass(/active/);
});

test('arrow keys and Space are not hijacked while editing text', async ({ page }) => {
  const nameField = page.locator('#dungeon-name-dm');
  await nameField.click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press(' ');
  await expect(page.locator('#kbd-cursor')).toHaveCount(0);           // no map cursor appeared
  // the space was typed into the text (caret position varies), the name text survives
  const nameText = (await nameField.textContent())!.replace(/\s/g, '');
  expect(nameText).toContain('TheMansion');
});

test('both maps expose accessible names; the DM name carries room count and depth', async ({ page }) => {
  await expect(page.getByRole('img', { name: /The Mansion — Game Master's map: \d+ rooms, depth/ })).toHaveCount(1);
  await expect(page.getByRole('img', { name: /The Mansion — player map/ })).toHaveCount(1);
});

/** Grid cells occupied by a marker glyph, as "x,y" keys (glyphs bake absolute
    coordinates in, so occupancy comes from each glyph's bbox center). */
async function occupiedCells(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('#dm-map svg')!;
    const firstFloorRect = svg.querySelector<SVGRectElement>('.floor rect')!;
    const cell = parseFloat(firstFloorRect.getAttribute('width')!);
    const cells: string[] = [];
    svg.querySelectorAll('g.mk').forEach((marker) => {
      const box = (marker as SVGGElement).getBBox();
      cells.push(Math.floor((box.x + box.width / 2) / cell) + ',' + Math.floor((box.y + box.height / 2) / cell));
    });
    return cells;
  });
}

/** Step the (already-focused) cursor by a grid delta with arrow presses — used
    while holding a marker, so re-focusing (which would cancel the pickup) is avoided. */
async function stepBy(page: Page, deltaX: number, deltaY: number): Promise<void> {
  for (let step = 0; step < Math.abs(deltaX); step++) await page.keyboard.press(deltaX > 0 ? 'ArrowRight' : 'ArrowLeft');
  for (let step = 0; step < Math.abs(deltaY); step++) await page.keyboard.press(deltaY > 0 ? 'ArrowDown' : 'ArrowUp');
}

/** Place a monster marker at a cell entirely by keyboard, then deselect the tool. */
async function placeMonsterAt(page: Page, cell: { x: number; y: number }): Promise<void> {
  const monsterButton = page.locator('.legend-item[data-marker-type="monster"]');
  await monsterButton.click();
  await moveCursorTo(page, cell.x, cell.y);
  await page.keyboard.press('Enter');
  await monsterButton.click();                                  // toggle the tool back off
  await expect(monsterButton).toHaveAttribute('aria-pressed', 'false');
}

test('picks up a placed marker with M and drops it on a new floor cell (Enter)', async ({ page }) => {
  const before = await page.locator('#dm-map .mk').count();
  const origin = await findPlaceableCell(page);
  await placeMonsterAt(page, origin);
  await expect(page.locator('#dm-map .mk')).toHaveCount(before + 1);

  const destination = await findPlaceableCell(page);              // origin now occupied → a fresh cell
  expect(destination).not.toEqual(origin);

  await moveCursorTo(page, origin.x, origin.y);
  await page.keyboard.press('m');                                 // pick up
  await expect(page.locator('#kbd-cursor rect.holding')).toHaveCount(1);   // distinct "holding" cursor
  await stepBy(page, destination.x - origin.x, destination.y - origin.y);
  await page.keyboard.press('Enter');                             // drop

  await expect(page.locator('#dm-map .mk')).toHaveCount(before + 1);       // moved, not duplicated
  const occupied = await occupiedCells(page);
  expect(occupied).toContain(destination.x + ',' + destination.y);
  expect(occupied).not.toContain(origin.x + ',' + origin.y);
});

test('a keyboard-moved marker carries its note to the new cell', async ({ page }) => {
  const origin = await findPlaceableCell(page);
  await placeMonsterAt(page, origin);

  // annotate the marker (no tool active → Enter annotates the feature at the cell)
  await moveCursorTo(page, origin.x, origin.y);
  await page.keyboard.press('Enter');
  await expect(page.locator('#note-modal')).toBeVisible();
  await page.locator('#note-text').fill('Sentinel');
  await page.click('#note-save');
  await expect(page.locator('#note-modal')).toBeHidden();

  // move it by keyboard
  const destination = await findPlaceableCell(page);
  await moveCursorTo(page, origin.x, origin.y);
  await page.keyboard.press('m');
  await stepBy(page, destination.x - origin.x, destination.y - origin.y);
  await page.keyboard.press('Enter');

  // re-open the note at the destination — the marker (prioritised over rooms) kept its text
  await moveCursorTo(page, destination.x, destination.y);
  await page.keyboard.press('Enter');
  await expect(page.locator('#note-modal')).toBeVisible();
  await expect(page.locator('#note-text')).toHaveValue('Sentinel');
});

test('dropping a held marker on a non-floor cell is denied — marker unchanged (denial)', async ({ page }) => {
  const before = await page.locator('#dm-map .mk').count();
  const origin = await findPlaceableCell(page);
  await placeMonsterAt(page, origin);
  const empty = await findEmptyCell(page);

  await moveCursorTo(page, origin.x, origin.y);
  await page.keyboard.press('m');
  await stepBy(page, empty.x - origin.x, empty.y - origin.y);
  await page.keyboard.press('Enter');                            // denied — empty cell is not placeable

  await expect(page.locator('#dm-map .mk')).toHaveCount(before + 1);
  const occupied = await occupiedCells(page);
  expect(occupied).toContain(origin.x + ',' + origin.y);         // still at origin
  expect(occupied).not.toContain(empty.x + ',' + empty.y);
});

test('Escape cancels a keyboard pickup — marker stays put', async ({ page }) => {
  const origin = await findPlaceableCell(page);
  await placeMonsterAt(page, origin);
  const destination = await findPlaceableCell(page);

  await moveCursorTo(page, origin.x, origin.y);
  await page.keyboard.press('m');
  await stepBy(page, destination.x - origin.x, destination.y - origin.y);
  await page.keyboard.press('Escape');                           // cancel the pickup
  await page.keyboard.press('Enter');                            // no longer holding → would annotate, not move

  const occupied = await occupiedCells(page);
  expect(occupied).toContain(origin.x + ',' + origin.y);         // marker never left origin
  expect(occupied).not.toContain(destination.x + ',' + destination.y);
});

test('T cycles a marker type forward and Shift+T backward, announced in the live region', async ({ page }) => {
  const origin = await findPlaceableCell(page);
  await placeMonsterAt(page, origin);

  await moveCursorTo(page, origin.x, origin.y);
  await expect(page.locator('#mode-hint')).toContainText('monster marker');   // cursor on the monster
  await expect(page.locator('#mode-hint')).toContainText('T to change type');  // gesture is discoverable

  await page.keyboard.press('t');                                // monster → boss
  await expect(page.locator('#mode-hint')).toContainText('boss marker');

  await page.keyboard.press('Shift+T');                          // boss → monster
  await expect(page.locator('#mode-hint')).toContainText('monster marker');
});

/* ---- Secret (S) badge (R1): the badge's position IS the secret status of the
   floor beneath it. Keyboard move must relocate the SECRET (not orphan the badge),
   and keyboard retype must never cycle the badge into a placeable type. The
   seed-c0ffee fixture ships one (S) badge at (15,12) on a vertical secret passage. */

const SECRET_FILL = 'oklch(0.905 0.05 80)';                     // palette.ts SECRET_FILL — the DM secret-floor tint

interface SecretState {
  baseFloor: string[];                                          // "x,y" of visible base-floor cells
  secretFloor: string[];                                        // "x,y" of secret-floor (gold-tint) cells
  secretBadges: string[];                                       // "x,y" of every (S) badge glyph
}

/** Read the DM map's secret geometry straight from the live SVG (no mocks). */
async function readSecretState(page: Page): Promise<SecretState> {
  return page.evaluate((secretFill) => {
    const svg = document.querySelector<SVGSVGElement>('#dm-map svg')!;
    const firstFloorRect = svg.querySelector<SVGRectElement>('.floor rect')!;
    const cell = parseFloat(firstFloorRect.getAttribute('width')!);
    const baseFloor: string[] = [], secretFloor: string[] = [];
    svg.querySelectorAll<SVGRectElement>('.floor rect').forEach((rect) => {
      const cellX = Math.round(parseFloat(rect.getAttribute('x')!) / cell);
      const cellY = Math.round(parseFloat(rect.getAttribute('y')!) / cell);
      (rect.getAttribute('fill') === secretFill ? secretFloor : baseFloor).push(cellX + ',' + cellY);
    });
    const secretBadges: string[] = [];
    svg.querySelectorAll('g.mk').forEach((group) => {
      const letter = group.querySelector('text.mk-gold');
      if (letter?.textContent === 'S') {
        const box = (group as SVGGElement).getBBox();
        secretBadges.push(Math.floor((box.x + box.width / 2) / cell) + ',' + Math.floor((box.y + box.height / 2) / cell));
      }
    });
    return { baseFloor, secretFloor, secretBadges };
  }, SECRET_FILL);
}

test('keyboard-moving the (S) badge relocates the secret and never orphans the badge (R1)', async ({ page }) => {
  const before = await readSecretState(page);
  const badge = { x: 15, y: 12 };
  expect(before.secretBadges, 'fixture ships one (S) badge at 15,12').toContain(badge.x + ',' + badge.y);
  expect(before.secretFloor).toContain(badge.x + ',' + badge.y);

  // pick a convertible destination: any visible base-floor cell not occupied by a marker
  const occupied = new Set(await occupiedCells(page));
  const destination = before.baseFloor
    .map((key) => { const [x, y] = key.split(',').map(Number); return { key, x: x!, y: y! }; })
    .find((candidate) => !occupied.has(candidate.key));
  expect(destination, 'fixture must have a free base-floor destination').toBeTruthy();

  await moveCursorTo(page, badge.x, badge.y);
  await page.keyboard.press('m');                                // pick up the (S) badge
  await expect(page.locator('#kbd-cursor rect.holding')).toHaveCount(1);
  await stepBy(page, destination!.x - badge.x, destination!.y - badge.y);
  await page.keyboard.press('Enter');                            // drop → moves the SECRET

  // positive signals first: the destination became secret AND the origin returned to visible floor
  await expect.poll(async () => (await readSecretState(page)).secretFloor)
    .toContain(destination!.x + ',' + destination!.y);
  const after = await readSecretState(page);
  expect(after.baseFloor).toContain(badge.x + ',' + badge.y);   // origin un-secreted (secret relocated)
  expect(after.secretFloor).not.toContain(badge.x + ',' + badge.y);
  // no (S) badge is stranded on non-secret floor — the corruption this change fixes
  for (const badgeCell of after.secretBadges) expect(after.secretFloor).toContain(badgeCell);
});

test('keyboard retype (t) on the (S) badge is a no-op — the secret is never cycled away (R1)', async ({ page }) => {
  const badge = { x: 15, y: 12 };
  const before = await readSecretState(page);
  expect(before.secretBadges).toContain(badge.x + ',' + badge.y);

  await moveCursorTo(page, badge.x, badge.y);
  await expect(page.locator('#mode-hint')).toContainText('M to move the secret');   // no "T to change type"
  await page.keyboard.press('t');
  await page.keyboard.press('Shift+T');

  const after = await readSecretState(page);
  expect(after.secretBadges).toContain(badge.x + ',' + badge.y);   // still an (S) badge (would become 'boss' before the fix)
  expect(after.secretFloor).toContain(badge.x + ',' + badge.y);    // secret floor intact
});

test('undo while holding a marker releases the hold — a later Enter annotates, never drops a stale index (N1)', async ({ page }) => {
  const baseline = await page.locator('#dm-map .mk').count();
  const origin = await findPlaceableCell(page);
  await placeMonsterAt(page, origin);
  await expect(page.locator('#dm-map .mk')).toHaveCount(baseline + 1);

  // Pick the marker up, then undo the placement out from under the hold.
  await moveCursorTo(page, origin.x, origin.y);
  await page.keyboard.press('m');
  await expect(page.locator('#kbd-cursor rect.holding')).toHaveCount(1);   // holding
  await page.keyboard.press('Control+z');                                  // restores the pre-placement snapshot

  // Durable consequence 1: the placement is undone and the hold is released
  // (the "holding" cursor reverts to the plain cursor after the re-render).
  await expect(page.locator('#dm-map .mk')).toHaveCount(baseline);
  await expect(page.locator('#kbd-cursor rect.holding')).toHaveCount(0);
  await expect(page.locator('#kbd-cursor rect')).toHaveCount(1);

  // Durable consequence 2: Enter now falls through to annotate (hold released),
  // rather than dropping a marker at the now-stale index.
  await page.keyboard.press('Enter');
  await expect(page.locator('#note-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#note-modal')).toBeHidden();
  await expect(page.locator('#dm-map .mk')).toHaveCount(baseline);         // no marker moved or created
});

test('map surface and legend buttons are tab-reachable with a visible focus indicator', async ({ page }) => {
  await tabTo(page, '#dm-map');
  const mapOutline = await page.evaluate(() => getComputedStyle(document.querySelector('#dm-map')!).outlineStyle);
  expect(mapOutline).toBe('solid');

  await tabTo(page, '.legend-item[data-marker-type="entrance"]');
  const buttonOutline = await page.evaluate(
    () => getComputedStyle(document.querySelector('.legend-item[data-marker-type="entrance"]')!).outlineStyle);
  expect(buttonOutline).toBe('solid');
});

/* ---- Keyboard context menu (R2): the ContextMenu key / Shift+F10 opens the same
   accessible cell menu the pointer opens on right-click, at the cursor cell — giving
   keyboard parity for the otherwise pointer-only Delete-one-marker and Make-Not-Secret.
   Every menu action still routes through the DungeonEditor verbs. ---- */

test('Shift+F10 opens the cell menu at the cursor; Delete removes one marker without destroying floor (R2)', async ({ page }) => {
  const floorBefore = await page.locator('#dm-map .floor rect').count();
  const before = await page.locator('#dm-map .mk').count();
  const origin = await findPlaceableCell(page);
  await placeMonsterAt(page, origin);
  await expect(page.locator('#dm-map .mk')).toHaveCount(before + 1);

  await moveCursorTo(page, origin.x, origin.y);
  await page.keyboard.press('Shift+F10');                          // open the cell menu at the cursor

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeFocused();   // focus on the first item
  await page.keyboard.press('Enter');                             // activate Delete by keyboard

  await expect(page.getByRole('menu')).toHaveCount(0);            // menu closed
  await expect(page.locator('#dm-map .mk')).toHaveCount(before);  // exactly the one marker is gone
  await expect(page.locator('#dm-map .floor rect')).toHaveCount(floorBefore);   // floor intact — Delete-mode would shrink it
});

test('the (S) badge cell menu offers Make Not Secret by keyboard (R2)', async ({ page }) => {
  const badge = { x: 15, y: 12 };
  const before = await readSecretState(page);
  expect(before.secretBadges, 'fixture ships one (S) badge at 15,12').toContain(badge.x + ',' + badge.y);

  await moveCursorTo(page, badge.x, badge.y);
  await page.keyboard.press('ContextMenu');                       // the dedicated Menu key

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');                         // Delete -> Make Not Secret
  const makeNotSecret = menu.getByRole('menuitem', { name: 'Make Not Secret' });
  await expect(makeNotSecret).toBeFocused();
  await page.keyboard.press('Enter');                             // un-secret via editor.unmakeSecret

  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect.poll(async () => (await readSecretState(page)).secretBadges).not.toContain(badge.x + ',' + badge.y);
  const after = await readSecretState(page);
  expect(after.secretFloor).not.toContain(badge.x + ',' + badge.y);   // no longer secret floor
  expect(after.baseFloor).toContain(badge.x + ',' + badge.y);         // reverted to visible floor
});

test('the menu key on an empty cell opens no menu (denial) though it opens on a feature cell (R2)', async ({ page }) => {
  const before = await page.locator('#dm-map .mk').count();
  const floorBefore = await page.locator('#dm-map .floor rect').count();

  // control: the same key DOES open a menu on a real feature cell (distinguishes
  // "correctly absent" from "the key does nothing")
  const feature = await findPlaceableCell(page);
  await moveCursorTo(page, feature.x, feature.y);
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // denial: on empty/void space the same key opens nothing and mutates nothing
  const empty = await findEmptyCell(page);
  await moveCursorTo(page, empty.x, empty.y);
  await expect(page.locator('#kbd-cursor rect')).toHaveCount(1);   // positive signal: the cursor is on the empty cell
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toHaveCount(0);             // no menu opened
  await expect(page.locator('#dm-map .mk')).toHaveCount(before);   // dungeon unchanged
  await expect(page.locator('#dm-map .floor rect')).toHaveCount(floorBefore);
});

test('a keyboard-opened cell menu exposes menuitems and restores focus to the map on Escape (R2)', async ({ page }) => {
  const origin = await findPlaceableCell(page);
  await placeMonsterAt(page, origin);

  await moveCursorTo(page, origin.x, origin.y);
  await page.keyboard.press('Shift+F10');

  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem').first()).toBeFocused();   // focus moved into the menu
  await page.keyboard.press('Escape');

  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => document.activeElement?.id)).toBe('dm-map');   // focus back on the map
  await expect(page.locator('#kbd-cursor rect')).toHaveCount(1);     // cursor still present
});
