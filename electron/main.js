const { app, BrowserWindow, globalShortcut, screen, dialog } = require("electron");
const path = require("path");
const net = require("net");
const { execSync } = require("child_process");
const { startServer } = require(path.join(__dirname, "..", "server", "index"));

let mainWindow;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", (err) => {
      resolve(err && err.code === "EADDRINUSE");
    });
    tester.once("listening", () => {
      tester.close(() => resolve(false));
    });
    tester.listen(port, "0.0.0.0");
  });
}

function killPortHolderWindows(port) {
  try {
    const output = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    const pids = new Set();
    output.split(/\r?\n/).forEach((line) => {
      const match = line.trim().split(/\s+/);
      const pid = match[match.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== "0") {
        pids.add(pid);
      }
    });
    pids.forEach((pid) => {
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
      } catch {
        // ignore failures; we'll surface a dialog later if the port is still busy
      }
    });
  } catch {
    // netstat returns non-zero when no rows match; nothing to kill
  }
}

async function ensurePortAvailable(port) {
  if (!(await isPortInUse(port))) return;
  if (process.platform === "win32") {
    killPortHolderWindows(port);
    for (let i = 0; i < 20; i += 1) {
      if (!(await isPortInUse(port))) return;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  if (await isPortInUse(port)) {
    dialog.showErrorBox(
      "Photobooth — port 3000 in use",
      `Another process is already using port 3000 and could not be stopped automatically.\n\nClose any other Photobooth or "node" windows and try again.`,
    );
    app.exit(1);
  }
}

async function createWindow() {
  await ensurePortAvailable(3000);
  await startServer();

  const displays = screen.getAllDisplays();
  const externalDisplay = displays.find((d) => d.bounds.x !== 0 || d.bounds.y !== 0) || displays[0];

  mainWindow = new BrowserWindow({
    x: externalDisplay.bounds.x,
    y: externalDisplay.bounds.y,
    width: externalDisplay.bounds.width,
    height: externalDisplay.bounds.height,
    frame: false,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: "#000000",
    ...(process.platform === "win32" ? { thickFrame: false } : {}),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.setBackgroundColor("#000000");
    mainWindow.setFullScreen(true);
  });

  await mainWindow.loadURL("http://localhost:3000/projection");
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(async () => {
  await createWindow();

  globalShortcut.register("CommandOrControl+R", () => {});
  globalShortcut.register("F5", () => {});
  globalShortcut.register("Alt+F4", () => {});
  globalShortcut.register("Escape", () => {
    app.quit();
  });
});

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});
