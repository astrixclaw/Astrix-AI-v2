/**
 * Astrix Home backend entry point.
 *
 * Boots Fastify, mounts CORS so the desktop app (running on file://) can hit
 * us, schedules a periodic sweep of expired sessions, and starts listening on
 * 0.0.0.0 so LAN clients can reach the service.
 */
import cors from "@fastify/cors";
import Fastify from "fastify";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { lightingRoutes } from "./routes/lighting.js";
import { purgeExpiredSessions } from "./services/auth.js";

const PORT = Number(process.env.PORT ?? 18800);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = Fastify({
  logger: {
    transport: { target: "pino-pretty", options: { colorize: true } },
  },
});

// Fastify rejects empty JSON bodies by default. Some of our routes legitimately
// take no body (logout, new-conversation). Treat empty as `{}`.
app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (_req, raw, done) => {
    const body = (raw as string | Buffer).toString().trim();
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);

// Permissive CORS: the desktop app sits on file:// in production and
// http://localhost:5173 in dev. There are no browser users of this API, so
// allowing all origins is fine — auth comes from the bearer token.
await app.register(cors, { origin: true, credentials: false });

await app.register(authRoutes);
await app.register(chatRoutes);
await app.register(lightingRoutes);
await app.register(adminRoutes);

app.get("/api/health", async () => ({ ok: true, ts: Date.now() }));

// Cleanup loop: prune expired sessions every 5 minutes.
const purgeTimer = setInterval(purgeExpiredSessions, 5 * 60 * 1000);
purgeTimer.unref();

// Never crash the whole process on a stray exception or rejection. The SSE
// chat route used to die on socket-write-after-close; this is the final safety
// net so anything else like it keeps us up instead of taking the household
// down. We still log loudly so we can fix the underlying cause.
process.on("uncaughtException", (err) => {
  app.log.error({ err }, "uncaughtException (process kept alive)");
});
process.on("unhandledRejection", (reason) => {
  app.log.error({ err: reason }, "unhandledRejection (process kept alive)");
});

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`🚀 Astrix Home backend listening on ${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
