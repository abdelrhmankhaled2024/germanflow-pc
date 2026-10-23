# GermanFlow: Windows app

The Windows desktop app for GermanFlow, built with **Electron**. It packages the same React client as the website (`D:\Deutsch App\client`) and talks to the same API on Vercel, so accounts, progress and stats are shared with the website and the Android app.

*Made by Abdelrhman Khaled*

## How it works

```
D:\Deutsch App\client  ──(npm run build:web, VITE_NATIVE=1)──▶  D:\PC\www  ──(electron-builder)──▶  Setup .exe
                                                                                  │
                                 HTTPS + Bearer token  ◀──────────────────────────┘
                          https://YOUR-APP.vercel.app/api/v1  ──▶  MongoDB Atlas (same DB as website + Android)
```

- The app never connects to MongoDB itself, so no database password is inside the exe.
- Pages are served from the `app://germanflow` origin; the server allows it in `server/src/config.ts` (`corsOrigins`).
- The session token is stored encrypted with Windows DPAPI (`safeStorage`) in `%APPDATA%\GermanFlow\session.bin`.
- Export opens a Windows "Save as" dialog.

## Installer

`release\GermanFlow-Setup-<version>.exe` (Electron 45) runs on Windows 10 and 11. Windows 8/8.1 is not supported.

## Commands

```powershell
cd "D:\PC"
copy .env.example .env      # set API_URL=https://YOUR-APP.vercel.app and CONTACT_EMAIL
npm install
npm start                   # build the web bundle and run the app
npm run dist                # Windows 10/11 installer  -> release\
```

For a new version, raise `version` in `package.json` before building.

## Updates

The app updates itself in two ways:

| What changed | What you do | How users get it |
|---|---|---|
| Pages, features, styles (anything in `Deutsch App\client`) | Push the web project. Vercel builds `/desktop/update.json` on every production deploy | The app checks every 10 min, downloads only changed files, and loads them by itself on the next page change, when minimized, or after 3 min without input |
| This Electron shell (`src\*.cjs`, Electron version, icons) | `npm run release:all` and publish the GitHub draft | electron-updater downloads the new installer and installs it silently (then reopens the app) once the window is minimized, the PC is idle for 2 min, or the app is closed |

Releasing a new installer:

```powershell
$env:GH_TOKEN = "<GitHub token with repo scope>"
# raise "version" in package.json first (1.1.0 -> 1.2.0)
npm run release:all     # builds the installer and uploads it to a draft release v<version>
```

Then on GitHub, open **Releases**, check that the draft has `latest.yml`, the `.exe` and its `.blockmap`, and click **Publish release**. Installed apps pick it up on their next check.

- The releases repo must be **public**: installed apps read releases without a token.
- If the client starts using a new `germanflowDesktop` API, raise `MIN_SHELL` in `Deutsch App\scripts\build-desktop.mjs` to the release that adds it. Older apps then keep their current content until they install that release.
- Version 1.0.0 has no updater. People on 1.0.0 need to install 1.1.0 or later once by hand.

## Notes

- **Before the first release**, push `D:\Deutsch App` so the live API allows the `app://germanflow` origin; until then sign-in from the app fails.
- The installers are not code-signed, so Windows SmartScreen shows "Windows protected your PC" → **More info → Run anyway**. Signing needs a paid certificate (or free SignPath for open source).
- The build reads the web client from `WEB_APP_DIR` (default `..\Deutsch App`); keep both repos side by side.
