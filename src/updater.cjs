// Two update paths:
// - content: each production deploy on Vercel publishes /desktop/update.json; the page files are downloaded into userData, no reinstall.
// - app: a new installer from GitHub Releases (electron-updater), needed only when this Electron shell itself changes.
const { app, net } = require('electron');
const { createHash } = require('node:crypto');
const { existsSync, readdirSync, readFileSync, promises: fs } = require('node:fs');
const { dirname, join, normalize, sep } = require('node:path');

const BUNDLED = join(__dirname, '..', 'www');
const CHECK_EVERY_MS = 30 * 60_000;
const FIRST_CHECK_MS = 10_000;
const webDir = () => join(app.getPath('userData'), 'web');
const activeFile = () => join(webDir(), 'active');
const isId = (id) => typeof id === 'string' && /^[\w-]+$/.test(id);

// Written by scripts/build-web.mjs from .env, so the update source follows API_URL instead of being hard-coded.
const config = (() => {
  try {
    return require('./config.json');
  } catch {
    return {};
  }
})();

const readBuild = (dir) => {
  try {
    return JSON.parse(readFileSync(join(dir, 'version.json'), 'utf8'));
  } catch {
    return null;
  }
};

const atLeast = (version, min) => {
  const a = String(version).split('.').map(Number);
  const b = String(min).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return true;
};

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// net.request instead of fetch: Electron 22 (the Windows 8 build) runs Node 16, which has no global fetch.
function get(url) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, redirect: 'follow' });
    req.setHeader('Cache-Control', 'no-cache');
    req.on('response', (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

// A new installer ships its own bundle; a downloaded one is used only while it is newer than that.
function pickRoot() {
  const bundled = readBuild(BUNDLED);
  try {
    const id = readFileSync(activeFile(), 'utf8').trim();
    const dir = join(webDir(), id);
    const downloaded = isId(id) && readBuild(dir);
    if (downloaded && downloaded.builtAt > (bundled?.builtAt ?? 0)) return dir;
  } catch {}
  return BUNDLED;
}

let root = BUNDLED;
let rootBuild = null;
let nextRoot = null;
let pending = null;
let checking = null;
let shell = null;
let status = { state: 'idle' };
let notify = () => {};

const setStatus = (next) => {
  status = { ...next, appVersion: app.getVersion() };
  notify(status);
};

async function removeStaleBundles() {
  const keep = root === BUNDLED ? null : root;
  const entries = existsSync(webDir()) ? readdirSync(webDir()) : [];
  await Promise.all(entries.filter((name) => name !== 'active' && join(webDir(), name) !== keep).map((name) => fs.rm(join(webDir(), name), { recursive: true, force: true })));
}

async function downloadContent() {
  if (!config.apiUrl) return null;
  const base = `${config.apiUrl}/desktop`;
  const manifest = JSON.parse((await get(`${base}/update.json`)).toString('utf8'));
  if (!isId(manifest.id) || !Array.isArray(manifest.files) || !(manifest.builtAt > (rootBuild?.builtAt ?? 0))) return null;
  // The new content needs a bridge API this exe lacks; it waits until the app update is installed.
  if (manifest.minShell && !atLeast(app.getVersion(), manifest.minShell)) return null;

  const dir = join(webDir(), manifest.id);
  if (readBuild(dir)?.id === manifest.id) return { manifest, dir };
  const tmp = `${dir}.tmp`;
  await fs.rm(tmp, { recursive: true, force: true });
  let done = 0;
  for (const file of manifest.files) {
    const target = normalize(join(tmp, file.path));
    if (!target.startsWith(tmp + sep)) throw new Error(`Unsafe path in update: ${file.path}`);
    // Unchanged files (icons, chunks whose hash did not change) are copied from the running bundle instead of downloaded.
    const local = join(root, file.path);
    const cached = existsSync(local) ? await fs.readFile(local) : null;
    const data = cached && sha256(cached) === file.sha256 ? cached : await get(`${base}/${file.path.split('/').map(encodeURIComponent).join('/')}`);
    if (sha256(data) !== file.sha256) throw new Error(`Update file failed verification: ${file.path}`);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    setStatus({ state: 'downloading', kind: 'web', version: manifest.commit, progress: Math.round((++done / manifest.files.length) * 100) });
  }
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rename(tmp, dir);
  // Recorded now, so the next launch starts on the new content even if the user never clicks Update.
  await fs.writeFile(activeFile(), manifest.id);
  return { manifest, dir };
}

async function checkShell() {
  if (!shell) return false;
  try {
    const result = await shell.checkForUpdates();
    if (!result?.isUpdateAvailable) return false;
    await result.downloadPromise;
    return true;
  } catch (e) {
    // No release published yet, GitHub unreachable or rate-limited: content updates still go ahead.
    console.warn('App update check failed:', e?.message ?? e);
    return false;
  }
}

function check() {
  if (pending) return Promise.resolve(status);
  checking ??= (async () => {
    setStatus({ state: 'checking' });
    try {
      // An app update also carries new content, so it is looked for first.
      if (await checkShell()) return status;
      const content = await downloadContent();
      if (content) {
        nextRoot = content.dir;
        pending = 'web';
        setStatus({ state: 'ready', kind: 'web', version: content.manifest.commit });
      } else setStatus({ state: 'none' });
    } catch (e) {
      setStatus({ state: 'error', message: `Could not update: ${e?.message ?? e}` });
    }
    return status;
  })().finally(() => (checking = null));
  return checking;
}

function apply(win) {
  if (pending === 'app') return shell.quitAndInstall();
  if (pending !== 'web') return;
  root = nextRoot;
  rootBuild = readBuild(root);
  pending = null;
  setStatus({ state: 'none' });
  win.webContents.reloadIgnoringCache();
}

function initShellUpdater() {
  if (!app.isPackaged) return null;
  const { autoUpdater } = require('electron-updater');
  // Electron 22 is the Windows 8 build; it follows the win8 channel so it never installs the Windows 10+ exe.
  if (Number(process.versions.electron.split('.')[0]) < 23) autoUpdater.channel = 'win8';
  autoUpdater.allowDowngrade = false;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('download-progress', (p) => setStatus({ state: 'downloading', kind: 'app', progress: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => {
    pending = 'app';
    setStatus({ state: 'ready', kind: 'app', version: info.version });
  });
  return autoUpdater;
}

module.exports = {
  init(onStatus) {
    notify = onStatus;
    root = pickRoot();
    rootBuild = readBuild(root);
    shell = initShellUpdater();
    status = { state: 'idle', appVersion: app.getVersion() };
    removeStaleBundles().catch(() => {});
    setTimeout(check, FIRST_CHECK_MS);
    setInterval(check, CHECK_EVERY_MS);
  },
  root: () => root,
  status: () => status,
  check,
  apply,
  // A downloaded bundle that will not load must never lock the user out: drop it and serve the installer's copy.
  fallBack() {
    if (root === BUNDLED) return false;
    root = BUNDLED;
    rootBuild = readBuild(root);
    fs.rm(activeFile(), { force: true }).catch(() => {});
    return true;
  },
};
