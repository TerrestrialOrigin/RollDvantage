import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, 'fixtures/seed-c0ffee.dungeon');

/* ============================================================
   E2E — Contents Key letters must be visible when printed.

   Bug: each .ck-letter is drawn with `color:transparent` plus a gradient
   `background` clipped to the text (background-clip:text). Printing suppresses
   background graphics by default, so the only thing painting the glyph is gone
   and the letter disappears. The letter must therefore carry an opaque text
   colour under print media, not rely on the dropped background.
   ============================================================ */

test.use({ viewport: { width: 1400, height: 2400 } });

function isTransparent(color: string): boolean {
  const normalized = color.replace(/\s+/g, '');
  return (
    normalized === 'transparent' ||
    normalized === 'rgba(0,0,0,0)' ||
    /^rgba\([^)]*,0\)$/.test(normalized)
  );
}

test('Contents Key letters keep an opaque colour under print media', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('#dm-map svg');

  await page.setInputFiles('#file-load', FIXTURE);
  await page.waitForSelector('.ck-letter');

  // Sanity: the fixture produced lettered boxes.
  const letterCount = await page.locator('.ck-letter').count();
  expect(letterCount).toBeGreaterThan(0);

  // Emulate the print pipeline (backgrounds suppressed), then confirm the glyph
  // still has a real colour to paint with.
  await page.emulateMedia({ media: 'print' });

  const color = await page
    .locator('.ck-letter')
    .first()
    .evaluate((element) => getComputedStyle(element).color);

  expect(isTransparent(color), `letter colour was "${color}" — invisible when the background is not printed`).toBe(false);
});
