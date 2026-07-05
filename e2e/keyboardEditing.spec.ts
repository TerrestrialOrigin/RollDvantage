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

test('map surface and legend buttons are tab-reachable with a visible focus indicator', async ({ page }) => {
  await tabTo(page, '#dm-map');
  const mapOutline = await page.evaluate(() => getComputedStyle(document.querySelector('#dm-map')!).outlineStyle);
  expect(mapOutline).toBe('solid');

  await tabTo(page, '.legend-item[data-marker-type="entrance"]');
  const buttonOutline = await page.evaluate(
    () => getComputedStyle(document.querySelector('.legend-item[data-marker-type="entrance"]')!).outlineStyle);
  expect(buttonOutline).toBe('solid');
});
