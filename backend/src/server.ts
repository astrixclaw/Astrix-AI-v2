/**
 * Astrix Home backend entry point.
 *
 * Boots Fastify, mounts CORS so the desktop app (running on file://) can hit
 * us, schedules a periodic sweep of expired sessions, and starts listening on
 * 0.0.0.0 so LAN clients can reach the service.
 */
import cors from "@fastify/cors";
import Fastify from "fastify";
import { authRoutes } from "./routes/auth.js";
import { purgeExpiredSessions } from "./services/auth.js";

const PORT = Number(process.env.PORT ?? 18800);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = Fastify({
  logger: {
    transport: { target: "pino-pretty", options: { colorize: true } },
  },
});

// Permissive CORS: the desktop app sits on file:// in production and
// http://localhost:5173 in dev. There are no browser users of this API, so
// allowing all origins is fine — auth comes from the bearer token.
await app.register(cors, { origin: true, credentials: false });

await app.register(authRoutes);

app.get("/api/health", async () => ({ ok: true, ts: Date.now() }));

// Cleanup loop: prune expired sessions every 5 minutes.
const purgeTimer = setInterval(purgeExpiredSessions, 5 * 60 * 1000);
purgeTimer.unref();

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`🚀 Astrix Home backend listening on ${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
