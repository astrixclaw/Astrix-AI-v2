/**
 * Auth service.
 *
 * Responsibilities:
 *  - hash and verify PINs (bcrypt)
 *  - create users (admin-only at the route layer, not here)
 *  - issue session tokens
 *  - resolve a token back to a user (with last_seen bumped on every check)
 *
 * Session tokens are 32-byte hex random strings. They're stored as-is (no need
 * for a second hash — they're already high-entropy and only ever come from us).
 *
 * Sessions auto-extend by 1 hour on every successful verification. If the app
 * is closed for more than an hour, the next request will be rejected and the
 * user gets bounced back to the login screen.
 */
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { db } from "../db/index.js";

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour idle timeout
const BCRYPT_ROUNDS = 10;              // ~80ms on a modern CPU — fine for PINs

export interface User {
  id: string;
  username: string;
  is_admin: 0 | 1;
  avatar: string | null;
  created_at: number;
  updated_at: number;
}

export interface Session {
  token: string;
  user_id: string;
  created_at: number;
  last_seen: number;
  expires_at: number;
}

// ---- ids -----------------------------------------------------------------

export function newId(): string {
  return randomBytes(16).toString("hex");
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

// ---- pins ----------------------------------------------------------------

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

// ---- users ---------------------------------------------------------------

const stmts = {
  insertUser: db.prepare(`
    INSERT INTO users (id, username, pin_hash, is_admin, avatar, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getUserByUsername: db.prepare(`
    SELECT id, username, pin_hash, is_admin, avatar, created_at, updated_at
    FROM users WHERE username = ? COLLATE NOCASE
  `),
  getUserById: db.prepare(`
    SELECT id, username, is_admin, avatar, created_at, updated_at
    FROM users WHERE id = ?
  `),
  listUsers: db.prepare(`
    SELECT id, username, is_admin, avatar, created_at, updated_at
    FROM users ORDER BY is_admin DESC, username ASC
  `),
  updatePinHash: db.prepare(`
    UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?
  `),
  updateAdmin: db.prepare(`
    UPDATE users SET is_admin = ?, updated_at = ? WHERE id = ?
  `),
  updateAvatar: db.prepare(`
    UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?
  `),
  countAdmins: db.prepare(`SELECT COUNT(*) AS n FROM users WHERE is_admin = 1`),
  deleteUser: db.prepare(`DELETE FROM users WHERE id = ?`),
  insertSession: db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, last_seen, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  getSession: db.prepare(`SELECT * FROM sessions WHERE token = ?`),
  bumpSession: db.prepare(`
    UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token = ?
  `),
  deleteSession: db.prepare(`DELETE FROM sessions WHERE token = ?`),
  deleteExpiredSessions: db.prepare(`DELETE FROM sessions WHERE expires_at < ?`),
};

export async function createUser(opts: {
  username: string;
  pin: string;
  isAdmin: boolean;
  avatar?: string | null;
}): Promise<User> {
  const id = newId();
  const now = Date.now();
  const pinHash = await hashPin(opts.pin);
  stmts.insertUser.run(
    id,
    opts.username,
    pinHash,
    opts.isAdmin ? 1 : 0,
    opts.avatar ?? null,
    now,
    now,
  );
  return {
    id,
    username: opts.username,
    is_admin: opts.isAdmin ? 1 : 0,
    avatar: opts.avatar ?? null,
    created_at: now,
    updated_at: now,
  };
}

export function getUserByUsername(username: string) {
  return stmts.getUserByUsername.get(username) as
    | (User & { pin_hash: string })
    | undefined;
}

export function getUserById(id: string): User | undefined {
  return stmts.getUserById.get(id) as User | undefined;
}

export function listUsers(): User[] {
  return stmts.listUsers.all() as User[];
}

export async function setUserPin(id: string, pin: string) {
  const pinHash = await hashPin(pin);
  stmts.updatePinHash.run(pinHash, Date.now(), id);
}

export function countAdmins(): number {
  return (stmts.countAdmins.get() as { n: number }).n;
}

export function setUserAdmin(id: string, isAdmin: boolean): void {
  stmts.updateAdmin.run(isAdmin ? 1 : 0, Date.now(), id);
}

export function setUserAvatar(id: string, avatar: string | null): void {
  stmts.updateAvatar.run(avatar, Date.now(), id);
}

export function deleteUser(id: string) {
  stmts.deleteUser.run(id);
}

// ---- sessions ------------------------------------------------------------

export function createSession(userId: string): Session {
  const token = newToken();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  stmts.insertSession.run(token, userId, now, now, expiresAt);
  return {
    token,
    user_id: userId,
    created_at: now,
    last_seen: now,
    expires_at: expiresAt,
  };
}

/**
 * Look up a session by token, bump last_seen and expires_at if it's still
 * valid, and return the user. Returns null if missing or expired.
 */
export function resolveSession(token: string): User | null {
  const sess = stmts.getSession.get(token) as Session | undefined;
  if (!sess) return null;
  const now = Date.now();
  if (sess.expires_at < now) {
    stmts.deleteSession.run(token);
    return null;
  }
  stmts.bumpSession.run(now, now + SESSION_TTL_MS, token);
  return getUserById(sess.user_id) ?? null;
}

export function deleteSession(token: string) {
  stmts.deleteSession.run(token);
}

export function purgeExpiredSessions() {
  stmts.deleteExpiredSessions.run(Date.now());
}
