import { test, expect, _electron as electronLauncher } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* ============================================================
   ELECTRON SHELL SECURITY SMOKE — real Electron build, no mocks.
   Proves the hardened posture from the harden-electron-security
   change: sandboxed renderer with no privileged surface, CSP
   without inline scripts, denied window.open, blocked external
   navigation — and that the editor still fully works that way.
   ============================================================ */

test.describe.configure({ mode: 'serial' });

let electronApp: ElectronApplication;
let appWindow: Page;

test.beforeAll(async () => {
  /* Always test a current build — the smoke test must never pass against
     stale dist-electron output while the source is broken. */
  test.setTimeout(300_000);
  execSync('npm run build-electron-app', { stdio: 'inherit' });
  electronApp = await electronLauncher.launch({ args: ['.'] });
  appWindow = await electronApp.firstWindow();
  await appWindow.waitForSelector('#dm-map svg.dmap');
});

test.afterAll(async () => {
  await electronApp?.close();
});

test('launches sandboxed with no privileged renderer surface', async () => {
  await expect(appWindow.locator('#dm-map svg.dmap')).toBeVisible();
  await expect(appWindow.locator('#player-map svg.dmap')).toBeVisible();

  const rendererPosture = await appWindow.evaluate(() => ({
    processType: typeof (window as { process?: unknown }).process,
    fileApiType: typeof (window as { fileAPI?: unknown }).fileAPI,
  }));
  expect(rendererPosture.processType).toBe('undefined');
  expect(rendererPosture.fileApiType).toBe('undefined');

  /* Ground truth from the main process: the window must have been created with
     the explicit hardened webPreferences (catches a sandbox:false regression
     that renderer-side checks alone would miss). Note the OS-level sandbox
     itself cannot be asserted under Playwright — its Electron launcher passes
     --no-sandbox globally; outside the harness (npm run dev-electron) the
     sandbox is genuinely active. */
  const windowWebPreferences = await electronApp.evaluate(({ BrowserWindow }) => {
    const { sandbox, contextIsolation, nodeIntegration } =
      BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox, contextIsolation, nodeIntegration };
  });
  expect(windowWebPreferences).toEqual({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  });
});

test('ships a CSP that forbids inline script yet allows the hashed toolbar script', async () => {
  const cspContent = await appWindow.evaluate(() =>
    document
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content') ?? '',
  );
  expect(cspContent).toContain("default-src 'self'");
  const scriptSrcDirective = cspContent
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('script-src'));
  expect(scriptSrcDirective).toBeDefined();
  expect(scriptSrcDirective).not.toContain("'unsafe-inline'");
  expect(scriptSrcDirective).toContain("'sha256-");

  /* The inline hamburger script must still execute (hash-allowed): its click
     listener toggles the toolbar's `open` class. */
  const toolbarToggles = await appWindow.evaluate(() => {
    const toolbar = document.getElementById('toolbar');
    const toggle = document.getElementById('tb-toggle');
    if (!toolbar || !toggle) return false;
    toggle.click();
    const opened = toolbar.classList.contains('open');
    toggle.click();
    const closedAgain = !toolbar.classList.contains('open');
    return opened && closedAgain;
  });
  expect(toolbarToggles).toBe(true);
});

test('New → Save → Load round-trip works inside the sandboxed shell', async () => {
  await appWindow.click('#btn-new');
  await appWindow.getByRole('button', { name: 'Map only' }).click();
  await expect(appWindow.locator('#dm-map svg.dmap')).toBeVisible();
  const generatedName = await appWindow.locator('#dungeon-name-dm').textContent();
  expect(generatedName).toBeTruthy();

  /* Playwright's page `download` event is not wired for Electron; capture the
     download where Electron actually handles it — the main-process session —
     and give it a save path so no native dialog blocks the test. */
  const savedPath = join(mkdtempSync(join(tmpdir(), 'electron-smoke-')), 'saved.dungeon');
  const downloadResult = electronApp.evaluate(
    ({ session }, savePath) =>
      new Promise<{ state: string; filename: string }>((resolve) => {
        session.defaultSession.once('will-download', (_event, item) => {
          item.setSavePath(savePath);
          item.once('done', (_doneEvent, state) => resolve({ state, filename: item.getFilename() }));
        });
      }),
    savedPath,
  );
  await appWindow.click('#btn-save');
  const download = await downloadResult;
  expect(download.state).toBe('completed');
  expect(download.filename).toMatch(/\.dungeon$/);

  /* Generate a different dungeon, then load the saved one back and confirm
     the round-trip restored it. */
  await appWindow.click('#btn-new');
  await appWindow.getByRole('button', { name: 'Map only' }).click();
  await appWindow.setInputFiles('#file-load', savedPath);
  await expect(appWindow.locator('#dungeon-name-dm')).toHaveText(generatedName ?? '');
  await expect(appWindow.locator('#dm-map svg.dmap')).toBeVisible();
});

test('denies window.open (denial case)', async () => {
  const windowCountBefore = electronApp.windows().length;
  /* Note: window.open's return value is racy under a main-process deny (the
     renderer creates its WindowProxy synchronously), so the reliable assertion
     is that no actual window ever gets created. */
  await appWindow.evaluate(() => {
    window.open('https://example.com');
  });
  await appWindow.waitForTimeout(500);
  expect(electronApp.windows().length).toBe(windowCountBefore);
  await expect(appWindow.locator('#dm-map svg.dmap')).toBeVisible();
});

test('blocks navigation to an external origin (denial case)', async () => {
  const urlBefore = appWindow.url();
  await appWindow.evaluate(() => {
    window.location.href = 'https://example.com';
  });
  await appWindow.waitForTimeout(1000);
  expect(appWindow.url()).toBe(urlBefore);
  /* Editor state is intact: the rendered dungeon is still there. Asserted via
     evaluate — locators would wait forever on the prevented (never-committing)
     navigation Playwright still considers in flight. */
  const dungeonStillRendered = await appWindow.evaluate(
    () => document.querySelector('#dm-map svg.dmap') !== null,
  );
  expect(dungeonStillRendered).toBe(true);
});
