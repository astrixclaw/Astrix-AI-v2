/**
 * Lighting routes — Philips Hue.
 *
 *   GET   /api/lighting/rooms              -> rooms[] (filtered by permission)
 *   POST  /api/lighting/rooms/:id/on       -> { on: true|false }
 *   POST  /api/lighting/rooms/:id/brightness -> { brightness: 0..100 }
 *
 * Permission gating (strict mode):
 *   - Admin: every room.
 *   - Non-admin: only rooms they have `lighting:<room_id>` for, or the
 *     wildcard `lighting` grant. We filter the list before returning.
 *   - Commands re-check the permission server-side, since the client can
 *     send any room id it wants.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import {
  getSnapshot,
  isHueConfigured,
  setRoomBrightness,
  setRoomOn,
} from "../services/hue.js";
import { FEATURES, hasPermission } from "../services/permissions.js";

function visibleRoomFilter(userId: string) {
  return (roomId: string) => hasPermission(userId, FEATURES.LIGHTING, roomId);
}

function denyIfNotConfigured(reply: FastifyReply): boolean {
  if (!isHueConfigured()) {
    reply.code(503).send({ error: "hue_not_paired" });
    return true;
  }
  return false;
}

export async function lightingRoutes(app: FastifyInstance) {
  app.get(
    "/api/lighting/rooms",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (denyIfNotConfigured(reply)) return;
      try {
        const snap = await getSnapshot();
        const filter = visibleRoomFilter(req.user!.id);
        return { rooms: snap.rooms.filter((r) => filter(r.id)) };
      } catch (e) {
        return reply
          .code(502)
          .send({ error: e instanceof Error ? e.message : "hue_error" });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { on: boolean } }>(
    "/api/lighting/rooms/:id/on",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (denyIfNotConfigured(reply)) return;
      const roomId = req.params.id;
      if (!hasPermission(req.user!.id, FEATURES.LIGHTING, roomId)) {
        return reply.code(403).send({ error: "no_permission_room" });
      }
      const on = !!req.body?.on;
      try {
        await setRoomOn(roomId, on);
        // Return the fresh snapshot of just this room so the UI updates
        // without a second round-trip.
        const snap = await getSnapshot(true);
        const room = snap.rooms.find((r) => r.id === roomId);
        return { room };
      } catch (e) {
        return reply
          .code(502)
          .send({ error: e instanceof Error ? e.message : "hue_error" });
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: { brightness: number };
  }>(
    "/api/lighting/rooms/:id/brightness",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (denyIfNotConfigured(reply)) return;
      const roomId = req.params.id;
      if (!hasPermission(req.user!.id, FEATURES.LIGHTING, roomId)) {
        return reply.code(403).send({ error: "no_permission_room" });
      }
      const raw = Number(req.body?.brightness);
      if (!Number.isFinite(raw)) {
        return reply.code(400).send({ error: "invalid_brightness" });
      }
      try {
        await setRoomBrightness(roomId, raw);
        const snap = await getSnapshot(true);
        const room = snap.rooms.find((r) => r.id === roomId);
        return { room };
      } catch (e) {
        return reply
          .code(502)
          .send({ error: e instanceof Error ? e.message : "hue_error" });
      }
    },
  );
}
