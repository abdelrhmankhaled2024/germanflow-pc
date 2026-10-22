// Builds the GermanFlow web client in "native" mode into ./www, the folder Electron packages into the Windows app.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = Object.fromEntries(
  (existsSync('.env') ? readFileSync('.env', 'utf8') : '')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const apiUrl = (process.env.API_URL ?? env.API_URL ?? '').replace(/\/+$/, '');
const webDir = resolve(process.env.WEB_APP_DIR ?? env.WEB_APP_DIR ?? '../Deutsch App');

if (!/^https:\/\/[^/]+$/.test(apiUrl)) {
  console.error('Set API_URL in .env to your deployed site, e.g. API_URL=https://germanflow.vercel.app (HTTPS only).');
  process.exit(1);
}
if (!existsSync(resolve(webDir, 'client/package.json'))) {
  console.error(`GermanFlow web project not found at "${webDir}". Set WEB_APP_DIR in .env.`);
  process.exit(1);
}

// chrome108 is the engine of Electron 22, the last Electron that runs on Windows 8/8.1; one bundle serves both installers.
execSync(`npx vite build --outDir "${resolve('www')}" --emptyOutDir --target chrome108`, {
  cwd: resolve(webDir, 'client'),
  stdio: 'inherit',
  env: { ...process.env, VITE_NATIVE: '1', VITE_API_URL: apiUrl, VITE_CONTACT_EMAIL: process.env.CONTACT_EMAIL ?? env.CONTACT_EMAIL ?? '' },
});

// Chrome 108 treats Tailwind's `var(--registered-prop,)` as invalid (filter/blur become none); `var(--x, )` means the same and works.
const assets = resolve('www/assets');
for (const file of readdirSync(assets).filter((f) => f.endsWith('.css'))) {
  const path = resolve(assets, file);
  writeFileSync(path, readFileSync(path, 'utf8').replace(/var\((--[\w-]+),\)/g, 'var($1, )'));
}
console.log(`\nDesktop web bundle built in ./www (API: ${apiUrl})`);
