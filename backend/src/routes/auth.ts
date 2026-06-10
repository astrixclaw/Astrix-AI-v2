/**
 * Auth routes.
 *
 * Public:
 *   GET  /api/setup-status              -- is a first-launch admin setup needed?
 *   POST /api/setup                     -- one-shot: create the admin user
 *   POST /api/login                     -- exchange username + PIN for a token
 *
 * Authed:
 *   POST /api/logout                    -- invalidate the current token
 *   GET  /api/me                        -- current user (incl. permissions)
 *   POST /api/me/pin                    -- change own PIN
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import {
  countAdmins,
  createSession,
  createUser,
  deleteSession,
  getUserByUsername,
  setUserPin,
  verifyPin,
} from "../services/auth.js";
import { listUserPermissions } from "../services/permissions.js";

export async function authRoutes(app: FastifyInstance) {
  // ---- First-launch setup -------------------------------------------------

  app.get("/api/setup-status", async () => ({
    needsSetup: countAdmins() === 0,
  }));

  app.post<{
    Body: { username: string; pin: string };
  }>("/api/setup", async (req, reply) => {
    // Only allowed when no admin exists yet. After that, this route is dead.
    if (countAdmins() > 0) {
      return reply.code(409).send({ error: "already_set_up" });
    }
    const { username, pin } = req.body ?? {};
    if (!username || !pin) {
      return reply.code(400).send({ error: "username_and_pin_required" });
    }
    if (pin.length < 4) {
      return reply.code(400).send({ error: "pin_too_short" });
    }
    const user = await createUser({
      username: username.trim(),
      pin,
      isAdmin: true,
    });
    const session = createSession(user.id);
    return { user, token: session.token, expires_at: session.expires_at };
  });

  // ---- Login --------------------------------------------------------------

  app.post<{
    Body: { username: string; pin: string };
  }>("/api/login", async (req, reply) => {
    const { username, pin } = req.body ?? {};
    if (!username || !pin) {
      return reply.code(400).send({ error: "username_and_pin_required" });
    }
    const row = getUserByUsername(username);
    // Same error for "wrong user" vs "wrong pin" so we don't leak who exists.
    if (!row) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    const ok = await verifyPin(pin, row.pin_hash);
    if (!ok) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    const session = createSession(row.id);
    return {
      user: {
        id: row.id,
        username: row.username,
        is_admin: row.is_admin,
        avatar: row.avatar,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      token: session.token,
      expires_at: session.expires_at,
    };
  });

  // ---- Authed --------------------------------------------------------------

  app.post("/api/logout", { preHandler: requireAuth }, async (req) => {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      deleteSession(header.slice("Bearer ".length).trim());
    }
    return { ok: true };
  });

  app.get("/api/me", { preHandler: requireAuth }, async (req) => {
    const user = req.user!;
    return {
      user,
      permissions: listUserPermissions(user.id),
    };
  });

  app.post<{ Body: { pin: string } }>(
    "/api/me/pin",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { pin } = req.body ?? {};
      if (!pin || pin.length < 4) {
        return reply.code(400).send({ error: "pin_too_short" });
      }
      await setUserPin(req.user!.id, pin);
      return { ok: true };
    },
  );
}
