const { app, BrowserWindow, screen, ipcMain } = require("electron");
const path = require("node:path");

// Handle window close request from renderer
ipcMain.on("close-window", () => {
	app.quit();
});

ipcMain.handle("get-port", () => port);

// Hide dock icon on macOS to run completely in the background as a widget
if (process.platform === "darwin") {
	app.dock.hide();
}

let mainWindow = null;
let port = 0;

// Parse the port argument passed by the extension
for (const arg of process.argv) {
	if (arg.startsWith("--port=")) {
		port = parseInt(arg.split("=")[1], 10);
	}
}

function createWindow() {
	const { workArea } = screen.getPrimaryDisplay();
	const windowWidth = 200;
	const windowHeight = 200;

	// Position window at bottom-right corner, offset from edges
	const x = workArea.x + workArea.width - windowWidth - 20;
	const y = workArea.y + workArea.height - windowHeight - 20;

	mainWindow = new BrowserWindow({
		width: windowWidth,
		height: windowHeight,
		x: x,
		y: y,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: false,
		skipTaskbar: true,
		hasShadow: false,
		type: "panel", // Keep above all workspaces on mac
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, "preload.cjs"), // Preload script if needed, or we can use empty
		},
	});

	// Enable transparent click-through or normal behavior.
	// We want normal behavior so the user can hover and click buttons,
	// but transparent background itself is transparent.
	mainWindow.setIgnoreMouseEvents(false);

	// Load index.html with the port query parameter
	mainWindow.loadFile(path.join(__dirname, "index.html"), {
		query: { port: String(port) },
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

// On macOS panels require some settings to behave like desktop widgets
app.on("ready", () => {
	createWindow();

	if (mainWindow && process.platform === "darwin") {
		mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
		// Set level to floating/status level so it overlays full-screen apps too
		mainWindow.setAlwaysOnTop(true, "screen-saver");
	}
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (mainWindow === null) {
		createWindow();
	}
});
