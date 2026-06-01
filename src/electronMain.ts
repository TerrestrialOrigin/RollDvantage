import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

const WINDOW_WIDTH_DEFAULT = 800;
const WINDOW_HEIGHT_DEFAULT = 600;
const ENTRY_POINT = './index.html';

const createWindow = () => {
	const window = new BrowserWindow({
		width: WINDOW_WIDTH_DEFAULT,
		height: WINDOW_HEIGHT_DEFAULT,
		webPreferences: {
			preload: join(import.meta.dirname, 'preload.js'),
			sandbox: false
		},
	});
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
