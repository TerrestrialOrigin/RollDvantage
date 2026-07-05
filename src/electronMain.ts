import { app, BrowserWindow } from 'electron';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WINDOW_WIDTH_DEFAULT = 800;
const WINDOW_HEIGHT_DEFAULT = 600;
const ENTRY_POINT = './index.html';

/* The app's own install directory. Navigation is allowed only for the app's
   own bundled pages, resolved by containment against this root. */
const APP_ROOT = import.meta.dirname;

/* A navigation target is permitted only when it is a file:// URL whose
   normalized path is contained within the app directory. Every non-file scheme
   (e.g. https:) and any file:// URL outside the app directory is rejected.
   Containment is checked with path.relative — never a string prefix, which
   would let a sibling like `<app>-evil/` slip through — and a URL that fails to
   parse or convert is treated as "outside" (fail-closed). Query and hash are
   dropped by fileURLToPath, which reads only the path. */
const isWithinApp = (targetUrl: string): boolean => {
	let targetPath: string;
	try {
		const parsed = new URL(targetUrl);
		if (parsed.protocol !== 'file:') return false;
		targetPath = fileURLToPath(parsed);
	} catch {
		return false;
	}
	const relativePath = relative(APP_ROOT, targetPath);
	return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath);
};

/* The renderer needs no privileged API (save/load uses browser file mechanics),
   so the window runs fully sandboxed with no preload. See the change's ThreatModel.md. */
const hardenedWebPreferences = () => ({
	sandbox: true,
	contextIsolation: true,
	nodeIntegration: false,
});

const denyWindowOpen = (window: BrowserWindow) => {
	window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
};

const blockExternalNavigation = (window: BrowserWindow) => {
	window.webContents.on('will-navigate', (event, targetUrl) => {
		if (!isWithinApp(targetUrl)) {
			event.preventDefault();
		}
	});
};

const createWindow = () => {
	const window = new BrowserWindow({
		width: WINDOW_WIDTH_DEFAULT,
		height: WINDOW_HEIGHT_DEFAULT,
		webPreferences: hardenedWebPreferences(),
	});
	denyWindowOpen(window);
	blockExternalNavigation(window);
	void window.loadFile(join(import.meta.dirname, ENTRY_POINT));
}

void app.whenReady().then(() => {
	createWindow()

	/*
	 * On macOS, closing all windows doesn't quit the application. The app remains active,
	 * and clicking the dock icon triggers the activate event. To handle this, we listen
	 * for the activate event and check if there are no open windows
	 * (if (BrowserWindow.getAllWindows().length === 0)). If there aren't any, we call
	 * createWindow() again, so that a new window is created when the user reactivates the app.
	 */
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	})
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
});
