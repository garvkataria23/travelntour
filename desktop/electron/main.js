const { app, BrowserWindow, shell, session } = require("electron");
const path = require("path");
const fs = require("fs");

const CLOUD_APP_URL = "https://travel-omega-ashy.vercel.app";

const logDir = app.getPath("userData");
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, "flyconnect.log");
const logStream = fs.createWriteStream(logFile, { flags: "a" });
function log(...args) {
  logStream.write(new Date().toISOString() + " " + args.join(" ") + "\n");
}

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

const offlineHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>FlyConnect - Offline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: #0b1120; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; padding: 20px; }
    .card { background: #1e293b; border: 1px solid #334155; padding: 40px; border-radius: 16px; max-width: 440px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #f1f5f9; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px; }
    .btn { display: inline-block; background: #3b82f6; color: white; border: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; text-decoration: none; }
    .btn:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✈️</div>
    <h1>No Internet Connection</h1>
    <p>Please check your network connection and click Retry to connect to FlyConnect Cloud.</p>
    <button class="btn" onclick="window.location.href='${CLOUD_APP_URL}'">Retry Connection</button>
  </div>
</body>
</html>
`;

function createWindow() {
  const iconPath = path.join(__dirname, "../build/icon.ico");

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    title: "FlyConnect",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: "#0b1120",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });

  const CHROME_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

  // Ensure 100% Genuine Chrome User-Agent for Google OAuth & Passkey/WebAuthn compatibility
  mainWindow.webContents.setUserAgent(CHROME_USER_AGENT);

  // Load Cloud Production App
  mainWindow.loadURL(CLOUD_APP_URL);

  // Handle external links and auth popups
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Permit Firebase Auth Google Sign-In, Passkeys & OAuth handler popups
    if (
      url.includes("accounts.google.com") ||
      url.includes("firebaseapp.com/__/auth") ||
      url.includes("traveltourism-32d7d.firebaseapp.com") ||
      url.includes("googleapis.com")
    ) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 550,
          height: 720,
          minWidth: 460,
          minHeight: 600,
          autoHideMenuBar: true,
          title: "Sign in with Google",
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webSecurity: true,
          },
        },
      };
    }

    // Open any external external website or tool in default browser
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-create-window", (childWindow) => {
    childWindow.webContents.setUserAgent(CHROME_USER_AGENT);
  });

  // Handle network failure gracefully
  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL) => {
      log("did-fail-load:", errorCode, errorDescription, validatedURL);
      if (
        errorCode === -105 || // ERR_NAME_NOT_RESOLVED
        errorCode === -106 || // ERR_INTERNET_DISCONNECTED
        errorCode === -2     // FAILED
      ) {
        mainWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(offlineHtml)}`
        );
      }
    }
  );

  mainWindow.webContents.on("did-finish-load", () => {
    log("Loaded:", mainWindow.webContents.getURL());
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.flyconnect.desktop");

  const CHROME_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  session.defaultSession.setUserAgent(CHROME_USER_AGENT);
  app.userAgentFallback = CHROME_USER_AGENT;

  // Filter User-Agent in headers for OAuth and Passkey requests
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders["User-Agent"] = CHROME_USER_AGENT;
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});