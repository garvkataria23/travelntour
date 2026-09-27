const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const FRONT_PORT = 3310;
const API_PORT = 4000;

app.disableHardwareAcceleration();

const resources = process.resourcesPath;
const frontDir = path.join(resources, "frontend");
const backDir = path.join(resources, "backend");

const logDir = app.getPath("userData");
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, "flyconnect.log");
const logStream = fs.createWriteStream(logFile, { flags: "a" });
function log(...args) {
  logStream.write(new Date().toISOString() + " " + args.join(" ") + "\n");
}

let backendProc = null;
let frontProc = null;
let mainWindow = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function check(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitFor(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      if (await check(url)) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(false);
        return;
      }
    }, 500);
  });
}

function startDetached(command, args, opts, label) {
  const proc = spawn(command, args, opts);
  proc.on("error", (err) => log(label, "spawn error:", err.message));
  proc.on("exit", (code, signal) => log(label, "exited", code, signal));
  return proc;
}

async function launchServers() {
  const apiUrl = `http://127.0.0.1:${API_PORT}/api/health`;
  const webUrl = `http://127.0.0.1:${FRONT_PORT}`;

  log("resourcesPath:", resources);
  log("frontend dir exists:", fs.existsSync(frontDir));
  log("backend dir exists:", fs.existsSync(backDir));

  if (!(await check(apiUrl))) {
    log("starting backend");
    backendProc = startDetached(
      "node",
      ["dist/main"],
      { cwd: backDir, env: { ...process.env, PORT: String(API_PORT) }, stdio: "ignore", windowsHide: true },
      "backend",
    );
  } else {
    log("backend already running on", API_PORT);
  }
  await waitFor(apiUrl, 20000);

  if (!(await check(webUrl))) {
    const nextJs = path.join(frontDir, "node_modules", "next", "dist", "bin", "next");
    log("starting frontend:", nextJs);
    frontProc = startDetached(
      "node",
      [nextJs, "start", "-p", String(FRONT_PORT)],
      { cwd: frontDir, env: { ...process.env }, stdio: "ignore", windowsHide: true },
      "frontend",
    );
  } else {
    log("frontend already running on", FRONT_PORT);
  }
  const ready = await waitFor(webUrl, 45000);
  log("frontend ready:", ready);
  return ready ? webUrl : null;
}

function createWindow(webUrl) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    title: "FlyConnect",
    backgroundColor: "#f4f7fb",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(webUrl);

  mainWindow.webContents.on("console-message", (event, level, ...args) => {
    log("console:", typeof args[0] === "object" ? args[0].message : args.join(" "));
  });
  mainWindow.webContents.on("did-fail-load", (event, code, desc) => {
    log("did-fail-load:", code, desc);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    log("did-finish-load url:", mainWindow.webContents.getURL());
    setTimeout(async () => {
      try {
        const img = await mainWindow.webContents.capturePage();
        const shotPath = path.join(logDir, "desktop-shot.png");
        fs.writeFileSync(shotPath, img.toPNG());
        const size = img.getSize();
        const bmp = img.getBitmap();
        let sum = 0, white = 0, colored = 0, n = 0;
        for (let i = 0; i < bmp.length; i += 4) {
          const r = bmp[i]; const g = bmp[i + 1]; const b = bmp[i + 2];
          const bright = (r + g + b) / 3;
          sum += bright; n++;
          if (r > 235 && g > 235 && b > 235) white++;
          if (Math.abs(r - g) > 12 || Math.abs(g - b) > 12 || Math.abs(r - b) > 12) colored++;
        }
        log("screenshot saved:", shotPath, "size", JSON.stringify(size), "avgBright", (sum / n).toFixed(1), "whitePct", (white / n * 100).toFixed(1), "coloredPct", (colored / n * 100).toFixed(1));
        const info = await mainWindow.webContents.executeJavaScript(`(() => { const b = document.body; let ls = {}; try { ls = Object.fromEntries(Object.entries(localStorage).map(([k]) => [k, (localStorage.getItem(k) || '').slice(0, 20)])); } catch (e) { ls.E = String(e); } return JSON.stringify({ href: location.href, title: document.title, bodyChildren: b ? b.children.length : null, textLen: b ? (b.innerText || '').length : null, htmlHead: b ? b.innerHTML.slice(0, 250) : null, scripts: Array.from(document.scripts || []).map((s) => (s.src || 'inline').split('/').pop()).slice(0, 8), ls }); })()`);
        log("dom:", info);
      } catch (err) {
        log("screenshot error:", err.message);
      }
    }, 5000);
  });
  mainWindow.webContents.on("render-process-gone", (event, details) => {
    log("render-process-gone:", details.reason, details.exitCode);
  });
  mainWindow.webContents.on("crashed", () => log("renderer crashed"));
  mainWindow.on("unresponsive", () => log("window unresponsive"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require("electron").shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function cleanup() {
  for (const proc of [frontProc, backendProc]) {
    if (proc && !proc.killed) {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    }
  }
  frontProc = null;
  backendProc = null;
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.flyconnect.desktop");
  const webUrl = await launchServers();
  if (!webUrl) {
    log("servers failed to start");
    require("electron").dialog.showErrorBox(
      "FlyConnect",
      "Could not start the FlyConnect servers. Check the log file at\n" + logFile,
    );
    app.quit();
    return;
  }
  createWindow(webUrl);
});

app.on("window-all-closed", () => {
  cleanup();
  app.quit();
});