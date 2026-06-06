const { app, BrowserWindow, screen, ipcMain } = require("electron");
const path = require("node:path");

const isLinux = process.platform === "linux";
const isMac = process.platform === "darwin";

// --- Linux launch reliability (must be set before app 'ready') ---
if (isLinux) {
	// npm-installed Electron ships a chrome-sandbox helper that is not owned
	// root:root / setuid, so the renderer crashes immediately on most Ubuntu
	// setups — the window "spawns" but never appears. Disabling the sandbox is
	// safe here: we only load a local HTML file plus a localhost SSE stream,
	// never remote or untrusted content.
	app.commandLine.appendSwitch("no-sandbox");
	// Transparent, frameless windows on X11 need this switch applied before the
	// GPU process starts, otherwise the window paints opaque-black or invisible.
	app.commandLine.appendSwitch("enable-transparent-visuals");
}

// Handle window close request from renderer
ipcMain.on("close-window", () => {
	app.quit();
});

ipcMain.handle("get-port", () => port);

// Hide dock icon on macOS to run completely in the background as a widget
if (isMac) {
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

	// Position window at bottom-right corner, offset from edges.
	// (Wayland ignores app-set positions; the window still shows.)
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
		// Defer the first paint to avoid a transparent-black flash on Linux.
		show: false,
		// `type: "panel"` is a macOS concept. On Linux/X11 it can stop the
		// window manager from mapping the window at all, so scope it to macOS.
		...(isMac ? { type: "panel" } : {}),
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: false,
			preload: path.join(__dirname, "preload.cjs"), // Preload script if needed, or we can use empty
		},
	});

	// Enable transparent click-through or normal behavior.
	// We want normal behavior so the user can hover and click buttons,
	// but transparent background itself is transparent.
	mainWindow.setIgnoreMouseEvents(false);

	// Show only once the content is ready so the transparent surface is painted.
	mainWindow.once("ready-to-show", () => {
		mainWindow.show();
		mainWindow.setAlwaysOnTop(true, isMac ? "screen-saver" : "floating");
	});

	// Surface renderer crashes instead of silently spawning an invisible window.
	mainWindow.webContents.on("render-process-gone", (_event, details) => {
		console.error(`[pi-pokepet] Electron renderer exited: ${details.reason}`);
	});

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
	// On Linux, transparency needs a tick after 'ready' for the visual to apply.
	if (isLinux) {
		setTimeout(createWindow, 60);
		return;
	}

	createWindow();

	if (mainWindow && isMac) {
		mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
		// Set level to floating/status level so it overlays full-screen apps too
		mainWindow.setAlwaysOnTop(true, "screen-saver");
	}
});

app.on("window-all-closed", () => {
	if (!isMac) {
		app.quit();
	}
});

app.on("activate", () => {
	if (mainWindow === null) {
		createWindow();
	}
});
