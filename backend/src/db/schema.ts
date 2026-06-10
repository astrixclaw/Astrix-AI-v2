/**
 * DB schema as a TypeScript module so it travels with the compiled JS.
 *
 * We used to load schema.sql from disk relative to db/index.ts. That works
 * under tsx (the source file is right there) but breaks under tsc because
 * dist/ doesn't include .sql files. Keeping the SQL inline avoids a build
 * step and gives us one source of truth in TS-land.
 */
export const SCHEMA_SQL = String.raw`
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pin_hash    TEXT NOT NULL,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  avatar      TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS permissions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature      TEXT NOT NULL,
  resource_id  TEXT,
  created_at   INTEGER NOT NULL,
  UNIQUE(user_id, feature, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_perms_user ON permissions(user_id);

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

CREATE TABLE IF NOT EXISTS personal_messages (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conv_id     TEXT NOT NULL,
  role        TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personal_user_conv ON personal_messages(user_id, conv_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;
