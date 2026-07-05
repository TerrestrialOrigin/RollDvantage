import { test, expect } from '@playwright/test';

/* ============================================================
   SELF-HOSTED FONTS — self-host-fonts change (F-1).
   Proves the display fonts are served from the app bundle, not
   from Google: no request escapes to the Google Fonts origins,
   the served document references neither origin, and the real
   typography still renders with those origins blocked (the
   mandated denial/offline case). No mocks of app code.
   ============================================================ */

const GOOGLE_FONT_ORIGINS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/* Block — and record — any attempt to reach a Google Fonts origin. Registered
   before navigation so nothing can slip through during initial load. */
async function blockGoogleFonts(page: import('@playwright/test').Page): Promise<string[]> {
  const blockedRequests: string[] = [];
  for (const origin of GOOGLE_FONT_ORIGINS) {
    await page.route(`**://${origin}/**`, (route) => {
      blockedRequests.push(route.request().url());
      return route.abort();
    });
  }
  return blockedRequests;
}

test('renders real typography with the Google Fonts origins blocked (denial case)', async ({ page }) => {
  const blockedRequests = await blockGoogleFonts(page);

  await page.goto('/');
  await page.waitForSelector('#dm-map svg.dmap');
  // Ensure font loading has settled before asserting on loaded faces.
  await page.evaluate(() => document.fonts.ready);

  // 1. Nothing tried to reach Google — fonts are genuinely local.
  expect(blockedRequests).toEqual([]);

  // 2. The served document references neither Google origin.
  const html = await page.content();
  expect(html).not.toContain('fonts.googleapis.com');
  expect(html).not.toContain('fonts.gstatic.com');

  // 3. The bundled faces actually loaded (not the generic fallback). document.fonts
  //    only lists a face as 'loaded' once its bytes are fetched and parsed.
  const loadedFamilies = await page.evaluate(() =>
    [...document.fonts]
      .filter((face) => face.status === 'loaded')
      .map((face) => face.family.replace(/^['"]|['"]$/g, '')),
  );
  for (const family of ['Cinzel', 'Cinzel Decorative', 'Cormorant Garamond']) {
    expect(loadedFamilies).toContain(family);
  }

  // 4. A titled element resolves to a bundled display family, not the fallback.
  const wordmarkFont = await page.evaluate(() => {
    const wordmark = document.querySelector('.bm-name');
    return wordmark ? getComputedStyle(wordmark).fontFamily : '';
  });
  expect(wordmarkFont).toContain('Cinzel Decorative');
});

test('the Terms & License page also self-hosts its fonts offline (denial case)', async ({ page }) => {
  const blockedRequests = await blockGoogleFonts(page);

  await page.goto('/License.html');
  await page.waitForSelector('.lic-title');
  await page.evaluate(() => document.fonts.ready);

  // No Google request, and the served page names neither origin.
  expect(blockedRequests).toEqual([]);
  const html = await page.content();
  expect(html).not.toContain('fonts.googleapis.com');
  expect(html).not.toContain('fonts.gstatic.com');

  // The license title renders in the bundled display face, not the fallback.
  const titleFont = await page.evaluate(() => {
    const title = document.querySelector('.lic-title');
    return title ? getComputedStyle(title).fontFamily : '';
  });
  expect(titleFont).toContain('Cinzel Decorative');
  const loadedFamilies = await page.evaluate(() =>
    [...document.fonts]
      .filter((face) => face.status === 'loaded')
      .map((face) => face.family.replace(/^['"]|['"]$/g, '')),
  );
  expect(loadedFamilies).toContain('Cinzel Decorative');
});
