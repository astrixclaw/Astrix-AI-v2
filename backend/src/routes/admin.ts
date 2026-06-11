/**
 * Admin-only routes.
 *
 * Two groups:
 *   - Gateway config (Phase 4) — admin sets the OpenClaw URL + token.
 *   - User management + permissions (Phase 7) — admin invites household
 *     members, sets their PINs, grants/revokes features.
 *
 * Safety rules baked in here (not just on the client side):
 *   - Can't delete yourself.
 *   - Can't demote the last remaining admin.
 *   - Admins always pass permission checks, so we don't store rows for them
 *     in the permissions table — `setUserFeaturePermissions` is for members.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { requireAdmin } from "../middleware/auth.js";
import {
  countAdmins,
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  setUserAdmin,
  setUserAvatar,
  setUserPin,
  type User,
} from "../services/auth.js";
import {
  FEATURES,
  listUserPermissions,
  setUserFeaturePermissions,
  type FeatureId,
} from "../services/permissions.js";
import {
  getGatewayConfig,
  setGatewayConfig,
  setHueBridgeConfig,
  type GatewayConfig,
} from "../services/settings.js";
import { Agent, fetch as undiciFetch } from "undici";

// ---- gateway helpers --------------------------------------------------

function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 8) return "••••";
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

function redactGateway(cfg: GatewayConfig): GatewayConfig {
  return { ...cfg, token: maskToken(cfg.token) };
}

// ---- user serialisation ------------------------------------------------

interface AdminUserView extends User {
  permissions: { feature: FeatureId; resource_id: string | null }[];
}

function viewWithPerms(u: User): AdminUserView {
  const perms = listUserPermissions(u.id).map((p) => ({
    feature: p.feature as FeatureId,
    resource_id: p.resource_id,
  }));
  return { ...u, permissions: perms };
}

function isKnownFeature(f: unknown): f is FeatureId {
  return f === FEATURES.CHAT || f === FEATURES.LIGHTING || f === FEATURES.GROUP_CHAT || f === FEATURES.CAMERAS;
}

/** 4-32 chars, lowercase letters/digits/underscore only — no spaces, no caps. */
function validUsername(u: string): boolean {
  return /^[a-z0-9_]{3,32}$/.test(u);
}

function validPin(p: string): boolean {
  return /^[0-9]{4,12}$/.test(p);
}

// ---- exported router ---------------------------------------------------

export async function adminRoutes(app: FastifyInstance) {
  // ---------- Gateway (unchanged from Phase 4) ----------

  app.get(
    "/api/admin/gateway",
    { preHandler: requireAdmin },
    async () => redactGateway(getGatewayConfig()),
  );

  app.patch<{
    Body: { url?: string; token?: string; agent?: string; memberAgent?: string };
  }>(
    "/api/admin/gateway",
    { preHandler: requireAdmin },
    async (req) => redactGateway(setGatewayConfig(req.body ?? {})),
  );

  // ---------- Users ----------

  // List every user with their permissions inlined.
  app.get(
    "/api/admin/users",
    { preHandler: requireAdmin },
    async () => ({ users: listUsers().map(viewWithPerms) }),
  );

  // Create a new household member.
  app.post<{
    Body: {
      username: string;
      pin: string;
      is_admin?: boolean;
      avatar?: string | null;
      permissions?: {
        chat?: boolean;
        group_chat?: boolean;
        /** Room ids the user can control. Pass [] to revoke all. */
        lighting?: string[];
      };
    };
  }>(
    "/api/admin/users",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const b = req.body ?? ({} as Record<string, unknown>);
      const username = String(b.username ?? "").trim().toLowerCase();
      const pin = String(b.pin ?? "");
      if (!validUsername(username)) {
        return reply.code(400).send({ error: "invalid_username" });
      }
      if (!validPin(pin)) {
        return reply.code(400).send({ error: "invalid_pin" });
      }
      try {
        const user = await createUser({
          username,
          pin,
          isAdmin: !!b.is_admin,
          avatar: b.avatar ?? null,
        });
        // Apply optional initial permissions.
        if (b.permissions) {
          if (typeof b.permissions.chat === "boolean") {
            setUserFeaturePermissions(
              user.id,
              FEATURES.CHAT,
              b.permissions.chat ? [null] : [],
            );
          }
          if (typeof b.permissions.group_chat === "boolean") {
            setUserFeaturePermissions(
              user.id,
              FEATURES.GROUP_CHAT,
              b.permissions.group_chat ? [null] : [],
            );
          }
          if (Array.isArray(b.permissions.lighting)) {
            setUserFeaturePermissions(
              user.id,
              FEATURES.LIGHTING,
              b.permissions.lighting,
            );
          }
        }
        return { user: viewWithPerms(user) };
      } catch (e) {
        // UNIQUE constraint = duplicate username.
        if (e instanceof Error && /UNIQUE/i.test(e.message)) {
          return reply.code(409).send({ error: "username_taken" });
        }
        throw e;
      }
    },
  );

  // Edit a user: PIN, avatar, admin flag. Each field optional.
  app.patch<{
    Params: { id: string };
    Body: {
      pin?: string;
      avatar?: string | null;
      is_admin?: boolean;
    };
  }>(
    "/api/admin/users/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const target = getUserById(req.params.id);
      if (!target) return reply.code(404).send({ error: "not_found" });

      const b = req.body ?? {};

      // Demoting the last admin would lock everyone out. Block it.
      if (
        b.is_admin === false &&
        target.is_admin &&
        countAdmins() <= 1
      ) {
        return reply.code(409).send({ error: "last_admin" });
      }

      if (typeof b.pin === "string") {
        if (!validPin(b.pin)) {
          return reply.code(400).send({ error: "invalid_pin" });
        }
        await setUserPin(target.id, b.pin);
      }
      if ("avatar" in b) {
        setUserAvatar(target.id, b.avatar ?? null);
      }
      if (typeof b.is_admin === "boolean") {
        setUserAdmin(target.id, b.is_admin);
      }

      const fresh = getUserById(target.id)!;
      return { user: viewWithPerms(fresh) };
    },
  );

  // Replace a user's grants for one feature atomically.
  //   chat / group_chat: body { granted: boolean }
  //   lighting:          body { rooms: string[] }   (room ids)
  app.put<{
    Params: { id: string; feature: string };
    Body: { granted?: boolean; rooms?: string[] };
  }>(
    "/api/admin/users/:id/permissions/:feature",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const target = getUserById(req.params.id);
      if (!target) return reply.code(404).send({ error: "not_found" });

      const feature = req.params.feature;
      if (!isKnownFeature(feature)) {
        return reply.code(400).send({ error: "unknown_feature" });
      }

      const b = req.body ?? {};
      if (feature === FEATURES.LIGHTING) {
        const rooms = Array.isArray(b.rooms) ? b.rooms.filter((r) => typeof r === "string") : [];
        setUserFeaturePermissions(target.id, FEATURES.LIGHTING, rooms);
      } else if (feature === FEATURES.CAMERAS) {
        // cameras — boolean toggle (future: could be scoped to camera ids)
        setUserFeaturePermissions(target.id, FEATURES.CAMERAS, b.granted ? [null] : []);
      } else {
        // chat / group_chat — boolean toggle, encoded as wildcard grant
        setUserFeaturePermissions(
          target.id,
          feature,
          b.granted ? [null] : [],
        );
      }
      return { user: viewWithPerms(target) };
    },
  );

  // -------- Hue bridge: discover ----------------------------------------

  /**
   * Try to find Hue bridges on the LAN.
   * 1. meethue.com N-UPnP endpoint (fastest, works if internet is available).
   * 2. Manual-entry hint (always appended).
   *
   * Returns { candidates: [{ ip, id }] }.
   */
  app.post("/api/admin/hue/discover", { preHandler: requireAdmin }, async (_req, reply) => {
    const candidates: { ip: string; id: string }[] = [];

    // ---- meethue.com N-UPnP ----
    try {
      const res = await undiciFetch("https://discovery.meethue.com/", {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = (await res.json()) as { internalipaddress?: string; id?: string }[];
        if (Array.isArray(data)) {
          for (const entry of data) {
            if (entry.internalipaddress) {
              candidates.push({
                ip: entry.internalipaddress,
                id: entry.id ?? entry.internalipaddress,
              });
            }
          }
        }
      }
    } catch {
      // Network or timeout — continue to next strategy.
    }

    if (candidates.length === 0) {
      // No candidates found — caller should offer manual entry.
      return reply.code(200).send({ candidates, hint: "manual_entry" });
    }

    return reply.code(200).send({ candidates });
  });

  // -------- Hue bridge: pair ----------------------------------------

  /**
   * Attempt to pair with the bridge at the given IP.
   * - Calls POST https://<ip>/api with `{ devicetype: "AstrixHome#<hostname>" }`.
   * - If the link button hasn't been pressed the bridge returns error type 101;
   *   we forward `{ pending: true }` so the client can start polling.
   * - On success we store ip + applicationKey in the settings table so
   *   hue.ts picks it up from the DB on next load, and also invalidate the
   *   in-memory secrets cache so the change is live immediately.
   */
  app.post<{ Body: { ip: string } }>(
    "/api/admin/hue/pair",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const ip = String(req.body?.ip ?? "").trim();
      if (!ip) return reply.code(400).send({ error: "ip_required" });

      const hostname = (await import("node:os")).hostname();
      const devicetype = `AstrixHome#${hostname.slice(0, 19)}`;

      // The Hue v1 pairing endpoint lives at http(s)://<ip>/api.
      // We must use undici directly so the dispatcher field is respected
      // (Node 22 global fetch silently drops it on self-signed TLS).
      const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });

      let body: unknown;
      try {
        const res = await undiciFetch(`https://${ip}/api`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ devicetype }),
          dispatcher,
          signal: AbortSignal.timeout(6000),
        });
        body = await res.json();
      } catch (e) {
        return reply.code(502).send({ error: "bridge_unreachable", detail: String(e) });
      }

      // Hue v1 always returns an array.
      const arr = Array.isArray(body) ? body : [body];
      const first = arr[0] as Record<string, unknown>;

      if (first?.error) {
        const err = first.error as Record<string, unknown>;
        if (Number(err.type) === 101) {
          // Link button not yet pressed.
          return reply.code(200).send({ pending: true });
        }
        return reply.code(400).send({ error: "bridge_error", detail: err.description });
      }

      if (first?.success) {
        const success = first.success as Record<string, unknown>;
        const applicationKey = String(success.username ?? "");
        if (!applicationKey) {
          return reply.code(502).send({ error: "no_application_key" });
        }

        // Persist to DB.
        setHueBridgeConfig({ ip, applicationKey });

        return reply.code(200).send({ applicationKey });
      }

      return reply.code(502).send({ error: "unexpected_response", body });
    },
  );

  // Delete a user.
  app.delete<{ Params: { id: string } }>(
    "/api/admin/users/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const target = getUserById(req.params.id);
      if (!target) return reply.code(404).send({ error: "not_found" });

      // Don't delete yourself — too easy to lock out by accident.
      if (target.id === req.user!.id) {
        return reply.code(409).send({ error: "cant_delete_self" });
      }
      // Last-admin guard.
      if (target.is_admin && countAdmins() <= 1) {
        return reply.code(409).send({ error: "last_admin" });
      }

      deleteUser(target.id);
      return { ok: true };
    },
  );
}

// Avoid `noUnusedLocals` warnings: this re-export keeps types narrow even when
// only used via the route generics above.
export type { FastifyReply };
