/**
 * Auth + admin guards for Fastify routes.
 *
 * Routes attach these as `preHandler` hooks. On success, the request gains
 * `req.user` (typed below). On failure, the request gets a 401 / 403 and
 * never enters the handler.
 *
 * Token transport: `Authorization: Bearer <hex>`. We also accept `?token=`
 * on the WebSocket upgrade because browser WebSocket APIs don't let you set
 * custom headers — that's the only place query-param tokens are allowed.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveSession, type User } from "../services/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
  }
}

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  // Allowed for WebSocket upgrades only (see comment above).
  const q = (req.query as { token?: string } | undefined)?.token;
  return typeof q === "string" && q.length > 0 ? q : null;
}

/** preHandler: requires a valid session token. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = extractToken(req);
  if (!token) {
    return reply.code(401).send({ error: "missing_token" });
  }
  const user = resolveSession(token);
  if (!user) {
    return reply.code(401).send({ error: "invalid_or_expired_token" });
  }
  req.user = user;
}

/** preHandler: requires the caller to be an admin. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  if (reply.sent) return; // requireAuth already failed
  if (!req.user?.is_admin) {
    return reply.code(403).send({ error: "admin_only" });
  }
}
