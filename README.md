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

## Two installers

| Installer | Electron | For |
|---|---|---|
| `release\GermanFlow-Setup-<version>.exe` | current (45) | Windows 10 and 11, **recommended** |
| `release-win8\GermanFlow-Setup-<version>-Windows8.exe` | 22.3.27 | Windows 8 / 8.1 only |

Electron 22 is the last version that runs on Windows 8/8.1 and no longer gets security fixes, so give the Windows 8 installer only to people on Windows 8. The web bundle is built for Chrome 108 so it renders the same in both.

## Commands

```powershell
cd "D:\PC"
copy .env.example .env      # set API_URL=https://YOUR-APP.vercel.app and CONTACT_EMAIL
npm install
npm start                   # build the web bundle and run the app
npm run dist                # Windows 10/11 installer  -> release\
npm run dist:win8           # Windows 8/8.1 installer  -> release-win8\
npm run dist:all            # both
```

For a new version, raise `version` in `package.json` before building.

## Notes

- **Before the first release**, push `D:\Deutsch App` so the live API allows the `app://germanflow` origin; until then sign-in from the app fails.
- The installers are not code-signed, so Windows SmartScreen shows "Windows protected your PC" → **More info → Run anyway**. Signing needs a paid certificate (or free SignPath for open source).
- The build reads the web client from `WEB_APP_DIR` (default `..\Deutsch App`); keep both repos side by side.
