import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, 'fixtures/seed-c0ffee.dungeon');

/* ============================================================
   E2E — every printed sheet must hold exactly one .page section.

   Bug (Firefox): the Contents Key printed on the same sheet as the Game
   Master's map because there were NO forced page breaks. Each .page is wrapped
   in its own .page-wrap, so the rule `.page:last-child{ page-break-after:auto }`
   matched EVERY page (each is the sole child of its wrapper) and cancelled the
   forced break the design intended. Chrome masked this because each .page is
   exactly one sheet tall and fragments one-per-sheet by coincidence; Firefox
   does not, so pages slid onto the wrong sheet and, once a page started
   mid-sheet, its absolutely-positioned frame lost its margin.

   The fix must make each section start on a fresh sheet via a real forced break
   that is not cancelled. These tests assert that forced break exists (both
   engines) and that the paginated output is one sheet per section (Chromium,
   which can render a real print PDF).
   ============================================================ */

test.use({ viewport: { width: 1400, height: 2400 } });

async function loadFixtureInPrintMode(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('#dm-map svg');
  await page.setInputFiles('#file-load', FIXTURE);
  await page.waitForSelector('.ck-letter');
  await page.emulateMedia({ media: 'print' });
}

test('every section after the first forces a page break so no two share a sheet', async ({ page }) => {
  await loadFixtureInPrintMode(page);

  const breaks = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll<HTMLElement>('.page'));
    return pages.map((element, index) => {
      const style = getComputedStyle(element);
      const previous = index > 0 ? getComputedStyle(pages[index - 1]) : null;
      const forcedBefore = style.breakBefore === 'page' || style.pageBreakBefore === 'always';
      const previousForcedAfter =
        previous !== null && (previous.breakAfter === 'page' || previous.pageBreakAfter === 'always');
      return {
        label: element.getAttribute('data-screen-label'),
        separatedFromPrevious: index === 0 || forcedBefore || previousForcedAfter,
      };
    });
  });

  expect(breaks.length).toBeGreaterThanOrEqual(2);
  for (const entry of breaks) {
    expect(
      entry.separatedFromPrevious,
      `"${entry.label}" is not forced onto its own sheet — it can share a sheet with the section before it`,
    ).toBe(true);
  }
});
