import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, 'fixtures/seed-c0ffee.dungeon');

/* ============================================================
   E2E — accessible dialogs and menus (H6). Real browser, full `npm run dev`
   stack, no mocks. The note modal and gen-warn dialog are ARIA dialogs that
   trap Tab, close on Escape from any control, and restore focus to their
   opener; the context and generate menus are ARIA menus with arrow-key
   navigation; Contents-Key entries are keyboard-activatable buttons.
   ============================================================ */

test.use({ viewport: { width: 1400, height: 2400 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('#dm-map svg');
  await page.setInputFiles('#file-load', FIXTURE);            // deterministic map
  await expect(page.locator('#dungeon-name-dm')).toHaveText('The Mansion');
});

/** Grid dimensions read from the live page (no mocks). */
async function gridSize(page: Page): Promise<{ gridWidth: number; gridHeight: number }> {
  return page.evaluate(() => {
    const svg = document.querySelector('#dm-map svg') as SVGSVGElement;
    const viewBox = svg.viewBox.baseVal;
    const firstFloorRect = svg.querySelector('.floor rect') as SVGRectElement;
    const cell = parseFloat(firstFloorRect.getAttribute('width')!);
    return { gridWidth: Math.round(viewBox.width / cell), gridHeight: Math.round(viewBox.height / cell) };
  });
}

/** Grid coordinates of the first floor cell — always an annotatable feature. */
async function firstFloorCell(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const svg = document.querySelector('#dm-map svg') as SVGSVGElement;
    const rect = svg.querySelector('.floor rect') as SVGRectElement;
    const cell = parseFloat(rect.getAttribute('width')!);
    return {
      x: Math.round(parseFloat(rect.getAttribute('x')!) / cell),
      y: Math.round(parseFloat(rect.getAttribute('y')!) / cell),
    };
  });
}

/** Client-space center of the first floor cell, for pointer gestures. */
async function firstFloorCellClientPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const svg = document.querySelector('#dm-map svg') as SVGSVGElement;
    const rect = svg.querySelector('.floor rect') as SVGRectElement;
    const svgBox = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const scaleX = svgBox.width / viewBox.width;
    const scaleY = svgBox.height / viewBox.height;
    const centerX = parseFloat(rect.getAttribute('x')!) + parseFloat(rect.getAttribute('width')!) / 2;
    const centerY = parseFloat(rect.getAttribute('y')!) + parseFloat(rect.getAttribute('height')!) / 2;
    return { x: svgBox.left + centerX * scaleX, y: svgBox.top + centerY * scaleY };
  });
}

/** Focus the map and walk the keyboard cursor to an exact grid cell. */
async function moveCursorTo(page: Page, targetX: number, targetY: number): Promise<void> {
  const grid = await gridSize(page);
  await page.locator('#dm-map').focus();
  for (let step = 0; step < grid.gridWidth; step++) await page.keyboard.press('ArrowLeft');
  for (let step = 0; step < grid.gridHeight; step++) await page.keyboard.press('ArrowUp');
  for (let step = 0; step < targetX; step++) await page.keyboard.press('ArrowRight');
  for (let step = 0; step < targetY; step++) await page.keyboard.press('ArrowDown');
}

/** Open the note dialog at the first floor cell, entirely by keyboard. */
async function openNoteDialogByKeyboard(page: Page): Promise<void> {
  const cell = await firstFloorCell(page);
  await moveCursorTo(page, cell.x, cell.y);
  await page.keyboard.press('Enter');                          // no tool active -> annotate
  await expect(page.locator('#note-modal')).toBeVisible();
}

/** id (or tag) of the element that currently has focus. */
async function focusedElementId(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || '');
}

/* ---------------- note modal ---------------- */

test('note modal is an ARIA dialog with initial focus in the note field', async ({ page }) => {
  await openNoteDialogByKeyboard(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toHaveAttribute('aria-labelledby', 'note-ref note-kind');
  expect(await focusedElementId(page)).toBe('note-text');
});

test('Tab is trapped inside the open note modal (denial: focus never escapes)', async ({ page }) => {
  await openNoteDialogByKeyboard(page);
  for (let press = 0; press < 8; press++) {
    await page.keyboard.press('Tab');
    const inPanel = await page.evaluate(() =>
      document.querySelector('#note-modal .note-panel')!.contains(document.activeElement));
    expect(inPanel).toBe(true);
  }
  for (let press = 0; press < 8; press++) {
    await page.keyboard.press('Shift+Tab');
    const inPanel = await page.evaluate(() =>
      document.querySelector('#note-modal .note-panel')!.contains(document.activeElement));
    expect(inPanel).toBe(true);
  }
});

test('Escape closes the note modal from a button, without saving, and restores focus to the map', async ({ page }) => {
  const entriesBefore = await page.locator('.ck-box').count();
  await openNoteDialogByKeyboard(page);
  await page.locator('#note-text').fill('Text that must NOT be saved');

  await page.locator('#note-save').focus();                    // Escape must work outside the textarea too
  await page.keyboard.press('Escape');
  await expect(page.locator('#note-modal')).toBeHidden();
  await expect(page.locator('.ck-box')).toHaveCount(entriesBefore);   // nothing saved
  expect(await focusedElementId(page)).toBe('dm-map');         // opener regains focus
});

test('background undo shortcut does not fire from inside the dialog (denial)', async ({ page }) => {
  // Save a note first so there is an edit that undo could revert.
  await openNoteDialogByKeyboard(page);
  await page.locator('#note-text').fill('The first note');
  await page.click('#note-save');
  await expect(page.locator('.ck-box').filter({ hasText: 'The first note' })).toHaveCount(1);

  // Reopen the dialog and press Ctrl+Z while typing — the note edit must survive.
  await openNoteDialogByKeyboard(page);
  await expect(page.locator('#note-text')).toHaveValue('The first note');   // pre-filled
  await page.keyboard.press('Control+z');
  await expect(page.locator('#note-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ck-box').filter({ hasText: 'The first note' })).toHaveCount(1);   // not undone
});

/* ---------------- generate warning ---------------- */

/** Dirty the dungeon (name edit), then open Generate and pick the first mode —
    all by keyboard — which must surface the unsaved-changes warning. */
async function openGenWarnByKeyboard(page: Page): Promise<void> {
  await page.locator('#dungeon-name-dm').click();
  await page.keyboard.type('X');                               // marks the store dirty
  await page.keyboard.press('Enter');                          // blur the name field
  await page.locator('#btn-new').focus();
  await page.keyboard.press('Enter');                          // open the generate menu
  await expect(page.locator('.gen-menu')).toBeVisible();
  await page.keyboard.press('Enter');                          // activate "Map only"
  await expect(page.locator('#gen-warn')).toBeVisible();
}

test('generate warning is an ARIA dialog; Escape cancels without generating', async ({ page }) => {
  await openGenWarnByKeyboard(page);
  const editedName = (await page.locator('#dungeon-name-dm').textContent())!;   // dirtied name, e.g. "The MaXnsion"
  const dialog = page.getByRole('dialog', { name: /Unsaved Changes/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(await focusedElementId(page)).toBe('gw-cancel');      // safe default focus

  await page.keyboard.press('Escape');
  await expect(page.locator('#gen-warn')).toBeHidden();
  await expect(page.locator('#dungeon-name-dm')).toHaveText(editedName);   // no generation ran
  expect(await focusedElementId(page)).toBe('btn-new');        // opener regains focus
});

/* ---------------- generate menu ---------------- */

test('generate menu is an ARIA menu, arrow-navigable, Escape closes without generating', async ({ page }) => {
  const svgBefore = await page.locator('#dm-map').innerHTML();
  await page.locator('#btn-new').focus();
  await page.keyboard.press('Enter');

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(3);
  await expect(menu.getByRole('menuitem').first()).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');                        // wraps first -> last
  await expect(menu.getByRole('menuitem').nth(2)).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator('.gen-menu')).toHaveCount(0);
  expect(await page.locator('#dm-map').innerHTML()).toBe(svgBefore);   // nothing generated
  expect(await focusedElementId(page)).toBe('btn-new');
});

test('activating a generate menu item by keyboard runs the generation', async ({ page }) => {
  const svgBefore = await page.locator('#dm-map').innerHTML();
  await page.locator('#btn-new').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Enter');                          // "Map only" (fixture load is clean, no warning)
  await expect(page.locator('.gen-menu')).toHaveCount(0);
  await expect(page.locator('#dm-map svg.dmap')).toBeVisible();
  expect(await page.locator('#dm-map').innerHTML()).not.toBe(svgBefore);   // a new map rendered
});

/* ---------------- context menu ---------------- */

test('context menu is an ARIA menu; arrows wrap; Escape closes, restores focus, changes nothing', async ({ page }) => {
  const floorBefore = await page.locator('#dm-map .floor rect').count();
  const point = await firstFloorCellClientPoint(page);
  await page.locator('#dm-map').focus();                       // known pre-menu focus target
  await page.mouse.click(point.x, point.y, { button: 'right' });

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem').first()).toBeFocused();   // "Delete"
  const itemCount = await menu.getByRole('menuitem').count();
  await page.keyboard.press('ArrowUp');                        // wraps first -> last
  await expect(menu.getByRole('menuitem').nth(itemCount - 1)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem').first()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator('.cell-menu')).toHaveCount(0);
  await expect(page.locator('#dm-map .floor rect')).toHaveCount(floorBefore);   // denial: no delete ran
  expect(await focusedElementId(page)).toBe('dm-map');         // pre-menu focus restored
});

test('activating a context menu item by keyboard performs the action', async ({ page }) => {
  const markersBefore = await page.locator('#dm-map .mk').count();
  const point = await firstFloorCellClientPoint(page);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();

  await page.keyboard.press('ArrowDown');                      // Delete -> Make Secret
  await page.keyboard.press('ArrowDown');                      // Make Secret -> Monster (add)
  await expect(page.getByRole('menuitem', { name: /Monster \(add\)/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.cell-menu')).toHaveCount(0);
  await expect(page.locator('#dm-map .mk')).toHaveCount(markersBefore + 1);
});

/* ---------------- contents key ---------------- */

test('Contents-Key entry is a focusable button; Enter opens its dialog; close restores focus to it', async ({ page }) => {
  // Create an entry first (keyboard annotate + save). The fixture already has
  // annotated markers, so target the box carrying this test's note text.
  await openNoteDialogByKeyboard(page);
  await page.locator('#note-text').fill('Guarded by a sleeping troll');
  await page.click('#note-save');
  const box = page.locator('.ck-box').filter({ hasText: 'Guarded by a sleeping troll' });
  await expect(box).toHaveCount(1);
  await expect(box).toHaveAttribute('role', 'button');
  await expect(box).toHaveAttribute('tabindex', '0');
  await expect(box).toHaveAttribute('aria-label', /Edit entry [A-Z]/);

  await box.focus();                                           // reachable focus target
  await page.keyboard.press('Enter');
  await expect(page.locator('#note-modal')).toBeVisible();
  await expect(page.locator('#note-text')).toHaveValue('Guarded by a sleeping troll');

  await page.keyboard.press('Escape');
  await expect(page.locator('#note-modal')).toBeHidden();
  const focusedIsMyBox = await page.evaluate(() =>
    document.activeElement instanceof HTMLElement
    && document.activeElement.classList.contains('ck-box')
    && document.activeElement.textContent!.includes('Guarded by a sleeping troll'));
  expect(focusedIsMyBox).toBe(true);                           // opener regains focus
});

test('Space also activates a Contents-Key entry', async ({ page }) => {
  await openNoteDialogByKeyboard(page);
  await page.locator('#note-text').fill('A note to reopen');
  await page.click('#note-save');
  const box = page.locator('.ck-box').filter({ hasText: 'A note to reopen' });
  await box.focus();
  await page.keyboard.press(' ');
  await expect(page.locator('#note-modal')).toBeVisible();
  await expect(page.locator('#note-text')).toHaveValue('A note to reopen');
});
