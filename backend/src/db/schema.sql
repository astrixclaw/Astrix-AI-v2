-- Astrix Home DB schema
--
-- Conventions:
--  * ids are 16-byte hex (32 chars) — random, not predictable
--  * timestamps are unix milliseconds (INTEGER)
--  * booleans are 0/1 INTEGER
--  * permissions table is fully replaceable per-user: revoke = delete row, grant = upsert
--
-- Order matters because of FKs; PRAGMA foreign_keys = ON is set at connect.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pin_hash    TEXT NOT NULL,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  avatar      TEXT,            -- emoji or short label, optional
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- A user is "online" if they have at least one non-expired session.
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Feature-level permissions. One row per (user, feature[, resource]).
-- Features we know about:
--   'chat'         -- talk to Astrix
--   'lighting'     -- control Hue (resource = room_id, or NULL = all rooms)
--   'group_chat'   -- read/write the household room
-- Admins are NOT given rows here — they implicitly have everything.
CREATE TABLE IF NOT EXISTS permissions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature      TEXT NOT NULL,
  resource_id  TEXT,           -- room id, etc. NULL = wildcard "all"
  created_at   INTEGER NOT NULL,
  UNIQUE(user_id, feature, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_perms_user ON permissions(user_id);

-- Group chat: single household room (for v1). Messages, plus read receipts.
CREATE TABLE IF NOT EXISTS group_messages (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_group_messages_created ON group_messages(created_at);

CREATE TABLE IF NOT EXISTS group_reads (
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_msg_id TEXT,
  last_read_at     INTEGER NOT NULL,
  PRIMARY KEY (user_id)
);

-- Personal chat history with Astrix. One row per message; renderer pages it.
CREATE TABLE IF NOT EXISTS personal_messages (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conv_id     TEXT NOT NULL,
  role        TEXT NOT NULL,         -- 'user' | 'assistant'
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personal_user_conv ON personal_messages(user_id, conv_id, created_at);

-- Settings (key/value) — bridge URL, gateway URL, etc.
-- Single-row config table; keys are well-known constants in code.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
