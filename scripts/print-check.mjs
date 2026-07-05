/* ============================================================
   print-check — real-print gate (Chromium + Firefox).

   Print emulation hides Firefox's real print behaviour (paper size, page fill,
   grid collapse, and the ≤700px header reflow), so this drives the ACTUAL print
   pipeline: Chromium via page.pdf(), Firefox via the "Mozilla Save to PDF"
   virtual printer. It spawns its own dev server so it is self-contained.

   Usage:  npm run print-check     (or: node scripts/print-check.mjs)
   Exit code is non-zero if any check fails.
   ============================================================ */
import { chromium, firefox } from '@playwright/test';
import { spawn, execSync } from 'node:child_process';
import { existsSync, statSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '..');
const FIXTURE = resolve(REPO, 'e2e/fixtures/seed-c0ffee.dungeon');
// Spawn the Vite binary directly (not via the `npx` wrapper) so the teardown
// SIGTERM reaches Vite itself and cannot leave an orphan holding PORT (N3).
const VITE_BIN = resolve(REPO, 'node_modules/.bin/vite');
const PORT = 5199;
const BASE = `http://localhost:${PORT}/`;
const TMP = mkdtempSync(resolve(tmpdir(), 'print-check-'));

const checks = [];
function record(name, ok, detail = '') {
  checks.push(ok);
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// Resolves true when nothing accepts a TCP connection on the port (server gone).
function isPortFree(port) {
  return new Promise((resolveFree) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolveFree(false); });
    socket.once('error', () => { socket.destroy(); resolveFree(true); });
  });
}

async function loadPrinted(page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto(BASE);
  await page.waitForSelector('#dm-map svg');
  await page.setInputFiles('#file-load', FIXTURE);
  await page.waitForSelector('.ck-letter');
  await page.evaluate(() => document.fonts.ready);
}
function pageCount(pdf) { return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; }
function mediaBox(pdf) {
  const mediaBoxMatch = pdf.toString('latin1').match(/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/);
  return mediaBoxMatch ? [Math.round(+mediaBoxMatch[1]), Math.round(+mediaBoxMatch[2])] : null;
}

async function chromiumChecks() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 2400 } });
  await loadPrinted(page);
  const sections = await page.locator('.page').count();
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ preferCSSPageSize: true });
  record('Chromium: one sheet per section', pageCount(pdf) === sections, `${pageCount(pdf)} sheets / ${sections} sections`);
  const box = mediaBox(pdf);
  record('Chromium: Letter sheet size', box && Math.abs(box[0] - 612) < 6 && Math.abs(box[1] - 792) < 6, box ? box.join('×') + 'pt' : 'no MediaBox');
  await browser.close();
}

async function firefoxChecks() {
  const out = resolve(TMP, 'ff.pdf');
  const browser = await firefox.launch({ firefoxUserPrefs: {
    'print.always_print_silent': true, 'print.show_print_progress': false,
    'print_printer': 'Mozilla Save to PDF', 'print.print_printer': 'Mozilla Save to PDF',
    'print.printer_Mozilla_Save_to_PDF.print_to_file': true,
    'print.printer_Mozilla_Save_to_PDF.print_to_filename': out,
  } });
  const page = await browser.newPage({ viewport: { width: 1400, height: 2400 } });
  await loadPrinted(page);
  const sections = await page.locator('.page').count();
  await page.evaluate(() => window.print());
  for (let i = 0; i < 60 && !(existsSync(out) && statSync(out).size > 0); i++) await new Promise((resolve) => setTimeout(resolve, 200));
  await browser.close();
  if (!existsSync(out)) { record('Firefox: produced a print PDF', false, 'no file'); return; }

  // Firefox writes compressed object streams, so the plaintext /Type /Page regex
  // misses them — use pdfinfo, which parses the structure.
  const ffPages = parseInt(execSync(`pdfinfo "${out}" | awk '/^Pages:/{print $2}'`).toString().trim(), 10);
  record('Firefox: one sheet per section', ffPages === sections, `${ffPages} sheets / ${sections} sections`);
  // header is stacked (regression guard: the depth line must not also carry the dungeon name)
  const text = execSync(`pdftotext -f 1 -l 1 "${out}" - 2>/dev/null`).toString();
  const depthLine = text.split('\n').find((l) => /depth/i.test(l)) || '';
  record('Firefox: header stacked (depth over name)', /depth/i.test(depthLine) && !/mansion/i.test(depthLine), JSON.stringify(depthLine.trim()));
  // full-page border present: content reaches within ~0.7in of every sheet edge
  execSync(`pdftoppm -png -r 70 -f 1 -l 1 "${out}" "${TMP}/ff"`);
  const margins = execSync(`python3 - "${TMP}/ff-1.png" <<'PY'\nimport sys\nfrom PIL import Image\nimage=Image.open(sys.argv[1]).convert('RGB'); width,height=image.size; pixels=image.load()\ndef isNonWhite(color): red,green,blue=color; return not(red>238 and green>238 and blue>238)\nminX=width;minY=height;maxX=0;maxY=0\nfor y in range(height):\n  for x in range(0,width,2):\n    if isNonWhite(pixels[x,y]): minX=min(minX,x);maxX=max(maxX,x);minY=min(minY,y);maxY=max(maxY,y)\nprint('%.2f %.2f %.2f %.2f'%(minX/70,minY/70,(width-maxX)/70,(height-maxY)/70))\nPY`).toString().trim().split(' ').map(Number);
  const bordered = margins.every((margin) => margin > 0.15 && margin < 0.9);
  record('Firefox: full-page border with margins', bordered, `margins in: ${margins.join('/')}`);
}

let server;
try {
  console.log(`Starting dev server on :${PORT} …`);
  server = spawn(VITE_BIN, ['--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 120; i++) {
    try { const response = await fetch(BASE); if (response.ok) { up = true; break; } } catch { /* not ready */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!up) throw new Error('dev server did not start');
  console.log('\nChromium print checks:');
  await chromiumChecks();
  console.log('\nFirefox print checks (real Mozilla Save to PDF):');
  await firefoxChecks();
} finally {
  if (server) {
    // Signal Vite directly and wait for it to actually exit, then confirm the
    // port is released — so a run can never leave an orphan squatting on PORT.
    const exited = new Promise((resolveExit) => server.once('exit', resolveExit));
    server.kill('SIGTERM');
    await exited;
    const portFree = await isPortFree(PORT);
    if (!portFree) {
      console.error(`\x1b[31m✗\x1b[0m dev server still bound to :${PORT} after teardown`);
      process.exitCode = 1;
    } else {
      console.log(`  \x1b[32m✓\x1b[0m dev server torn down; :${PORT} free`);
    }
  }
}

const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} print checks passed.`);
process.exit(passed === checks.length && checks.length > 0 ? 0 : 1);
