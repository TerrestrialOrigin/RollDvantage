import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, 'fixtures/seed-c0ffee.dungeon');
const MISSING_TALLY_FIXTURE = resolve(here, 'fixtures/missing-tally.dungeon');

/* ============================================================
   E2E CHARACTERIZATION — real browser, full `npm run dev` stack, no mocks.
   Locks the interactive editor behavior the refactor must preserve.
   ============================================================ */

// A tall viewport so the DM map (top) and the legend/toolbar (lower on the print
// sheet) are both on-screen at once — required to drag a legend icon onto the map.
test.use({ viewport: { width: 1400, height: 2400 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('#dm-map svg');
});

test('boots and renders both maps with walls and a compass', async ({ page }) => {
  await expect(page.locator('#dm-map svg.dmap')).toBeVisible();
  await expect(page.locator('#player-map svg.dmap')).toBeVisible();
  await expect(page.locator('#dm-map .walls')).toHaveCount(1);
  await expect(page.locator('#dm-map .compass')).toHaveCount(1);
});

test('loads a fixture dungeon deterministically', async ({ page }) => {
  await page.setInputFiles('#file-load', FIXTURE);
  await expect(page.locator('#dungeon-name-dm')).toHaveText('The Mansion');
  await expect(page.locator('#dungeon-name-pl')).toHaveText('The Mansion');
  // DM map shows all markers; player map only entrances.
  const dmMarkers = await page.locator('#dm-map .mk').count();
  const playerMarkers = await page.locator('#player-map .mk').count();
  expect(dmMarkers).toBeGreaterThan(playerMarkers);
  expect(playerMarkers).toBeGreaterThanOrEqual(1); // entrance always on player map
});

test('generates a "Map only" dungeon from the New menu', async ({ page }) => {
  await page.click('#btn-new');
  await page.getByRole('menuitem', { name: 'Map only' }).click();
  await expect(page.locator('#dm-map svg.dmap')).toBeVisible();
  await expect(page.locator('#dm-map .walls')).toHaveCount(1);
});

test('drag-to-place a monster adds exactly one DM marker, undo removes it', async ({ page }) => {
  await page.setInputFiles('#file-load', FIXTURE);
  await page.waitForSelector('#dm-map .floor rect');

  const before = await page.locator('#dm-map .mk').count();

  // Compute the client-space center of the first floor cell (guaranteed placeable).
  const point = await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('#dm-map svg')!;
    const rect = svg.querySelector<SVGRectElement>('.floor rect')!;
    const svgBox = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scaleX = svgBox.width / vb.width;
    const scaleY = svgBox.height / vb.height;
    const cx = parseFloat(rect.getAttribute('x')!) + parseFloat(rect.getAttribute('width')!) / 2;
    const cy = parseFloat(rect.getAttribute('y')!) + parseFloat(rect.getAttribute('height')!) / 2;
    return { x: svgBox.left + cx * scaleX, y: svgBox.top + cy * scaleY };
  });

  const legend = page.locator('.legend-item', { has: page.locator('[data-icon="monster"]') }).first();
  const legendBox = (await legend.boundingBox())!;
  await page.mouse.move(legendBox.x + legendBox.width / 2, legendBox.y + legendBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator('#dm-map .mk')).toHaveCount(before + 1);

  await page.click('#btn-undo');
  await expect(page.locator('#dm-map .mk')).toHaveCount(before);
});

test('rejects an invalid file with an alert and leaves the dungeon unchanged (denial)', async ({ page }) => {
  await page.setInputFiles('#file-load', FIXTURE);
  await expect(page.locator('#dungeon-name-dm')).toHaveText('The Mansion');
  const markersBefore = await page.locator('#dm-map .mk').count();

  let alerted = '';
  page.once('dialog', (dialog) => { alerted = dialog.message(); void dialog.accept(); });

  await page.setInputFiles('#file-load', {
    name: 'bogus.dungeon',
    mimeType: 'application/json',
    buffer: Buffer.from('{"not":"a dungeon"}'),
  });

  await expect.poll(() => alerted).toContain('not a valid RollDvantage dungeon');
  // unchanged
  await expect(page.locator('#dungeon-name-dm')).toHaveText('The Mansion');
  await expect(page.locator('#dm-map .mk')).toHaveCount(markersBefore);
});

test('rejects a well-formed file missing tally instead of crashing rendering (R3 denial)', async ({ page }) => {
  /* This file is well-formed except it omits the required `tally` — the old
     validator let it through and rendering then threw on `dungeon.tally.rooms`,
     producing an unhandled rejection and a half-painted map. It must now be
     rejected at the load boundary with the clear alert, state untouched. */
  await page.setInputFiles('#file-load', FIXTURE);
  await expect(page.locator('#dungeon-name-dm')).toHaveText('The Mansion');
  const markersBefore = await page.locator('#dm-map .mk').count();

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  let alerted = '';
  page.once('dialog', (dialog) => { alerted = dialog.message(); void dialog.accept(); });

  await page.setInputFiles('#file-load', MISSING_TALLY_FIXTURE);

  await expect.poll(() => alerted).toContain('not a valid RollDvantage dungeon');
  // state unchanged and no crash leaked to the page
  await expect(page.locator('#dungeon-name-dm')).toHaveText('The Mansion');
  await expect(page.locator('#dm-map .mk')).toHaveCount(markersBefore);
  expect(pageErrors).toEqual([]);
});

test('rejects a structurally hostile file at the boundary and stays editable (denial)', async ({ page }) => {
  /* This shape passed the old truthy-check "validation" (grid/floor/markers all
     truthy) and crashed deep inside editing. It must now be rejected at load. */
  await page.setInputFiles('#file-load', FIXTURE);
  await expect(page.locator('#dungeon-name-dm')).toHaveText('The Mansion');
  const markersBefore = await page.locator('#dm-map .mk').count();

  let alerted = '';
  page.once('dialog', (dialog) => { alerted = dialog.message(); void dialog.accept(); });

  await page.setInputFiles('#file-load', {
    name: 'hostile.dungeon',
    mimeType: 'application/json',
    buffer: Buffer.from('{"seed":1,"grid":{"gw":2,"gh":1,"cell":24},"floor":"x","markers":{}}'),
  });

  await expect.poll(() => alerted).toContain('not a valid RollDvantage dungeon');
  // state unchanged and the editor still works: place a marker via the legend drag
  await expect(page.locator('#dungeon-name-dm')).toHaveText('The Mansion');
  await expect(page.locator('#dm-map .mk')).toHaveCount(markersBefore);

  const point = await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('#dm-map svg')!;
    const rect = svg.querySelector<SVGRectElement>('.floor rect')!;
    const svgBox = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const scaleX = svgBox.width / viewBox.width;
    const scaleY = svgBox.height / viewBox.height;
    const centerX = parseFloat(rect.getAttribute('x')!) + parseFloat(rect.getAttribute('width')!) / 2;
    const centerY = parseFloat(rect.getAttribute('y')!) + parseFloat(rect.getAttribute('height')!) / 2;
    return { x: svgBox.left + centerX * scaleX, y: svgBox.top + centerY * scaleY };
  });
  const legend = page.locator('.legend-item', { has: page.locator('[data-icon="monster"]') }).first();
  const legendBox = (await legend.boundingBox())!;
  await page.mouse.move(legendBox.x + legendBox.width / 2, legendBox.y + legendBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#dm-map .mk')).toHaveCount(markersBefore + 1);
});

test('save triggers a .dungeon download', async ({ page }) => {
  await page.setInputFiles('#file-load', FIXTURE);
  const downloadPromise = page.waitForEvent('download');
  await page.click('#btn-save');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.dungeon$/);
});

test('web build carries no Electron CSP meta tag', async ({ page }) => {
  /* The CSP is Electron-only (injected when BUILD_TARGET=electron); the web
     app must stay free of it. Catches the electron-csp vite plugin losing its
     BUILD_TARGET guard, which would inject the CSP here too. */
  const cspMetaCount = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .count();
  expect(cspMetaCount).toBe(0);
});
