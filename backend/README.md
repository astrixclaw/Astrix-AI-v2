# Astrix Home — Backend

Fastify + SQLite. Handles auth, permissions, personal chat history, household
group chat, and Philips Hue control for the Astrix Home desktop app.

## Quick start

```bash
cd backend
npm install
npm run dev          # tsx watch, port 18800
```

First request to the desktop app's setup screen will create the admin user.

## Endpoints (so far)

```
GET    /api/health
GET    /api/setup-status         { needsSetup: boolean }
POST   /api/setup                { username, pin }    -> { user, token }
POST   /api/login                { username, pin }    -> { user, token }
POST   /api/logout               (auth)
GET    /api/me                   (auth)               -> { user, permissions }
POST   /api/me/pin               (auth) { pin }       -> { ok: true }
```

More to come: admin user management, permissions, Hue, group chat (WS).

## Files

```
src/
├── db/
│   ├── schema.sql       -- tables
│   └── index.ts         -- SQLite connection
├── middleware/
│   └── auth.ts          -- requireAuth, requireAdmin
├── routes/
│   └── auth.ts          -- login, setup, me
├── services/
│   ├── auth.ts          -- users, sessions, PIN hashing
│   └── permissions.ts   -- grant / revoke / check
└── server.ts            -- entry point
```

## Configuration

```
PORT             default 18800
HOST             default 0.0.0.0 (LAN reachable)
ASTRIX_HOME_DB   default backend/astrix-home.db
```
