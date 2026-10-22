// Kept to APIs that exist in both Electron 22 (Windows 8/8.1 build) and the current Electron (Windows 10/11 build).
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, safeStorage, session, shell } = require('electron');
const { existsSync, promises: fs, statSync } = require('node:fs');
const { basename, join, normalize, sep } = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
// The API allows this origin for bearer-token requests (server config.ts corsOrigins).
const ORIGIN = `${SCHEME}://germanflow`;
const WWW = join(__dirname, '..', 'www');
const TOKEN_FILE = () => join(app.getPath('userData'), 'session.bin');

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function resolveFile(url) {
  const file = normalize(join(WWW, decodeURIComponent(new URL(url).pathname)));
  if (!file.startsWith(WWW + sep)) return join(WWW, 'index.html');
  // Client-side routes (/study, /settings…) have no file, so they get the SPA shell.
  return existsSync(file) && statSync(file).isFile() ? file : join(WWW, 'index.html');
}

function serveApp() {
  if (protocol.handle) protocol.handle(SCHEME, (req) => net.fetch(pathToFileURL(resolveFile(req.url)).toString()));
  else protocol.registerFileProtocol(SCHEME, (req, respond) => respond({ path: resolveFile(req.url) }));
}

const isAppUrl = (url) => url === ORIGIN || url.startsWith(`${ORIGIN}/`);
const openExternal = (url) => {
  if (/^https:\/\//i.test(url)) shell.openExternal(url);
};
const fromApp = (event) => isAppUrl(event.senderFrame?.url ?? '');

// Newer Electron deprecates the sync safeStorage calls; Electron 22 only has those.
const crypto = safeStorage.encryptStringAsync
  ? { available: () => safeStorage.isAsyncEncryptionAvailable(), encrypt: (s) => safeStorage.encryptStringAsync(s), decrypt: async (b) => (await safeStorage.decryptStringAsync(b)).result }
  : { available: async () => safeStorage.isEncryptionAvailable(), encrypt: async (s) => safeStorage.encryptString(s), decrypt: async (b) => safeStorage.decryptString(b) };

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    show: false,
    backgroundColor: '#07070b',
    title: 'GermanFlow',
    icon: join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  // There is no menu bar, so F11 is wired here.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'F11') return;
    event.preventDefault();
    win.setFullScreen(!win.isFullScreen());
  });
  win.loadURL(`${ORIGIN}/`);
}

ipcMain.handle('token:get', async (event) => {
  if (!fromApp(event) || !(await crypto.available())) return null;
  try {
    return await crypto.decrypt(await fs.readFile(TOKEN_FILE()));
  } catch {
    return null;
  }
});

// Encrypted with Windows DPAPI, so the file is useless when copied to another user or PC.
ipcMain.handle('token:set', async (event, token) => {
  if (!fromApp(event)) return;
  if (typeof token === 'string' && token && (await crypto.available())) await fs.writeFile(TOKEN_FILE(), await crypto.encrypt(token));
  else await fs.rm(TOKEN_FILE(), { force: true });
});

ipcMain.handle('file:save', async (event, filename, content) => {
  if (!fromApp(event) || typeof content !== 'string') return false;
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: join(app.getPath('downloads'), basename(String(filename)) || 'germanflow-export.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return false;
  await fs.writeFile(filePath, content, 'utf8');
  return true;
});

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.abdelrhmankhaled.germanflow');
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, allow) => allow(permission === 'fullscreen'));
  serveApp();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
