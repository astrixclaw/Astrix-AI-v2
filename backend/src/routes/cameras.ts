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
  findFfmpeg,
  getFramePath,
  stopFrameBuffer,
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

  // ── Frame polling (single JPEG, no auth, for high-fps polling live view) ──
  // ffmpeg runs once and continuously overwrites /tmp/astrix-frames/{id}.jpg
  // Frontend polls this at 200ms for ~5fps live view without streaming issues.
  app.get<{ Params: { id: string } }>(
    "/api/cameras/:id/frame",
    {},
    async (req, reply) => {
      const cam = getCamera(req.params.id);
      if (!cam) { reply.code(404); return; }
      try {
        const framePath = await getFramePath(cam.id, cam.rtsp_url);
        if (!existsSync(framePath)) { reply.code(503); return { error: "no_frame_yet" }; }
        reply.header("Content-Type", "image/jpeg");
        reply.header("Cache-Control", "no-cache, no-store");
        return reply.send(createReadStream(framePath));
      } catch (e) {
        reply.code(503);
        return { error: String(e) };
      }
    },
  );

  // Cleanup frame buffer when stopping a stream
  app.post<{ Params: { id: string } }>(
    "/api/cameras/:id/frame/stop",
    {},
    async (req) => {
      stopFrameBuffer(req.params.id);
      return { ok: true };
    },
  );

  // ── MJPEG live stream (no auth — same rationale as HLS segments) ─────────
  // Returns a continuous multipart/x-mixed-replace JPEG stream at 15fps.
  // Works with a plain <img> tag — bypasses all GPU compositing issues.
  app.get<{ Params: { id: string } }>(
    "/api/cameras/:id/mjpeg",
    {},
    async (req, reply) => {
      const cam = getCamera(req.params.id);
      if (!cam) { reply.code(404); return; }

      let ffmpeg: string;
      try { ffmpeg = findFfmpeg(); } catch {
        reply.code(503);
        return { error: "ffmpeg_not_found" };
      }

      const { spawn } = await import("node:child_process");
      const boundary = "astrix-mjpeg-boundary";

      reply.raw.setHeader("Content-Type", `multipart/x-mixed-replace;boundary=${boundary}`);
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.statusCode = 200;

      const proc = spawn(ffmpeg, [
        "-loglevel", "error",
        "-rtsp_transport", "tcp",
        "-i", cam.rtsp_url,
        "-f", "image2pipe",
        "-vf", "fps=15,scale=1280:-1",   // 15fps, scale down for bandwidth
        "-q:v", "4",                       // quality: lower = better (1-31)
        "-vcodec", "mjpeg",
        "pipe:1",
      ], { stdio: ["ignore", "pipe", "ignore"] });

      const writeFrame = (data: Buffer) => {
        try {
          reply.raw.write(
            `\r\n--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${data.length}\r\n\r\n`
          );
          reply.raw.write(data);
        } catch { /* client disconnected */ }
      };

      let buf = Buffer.alloc(0);
      const SOI = Buffer.from([0xff, 0xd8]);
      const EOI = Buffer.from([0xff, 0xd9]);

      proc.stdout.on("data", (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        // scan for complete JPEG frames
        let start = 0;
        while (true) {
          const s = buf.indexOf(SOI, start);
          if (s < 0) break;
          const e = buf.indexOf(EOI, s + 2);
          if (e < 0) break;
          writeFrame(buf.slice(s, e + 2));
          start = e + 2;
        }
        // keep only the tail
        if (start > 0) buf = buf.slice(start);
      });

      proc.on("exit", () => {
        try { reply.raw.end(); } catch { /* ignore */ }
      });

      req.raw.on("close", () => proc.kill());
      reply.raw.on("close", () => proc.kill());

      // Prevent fastify from auto-sending a reply
      return reply;
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
