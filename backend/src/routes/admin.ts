/**
 * Admin-only routes.
 *
 * For Phase 4 we just expose the gateway-config get/set — that's what unblocks
 * the chat feature for the whole household. Phase 7 fills this file in with
 * user management and permission grants.
 */
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../middleware/auth.js";
import { getGatewayConfig, setGatewayConfig } from "../services/settings.js";

export async function adminRoutes(app: FastifyInstance) {
  app.get(
    "/api/admin/gateway",
    { preHandler: requireAdmin },
    async () => getGatewayConfig(),
  );

  app.patch<{
    Body: { url?: string; token?: string; agent?: string };
  }>(
    "/api/admin/gateway",
    { preHandler: requireAdmin },
    async (req) => setGatewayConfig(req.body ?? {}),
  );
}
