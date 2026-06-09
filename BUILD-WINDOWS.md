# 🪟 Building Astrix AI v2 for Windows

This guide shows how to build the Windows installer (EXE) for Astrix AI v2.

## Prerequisites

**On Windows:**
- Node.js 18+ ([download](https://nodejs.org/))
- Git ([download](https://git-scm.com/))
- Visual Studio Build Tools (for native modules)
  - Or: Visual Studio Community 2022 with C++ Desktop Development tools

**OR: On Linux (with Wine/NSIS for cross-compilation)**
- Already installed and working on this system ✅

## Option 1: Build on Windows (Recommended)

### Step 1: Clone the Project
```bash
git clone https://github.com/astrixclaw/Astrix-AI-v2.git
cd Astrix-AI-v2
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Build
```bash
npm run build
```

**Output:**
- Windows installer: `dist/Astrix AI Setup 2.0.0.exe` (~85 MB)
- Portable ZIP: `dist/Astrix AI-2.0.0-win.zip` (~111 MB)
- Delta updates: `dist/Astrix AI Setup 2.0.0.exe.blockmap`

### Step 4: Install & Test
1. Run `Astrix AI Setup 2.0.0.exe`
2. Follow the installer wizard
3. Launch Astrix AI from Start Menu or Desktop shortcut
4. Login with: `admin` / `password`

---

## Option 2: Cross-Compile from Linux (Advanced)

If you're already on Linux and want to build Windows EXE:

### Install Wine & NSIS
```bash
sudo apt-get install wine wine32 wine64 nsis
```

### Build
```bash
npm run build
```

The electron-builder will automatically detect Wine and use NSIS to create the Windows installer.

**Output:** Same as Windows build above

---

## Build Configuration

### What Gets Built

The build script (`npm run build`) does:

1. **TypeScript Compilation**
   - Main process → ES2020 modules → `dist/main/`
   - Preload script → CommonJS → `dist/main/preload.js`

2. **React Build**
   - Vite bundles React + all components → `dist/renderer/`
   - CSS minified, JS tree-shaken, ~358 KB output

3. **Electron Builder**
   - Packages for Windows (`.exe` installer + portable `.zip`)
   - Signs with code cert if available (optional)
   - Creates delta updates for auto-update

### Configuration Files

- **`package.json`** — Scripts and build metadata
- **`tsconfig.json`** — React/Vite TypeScript config
- **`tsconfig.main.json`** — Electron main process config
- **`vite.config.ts`** — Bundler settings
- **`electron-builder.yml`** (or package.json `"build"`) — Installer config

### Customizing the Build

**Change app name:**
```json
"productName": "My Astrix AI"
```

**Change version:**
```json
"version": "2.0.1"
```

**Change installer certificate:**
Edit `package.json` build section:
```json
"win": {
  "certificateFile": "path/to/cert.pfx",
  "certificatePassword": "password"
}
```

**Change installer icon:**
Replace `public/astrix-logo.svg` with a Windows ICO file.

---

## Installation Modes

### Mode 1: Full Installer (Recommended for Users)
```
Astrix AI Setup 2.0.0.exe
```
- Guided installer
- Creates Start Menu shortcuts
- Automatic updates
- Uninstall via Control Panel

### Mode 2: Portable ZIP (For Testing/USB)
```
Astrix AI-2.0.0-win.zip
```
- No installation required
- Extract and run
- All files in one folder
- No admin rights needed

### Mode 3: Silent Installation (For Enterprises)
```bash
Astrix AI Setup 2.0.0.exe /S /D=C:\Program Files\Astrix AI
```
- No prompts
- Custom install path
- Useful for deployment

---

## Troubleshooting

### Build fails: "wine command not found"
**On Linux:** Install Wine first
```bash
sudo apt-get install wine wine32 wine64
```

### Build fails: "NSIS not found"
**On Linux:** Install NSIS
```bash
sudo apt-get install nsis
```

### Build fails: "certificateFile not found"
Remove the certificate lines from `package.json` — unsigned is fine for development.

### Installer won't run on Windows
- Try extracting and running the portable ZIP instead
- Check Windows Defender hasn't quarantined it
- Run as Administrator if UAC prompts
- Disable SmartScreen (Windows will warn on first run)

### Auto-updates not working
- Check `package.json` `publish` config points to correct GitHub repo
- Ensure `latest.yml` is in the GitHub release
- Check `electron-updater` can reach your update server

---

## Development Tips

### Building for Testing
Fast iteration during development:
```bash
npm run dev
```
This starts Vite dev server + Electron in live-reload mode.

### Build Once (No Installation)
If you just want the bundle without the installer:
```bash
npm run build:renderer
npm run build:main
```
Output in `dist/` folder.

### Code Signing
For production releases with auto-updates:
1. Get a code signing certificate
2. Add to `package.json`:
   ```json
   "win": {
     "certificateFile": "cert.pfx",
     "certificatePassword": "secret"
   }
   ```
3. Run `npm run build`

---

## Release Checklist

- [ ] Version bumped in `package.json`
- [ ] `npm install` ran to sync lockfile
- [ ] All tests pass (`npm run build` succeeds)
- [ ] Desktop app opens and logs in
- [ ] All features tested (chat, smart home, security, etc.)
- [ ] GitHub release created with:
  - [ ] `.exe` installer
  - [ ] `.exe.blockmap` (delta updates)
  - [ ] `-win.zip` portable
  - [ ] `latest.yml` (auto-update metadata)
- [ ] Release tagged in git: `git tag v2.0.0`

---

## Support

- **GitHub Issues:** https://github.com/astrixclaw/Astrix-AI-v2/issues
- **Local Testing:** Run `npm run dev` and check console for errors
- **Installer Logs:** Windows stores logs in `%APPDATA%\Astrix AI\`

---

**Ready to release?** Follow the checklist and ship it! 🚀
