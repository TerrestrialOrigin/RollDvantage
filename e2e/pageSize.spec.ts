import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, 'fixtures/seed-c0ffee.dungeon');

/* ============================================================
   E2E — page-size selection resizes the page, persists, validates, and prints
   at the selected size. Chromium-only: page.pdf() is the real print pipeline
   here (Firefox real-print at each size is covered by the Mozilla Save to PDF
   harness; Firefox forced-break structure is covered by printPageBreaks).
   ============================================================ */

test.use({ viewport: { width: 1400, height: 2400 } });

function mediaBox(pdf: Buffer): [number, number] | null {
  const match = /MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(pdf.toString('latin1'));
  return match?.[1] !== undefined && match[2] !== undefined ? [Math.round(+match[1]), Math.round(+match[2])] : null;
}
function sheetCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

async function load(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#dm-map svg');
  await page.evaluate(() => localStorage.clear());
  await page.setInputFiles('#file-load', FIXTURE);
  await page.waitForSelector('.ck-letter');
  await page.evaluate(() => document.fonts.ready);
}
async function selectPreset(page: import('@playwright/test').Page, preset: string): Promise<void> {
  await page.click('.ps-toggle');
  await page.waitForSelector('.ps-popup:not([hidden])');
  await page.click(`[data-preset="${preset}"]`);
  await page.waitForTimeout(250);
}

test('selecting a preset resizes the page and persists across reload', async ({ page }) => {
  await load(page);
  const letterWidth = await page.evaluate(() => document.querySelector('.page')!.getBoundingClientRect().width);

  await selectPreset(page, 'a4');
  const a4Var = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--page-w').trim());
  expect(a4Var).toBe('210mm');
  const a4Width = await page.evaluate(() => document.querySelector('.page')!.getBoundingClientRect().width);
  expect(a4Width).not.toBeCloseTo(letterWidth, 0);

  await page.reload();
  await page.waitForSelector('#dm-map svg');
  const afterReload = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--page-w').trim());
  expect(afterReload).toBe('210mm');
});

test('invalid custom size is rejected and keeps the previous size', async ({ page }) => {
  await load(page);
  await selectPreset(page, 'a4');
  await page.click('.ps-toggle');
  await page.waitForSelector('.ps-popup:not([hidden])');
  await page.fill('.ps-w', '0');
  await page.fill('.ps-h', '9');
  await page.click('.ps-apply');
  await page.waitForTimeout(100);
  expect(await page.locator('.ps-msg').textContent()).toBeTruthy();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--page-w').trim())).toBe('210mm');
});

test('Contents Key re-paginates on size change with no entry loss', async ({ page }) => {
  await load(page);
  const before = await page.locator('.ck-box').count();
  await selectPreset(page, 'a4');
  const after = await page.locator('.ck-box').count();
  expect(after).toBe(before);
  expect(after).toBeGreaterThan(0);
});

for (const [preset, expected] of [['letter', [612, 792]], ['a4', [595, 842]]] as const) {
  test(`prints at the selected size (${preset}) — one sheet per section`, async ({ page }) => {
    await load(page);
    await selectPreset(page, preset);
    await page.emulateMedia({ media: 'print' });
    const sectionCount = await page.locator('.page').count();
    const pdf = await page.pdf({ printBackground: false, preferCSSPageSize: true });
    const box = mediaBox(pdf);
    expect(box).not.toBeNull();
    expect(box![0]).toBeCloseTo(expected[0], -1); // ~ within 10pt
    expect(box![1]).toBeCloseTo(expected[1], -1);
    expect(sheetCount(pdf)).toBe(sectionCount);
  });
}
