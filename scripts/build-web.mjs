// Builds the GermanFlow web client in "native" mode into ./www, the folder Electron packages into the Windows app.
// The build itself lives in the web project (scripts/build-desktop.mjs), so Vercel produces the exact same bundle for content updates.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = Object.fromEntries(
  (existsSync('.env') ? readFileSync('.env', 'utf8') : '')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const apiUrl = (process.env.API_URL ?? env.API_URL ?? '').replace(/\/+$/, '');
const webDir = resolve(process.env.WEB_APP_DIR ?? env.WEB_APP_DIR ?? '../Deutsch App');
const script = resolve(webDir, 'scripts/build-desktop.mjs');

if (!/^https:\/\/[^/]+$/.test(apiUrl)) {
  console.error('Set API_URL in .env to your deployed site, e.g. API_URL=https://germanflow.vercel.app (HTTPS only).');
  process.exit(1);
}
if (!existsSync(script)) {
  console.error(`GermanFlow web project (with scripts/build-desktop.mjs) not found at "${webDir}". Set WEB_APP_DIR in .env.`);
  process.exit(1);
}

execFileSync(process.execPath, [script, resolve('www'), apiUrl], {
  stdio: 'inherit',
  env: { ...process.env, CONTACT_EMAIL: process.env.CONTACT_EMAIL ?? env.CONTACT_EMAIL ?? '' },
});
// The updater reads /desktop/update.json from this origin.
writeFileSync(resolve('src/config.json'), JSON.stringify({ apiUrl }));
