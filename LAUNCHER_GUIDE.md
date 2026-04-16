# 🚀 GEMINI Launcher Guide

## Quick Start

### Option 1: Double-click the GEMINI App (Easiest)
1. **Finder → GEMINI.app**
2. Double-click `GEMINI.app` in the project folder
3. Terminal opens automatically and starts all services
4. Chrome Beta automatically opens to `http://localhost:13000`

### Option 2: Command Line
```bash
cd "/Volumes/SanDisk1Tb/GEMINI for MacOS"
bash launch-gemini.sh
```

### Option 3: From Finder
1. Open Finder
2. Navigate to `/Volumes/SanDisk1Tb/GEMINI for MacOS`
3. Double-click `GEMINI.app`

---

## What the Launcher Does

✅ **Checks Prerequisites**
- Verifies Node.js is installed
- Checks for npm
- Detects Chrome Beta

✅ **Cleans Up**
- Kills any processes on ports 13000 and 13001
- Ensures clean startup

✅ **Starts Services**
- 🔌 MCP Backend Server (`ws://localhost:13001/mcp`)
- 🌐 Vite Frontend Server (`http://localhost:13000`)

✅ **Opens Browser**
- Automatically launches Chrome Beta
- Opens `http://localhost:13000`

✅ **Handles Signals**
- Gracefully shuts down on Ctrl+C
- Kills all child processes

---

## Services

| Service | URL | Port | Purpose |
|---------|-----|------|---------|
| MCP Backend | ws://localhost:13001/mcp | 13001 | File system access, tools |
| Frontend | http://localhost:13000 | 13000 | React + Vite app |

---

## Browser Support

**Preferred:** Chrome Beta (auto-detected and opened)
**Fallback:** Default browser (if Chrome Beta not found)

---

## Stopping the Services

**Option 1:** Press `Ctrl+C` in Terminal

**Option 2:** Close the Terminal window

**Option 3:** Activity Monitor → Search "node" → Quit Process

---

## Troubleshooting

### Port Already in Use
The launcher automatically kills processes on ports 13000 and 13001. If you still get "address already in use":
```bash
lsof -i :13000,:13001 | grep -v COMMAND | awk '{print $2}' | xargs kill -9
```

### Chrome Beta Not Opening
Edit the launcher and specify a different browser path, or just use the default browser that opens.

### Dependencies Missing
The launcher will automatically run `npm install` if `node_modules` doesn't exist.

### No .env File
The launcher creates `.env` from `.env.example` and reminds you to add your `GEMINI_API_KEY`.

---

## Advanced: Using with Dock

To add GEMINI to your macOS Dock:

1. Open Finder
2. Navigate to `/Volumes/SanDisk1Tb/GEMINI for MacOS`
3. Right-click `GEMINI.app` → **Options → Keep in Dock**

Now you can click it from the Dock anytime! ⚡

---

## Logs

Dev server logs are written to: `/tmp/gemini-dev.log`

View in real-time:
```bash
tail -f /tmp/gemini-dev.log
```

---

## Architecture

```
GEMINI.app
└── Contents/
    ├── MacOS/
    │   └── gemini (launcher wrapper)
    ├── Resources/
    │   └── AppIcon.icns (app icon)
    └── Info.plist (app metadata)

↓ launches ↓

launch-gemini.sh
└── npm run dev
    ├── MCP Backend (port 13001)
    └── Vite Frontend (port 13000)
         ↓ opens ↓
    Chrome Beta at http://localhost:13000
```

---

## Performance

- **First Launch:** ~30 seconds (depends on dependencies)
- **Subsequent Launches:** ~10-15 seconds
- **Frontend Load:** Usually <2 seconds after servers ready

---

## Security Notes

- YOLO mode enabled: All file operations auto-approved
- Scoped paths: `/Users`, `/Volumes`, `/tmp`
- API key stored in `.env` (not in code)

---

## Support

For issues:
1. Check `/tmp/gemini-dev.log`
2. Run `npm run type-check` (TypeScript validation)
3. Verify ports: `lsof -i :13000,:13001`

