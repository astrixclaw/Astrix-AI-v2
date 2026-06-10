/**
 * Admin-only routes.
 *
 * For Phase 4 we just expose the gateway-config get/set — that's what unblocks
 * the chat feature for the whole household. Phase 7 fills this file in with
 * user management and permission grants.
 */
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../middleware/auth.js";
import { getGatewayConfig, setGatewayConfig, type GatewayConfig } from "../services/settings.js";

/**
 * Never return the raw gateway token over the wire — show a short preview so
 * the UI can confirm "yes, a token is set" without splattering it in plaintext.
 */
function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 8) return "••••";
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

function redact(cfg: GatewayConfig): GatewayConfig {
  return { ...cfg, token: maskToken(cfg.token) };
}

export async function adminRoutes(app: FastifyInstance) {
  app.get(
    "/api/admin/gateway",
    { preHandler: requireAdmin },
    async () => redact(getGatewayConfig()),
  );

  app.patch<{
    Body: { url?: string; token?: string; agent?: string };
  }>(
    "/api/admin/gateway",
    { preHandler: requireAdmin },
    async (req) => redact(setGatewayConfig(req.body ?? {})),
  );
}
