import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, 'fixtures/seed-c0ffee.dungeon');

/* ============================================================
   E2E — the real print PDF is one sheet per section.

   Chromium-only: page.pdf() renders true paginated print output, so it is the
   only engine that can count sheets. The Firefox project deliberately does NOT
   match this file (see playwright.config.ts testMatch); Firefox's break
   behaviour is covered structurally in printPageBreaks.spec.ts instead, so no
   test is skipped anywhere. Guards against missing pages (sections colliding on
   one sheet) and against spurious blank leading/trailing sheets.
   ============================================================ */

test.use({ viewport: { width: 1400, height: 2400 } });

test('printed PDF renders exactly one sheet per section', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('#dm-map svg');
  await page.setInputFiles('#file-load', FIXTURE);
  await page.waitForSelector('.ck-letter');
  await page.emulateMedia({ media: 'print' });

  const sectionCount = await page.locator('.page').count();
  const pdf = await page.pdf({ printBackground: false, preferCSSPageSize: true });
  const sheetCount = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

  expect(sheetCount).toBe(sectionCount);
});
