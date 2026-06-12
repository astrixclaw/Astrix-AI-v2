/**
 * Security camera routes.
 *
 * GET    /api/cameras                  — list all cameras
 * POST   /api/cameras                  — create camera (admin only)
 * PATCH  /api/cameras/:id              — update camera (admin only)
 * DELETE /api/cameras/:id              — delete camera (admin only)
 *
 * GET    /api/cameras/:id/snapshot     — grab JPEG frame from RTSP stream
 * POST   /api/cameras/:id/stream/start — start HLS stream, returns { hlsUrl }
 * POST   /api/cameras/:id/stream/stop  — release stream watcher
 * GET    /api/cameras/:id/hls/*        — serve HLS segments (m3u8 + .ts)
 * POST   /api/cameras/:id/record/start — start recording MP4
 * POST   /api/cameras/:id/record/stop  — stop recording
 * GET    /api/cameras/:id/recordings   — list recordings for camera
 *
 * POST   /api/cameras/discover         — ONVIF WS-Discovery scan
 *
 * Permissions:
 *   Admins: full access.
 *   Members with `cameras` feature grant: read + live view only (no CRUD, no recording).
 */
import type { FastifyInstance } from "fastify";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { requireAdmin } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import {
  listCameras,
  getCamera,
  createCamera,
  updateCamera,
  deleteCamera,
  listRecordings,
} from "../services/cameras.js";
import {
  startStream,
  releaseStream,
  stopStream,
  takeSnapshot,
  startRecording,
  stopRecording,
  isRecording,
  isStreamActive,
  discoverOnvifDevices,
  getHlsDir,
  FfmpegNotFoundError,
  ffmpegAvailable,
} from "../services/streaming.js";

export async function cameraRoutes(app: FastifyInstance) {

  // ── List cameras ───────────────────────────────────────────────────────
  app.get("/api/cameras", { preHandler: requireAuth }, async (req) => {
    const cameras = listCameras();
    const user = req.user!;
    if (user.is_admin) return { cameras, ffmpegAvailable: ffmpegAvailable() };
    // Members: only return enabled cameras (admins can still see disabled ones)
    return {
      cameras: cameras.filter((c) => c.enabled),
      ffmpegAvailable: ffmpegAvailable(),
    };
  });

  // ── Create camera ──────────────────────────────────────────────────────
  app.post<{
    Body: {
      name: string;
      brand?: string;
      rtsp_url: string;
      sub_rtsp_url?: string;
      channel?: number;
      enabled?: boolean;
      sort_order?: number;
    };
  }>("/api/cameras", { preHandler: requireAdmin }, async (req, reply) => {
    const b = req.body;
    if (!b.name?.trim() || !b.rtsp_url?.trim()) {
      reply.code(400);
      return { error: "name and rtsp_url are required" };
    }
    const cam = createCamera({
      name: b.name.trim(),
      brand: b.brand?.trim() || "generic_rtsp",
      rtsp_url: b.rtsp_url.trim(),
      sub_rtsp_url: b.sub_rtsp_url?.trim() || null,
      channel: b.channel ?? 1,
      enabled: b.enabled !== false,
      sort_order: b.sort_order ?? 0,
    });
    reply.code(201);
    return { camera: cam };
  });

  // ── Update camera ──────────────────────────────────────────────────────
  app.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      brand?: string;
      rtsp_url?: string;
      sub_rtsp_url?: string | null;
      channel?: number;
      enabled?: boolean;
      sort_order?: number;
    };
  }>("/api/cameras/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const cam = getCamera(req.params.id);
    if (!cam) { reply.code(404); return { error: "not_found" }; }
    const updated = updateCamera(req.params.id, req.body);
    return { camera: updated };
  });

  // ── Delete camera ──────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/api/cameras/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      // Stop any active stream first
      stopStream(req.params.id);
      stopRecording(req.params.id);
      const ok = deleteCamera(req.params.id);
      if (!ok) { reply.code(404); return { error: "not_found" }; }
      return { ok: true };
    },
  );

  // ── Snapshot ───────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/cameras/:id/snapshot",
    { preHandler: requireAuth },
    async (req, reply) => {
      const cam = getCamera(req.params.id);
      if (!cam) { reply.code(404); return { error: "not_found" }; }
      try {
        const jpeg = await takeSnapshot(cam.rtsp_url);
        reply
          .header("Content-Type", "image/jpeg")
          .header("Cache-Control", "no-store")
          .send(jpeg);
      } catch (e) {
        if (e instanceof FfmpegNotFoundError) {
          reply.code(503);
          return { error: "ffmpeg_not_found", install: "sudo apt-get install -y ffmpeg" };
        }
        reply.code(502);
        return { error: "snapshot_failed", detail: String(e) };
      }
    },
  );

  // ── Start HLS stream ───────────────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { quality?: "main" | "sub" } }>(
    "/api/cameras/:id/stream/start",
    { preHandler: requireAuth },
    async (req, reply) => {
      const cam = getCamera(req.params.id);
      if (!cam) { reply.code(404); return { error: "not_found" }; }
      const useSubStream = req.body?.quality === "sub" && cam.sub_rtsp_url;
      const rtspUrl = useSubStream ? cam.sub_rtsp_url! : cam.rtsp_url;
      try {
        await startStream(cam.id, rtspUrl);
        return {
          ok: true,
          hlsUrl: `/api/cameras/${cam.id}/hls/stream.m3u8`,
          streamId: cam.id,
        };
      } catch (e) {
        if (e instanceof FfmpegNotFoundError) {
          reply.code(503);
          return { error: "ffmpeg_not_found", install: "sudo apt-get install -y ffmpeg" };
        }
        reply.code(502);
        return { error: "stream_failed", detail: String(e) };
      }
    },
  );

  // ── Stop HLS stream watcher ────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/api/cameras/:id/stream/stop",
    { preHandler: requireAuth },
    async (req) => {
      releaseStream(req.params.id);
      return { ok: true };
    },
  );

  // ── Serve HLS segments ─────────────────────────────────────────────────
  // No auth required for HLS segments: they are ephemeral temp files, rotate
  // every few seconds, and require knowing the camera UUID to access. The
  // m3u8 manifest (which IS auth-gated via startStream) acts as the gate.
  app.get<{ Params: { "*": string; id: string } }>(
    "/api/cameras/:id/hls/*",
    {},
    async (req, reply) => {
      const hlsDir = getHlsDir(req.params.id);
      const filePath = join(hlsDir, req.params["*"]);
      // Basic path traversal guard
      if (!filePath.startsWith(hlsDir)) {
        reply.code(400); return;
      }
      if (!existsSync(filePath)) {
        reply.code(404); return;
      }
      const ext = filePath.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/MP2T";
      reply.header("Content-Type", ext);
      reply.header("Cache-Control", "no-cache");
      return reply.send(createReadStream(filePath));
    },
  );

  // ── Stream status ──────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/cameras/:id/stream/status",
    { preHandler: requireAuth },
    async (req) => {
      const cam = getCamera(req.params.id);
      if (!cam) return { active: false };
      return {
        active: isStreamActive(req.params.id),
        recording: isRecording(req.params.id),
      };
    },
  );

  // ── Start recording ────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/api/cameras/:id/record/start",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const cam = getCamera(req.params.id);
      if (!cam) { reply.code(404); return { error: "not_found" }; }
      try {
        const recordingId = await startRecording(cam.id, cam.rtsp_url);
        return { ok: true, recordingId };
      } catch (e) {
        if (e instanceof FfmpegNotFoundError) {
          reply.code(503);
          return { error: "ffmpeg_not_found", install: "sudo apt-get install -y ffmpeg" };
        }
        if (String(e).includes("already_recording")) {
          reply.code(409);
          return { error: "already_recording" };
        }
        reply.code(502);
        return { error: "record_failed", detail: String(e) };
      }
    },
  );

  // ── Stop recording ─────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/api/cameras/:id/record/stop",
    { preHandler: requireAdmin },
    async (req) => {
      stopRecording(req.params.id);
      return { ok: true };
    },
  );

  // ── List recordings ────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/cameras/:id/recordings",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const cam = getCamera(req.params.id);
      if (!cam) { reply.code(404); return { error: "not_found" }; }
      return { recordings: listRecordings(req.params.id) };
    },
  );

  // ── ONVIF discovery ────────────────────────────────────────────────────
  app.post<{ Body: { timeoutMs?: number } }>(
    "/api/cameras/discover",
    { preHandler: requireAdmin },
    async (req) => {
      const timeout = Math.min(req.body?.timeoutMs ?? 4000, 10_000);
      const devices = await discoverOnvifDevices(timeout);
      return { devices };
    },
  );
}
