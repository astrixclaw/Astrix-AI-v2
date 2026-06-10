/**
 * Avatar routes.
 *
 *   GET    /api/users/:id/avatar    -> WebP bytes (or 404)
 *   POST   /api/me/avatar           -> upload your own (multipart)
 *   POST   /api/admin/users/:id/avatar -> admin uploads anyone's
 *   DELETE /api/me/avatar           -> clear your own
 *   DELETE /api/admin/users/:id/avatar -> admin clears anyone's
 *
 * GET is intentionally public (no auth) so the renderer can <img src=...>
 * without juggling tokens. Avatar bytes are not sensitive; the user table
 * already tells you who exists in the household.
 *
 * Uploads use multipart/form-data so the desktop can <input type="file">.
 * We also accept raw bodies (`Content-Type: image/*`) as a fallback for
 * scripts and curl.
 */
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { getUserById } from "../services/auth.js";
import {
  avatarMtime,
  avatarPath,
  deleteAvatar,
  hasAvatar,
  writeAvatar,
} from "../services/avatars.js";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB upload limit before resize

export async function avatarRoutes(app: FastifyInstance) {
  // ---- public read ---------------------------------------------------

  app.get<{ Params: { id: string } }>(
    "/api/users/:id/avatar",
    async (req, reply) => {
      const id = req.params.id;
      if (!hasAvatar(id)) return reply.code(404).send({ error: "no_avatar" });

      const mtime = avatarMtime(id);
      // HTTP dates only have second precision, so round mtime down to the
      // second before formatting + comparing. Otherwise the same client
      // sending back the Last-Modified we just gave them would mismatch on
      // sub-second drift.
      const mtimeSec = mtime ? Math.floor(mtime / 1000) * 1000 : null;
      const lastMod = mtimeSec ? new Date(mtimeSec).toUTCString() : undefined;

      const ifMod = req.headers["if-modified-since"];
      if (mtimeSec && typeof ifMod === "string") {
        const since = Date.parse(ifMod);
        if (!Number.isNaN(since) && mtimeSec <= since) {
          return reply.code(304).send();
        }
      }

      reply.header("Content-Type", "image/webp");
      if (lastMod) reply.header("Last-Modified", lastMod);
      reply.header("Cache-Control", "public, max-age=60, must-revalidate");
      return reply.send(createReadStream(avatarPath(id)));
    },
  );

  // ---- shared upload helper ------------------------------------------

  async function handleUpload(
    req: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
    userId: string,
  ) {
    const target = getUserById(userId);
    if (!target) return reply.code(404).send({ error: "user_not_found" });

    let buf: Buffer | null = null;
    const ctype = (req.headers["content-type"] ?? "").toLowerCase();

    if (ctype.startsWith("multipart/")) {
      try {
        const file = await (
          req as unknown as {
            file: () => Promise<{
              file: NodeJS.ReadableStream;
              mimetype: string;
            } | null>;
          }
        ).file();
        if (!file) return reply.code(400).send({ error: "no_file" });
        const chunks: Buffer[] = [];
        for await (const chunk of file.file as AsyncIterable<Buffer>) {
          chunks.push(chunk);
          // Avoid pulling huge files into memory.
          if (chunks.reduce((n, c) => n + c.length, 0) > MAX_AVATAR_BYTES) {
            return reply.code(413).send({ error: "too_large" });
          }
        }
        buf = Buffer.concat(chunks);
      } catch (e) {
        return reply
          .code(400)
          .send({ error: e instanceof Error ? e.message : "multipart_error" });
      }
    } else if (ctype.startsWith("image/")) {
      // Raw body (used by tests / curl)
      const raw = req.body;
      if (raw instanceof Buffer) {
        if (raw.length > MAX_AVATAR_BYTES) {
          return reply.code(413).send({ error: "too_large" });
        }
        buf = raw;
      }
    }

    if (!buf || buf.length === 0) {
      return reply.code(400).send({ error: "no_file" });
    }

    try {
      const { bytes } = await writeAvatar(target.id, buf);
      return { ok: true, bytes };
    } catch (e) {
      // sharp throws when the input isn't a real image
      return reply
        .code(415)
        .send({ error: e instanceof Error ? e.message : "bad_image" });
    }
  }

  // ---- self ----------------------------------------------------------

  app.post(
    "/api/me/avatar",
    { preHandler: requireAuth },
    async (req, reply) => handleUpload(req, reply, req.user!.id),
  );

  app.delete(
    "/api/me/avatar",
    { preHandler: requireAuth },
    async (req) => {
      deleteAvatar(req.user!.id);
      return { ok: true };
    },
  );

  // ---- admin ---------------------------------------------------------

  app.post<{ Params: { id: string } }>(
    "/api/admin/users/:id/avatar",
    { preHandler: requireAdmin },
    async (req, reply) => handleUpload(req, reply, req.params.id),
  );

  app.delete<{ Params: { id: string } }>(
    "/api/admin/users/:id/avatar",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const target = getUserById(req.params.id);
      if (!target) return reply.code(404).send({ error: "user_not_found" });
      deleteAvatar(target.id);
      return { ok: true };
    },
  );
}
