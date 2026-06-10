# Astrix Home

Multi-user household AI assistant. Personal chats with Astrix, Philips Hue
lighting control, household group chat — all over the LAN with admin-managed
permissions.

## Layout

```
backend/   Fastify + SQLite service (auth, permissions, Hue, chat)
desktop/   Electron + React + TypeScript app (Windows installer target)
```

## Quick start (dev)

```bash
# Terminal 1 — backend
cd backend
npm install
npm run dev          # listens on 0.0.0.0:18800

# Terminal 2 — desktop app
cd desktop
npm install
npm run dev          # Vite renderer + Electron main
```

On first launch the app walks you through:
1. Connecting to the backend (defaults to `http://127.0.0.1:18800`).
2. Creating the admin account (username + 4-digit PIN).

## Build a Windows installer

```bash
cd desktop
npm run package      # produces release/Astrix Home Setup x.y.z.exe
```

## Phase status

- [x] Phase 1 — architecture
- [x] Phase 2 — backend skeleton (auth + sessions + permissions)
- [x] Phase 3 — desktop scaffold (modern UI, login, setup, splash)
- [ ] Phase 4 — chat with Astrix
- [ ] Phase 5 — Hue lighting
- [ ] Phase 6 — group chat (WebSocket)
- [ ] Phase 7 — admin panel
- [ ] Phase 8 — Windows installer + release
```
