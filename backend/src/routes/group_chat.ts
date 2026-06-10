/**
 * Group chat routes.
 *
 *   GET  /api/group/messages?limit=&before=  -> recent messages, oldest-first
 *   POST /api/group/messages   { body }      -> append + broadcast, returns row
 *   WS   /api/group/ws?token=                -> live stream of new messages
 *
 * Why HTTP for posting *and* a WS stream? Because:
 *   - HTTP gives us a clean retry story on flaky LAN connections.
 *   - WS-only would mean every client has to handle the "I sent but did the
 *     server hear me?" ambiguity. Letting the REST POST return the persisted
 *     row keeps the optimistic-render logic identical to the personal chat.
 *
 * Permission gating: `group_chat` is required for every route. We also gate
 * the WS upgrade \u2014 see the wsHandler below \u2014 because Fastify hooks don't
 * run for upgraded sockets without help.
 */
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireAuth } from "../middleware/auth.js";
import { resolveSession } from "../services/auth.js";
import {
  emitTyping,
  groupHub,
  markRead,
  postMessage,
  recentMessages,
  type GroupAttachmentSummary,
  type GroupMessage,
  type TypingEvent,
} from "../services/group_chat.js";
import {
  GROUP_MAX_FILE_BYTES,
  GROUP_MAX_FILES_PER_MESSAGE,
  getGroupAttachment,
  groupKindFor,
  linkGroupAttachmentsToMessage,
  listGroupAttachmentsForMessage,
  storeGroupAttachment,
  type GroupAttachmentRow,
} from "../services/group_attachments.js";
import { FEATURES, hasPermission } from "../services/permissions.js";

function summary(a: GroupAttachmentRow): GroupAttachmentSummary {
  return {
    id: a.id,
    mime: a.mime,
    size: a.size,
    original_name: a.original_name,
    kind: a.kind,
  };
}

function attachPath(row: GroupAttachmentRow): string {
  // Mirrors group_attachments.ts internal layout. Kept here so we can stream
  // without exporting filesystem helpers from the service.
  const __dirname2 = dirname(fileURLToPath(import.meta.url));
  const d = new Date(row.created_at);
  const bucket = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const ext =
    row.kind === "image"
      ? ".webp"
      : row.mime === "application/json"
        ? ".json"
        : row.mime === "text/markdown" || row.mime === "text/x-markdown"
          ? ".md"
          : ".txt";
  return join(
    __dirname2,
    "..",
    "..",
    "data",
    "group_attachments",
    bucket,
    `${row.id}${ext}`,
  );
}

interface OutgoingEvent {
  type: "message" | "typing" | "hello" | "error";
  message?: GroupMessage;
  typing?: TypingEvent;
  user_id?: string;
  error?: string;
}

interface IncomingEvent {
  type?: "typing" | "read";
  typing?: boolean;
  /** Last seen message id, sent on read receipts. */
  last_read_msg_id?: string;
}

function send(ws: WebSocket, ev: OutgoingEvent): void {
  if (ws.readyState !== 1 /* OPEN */) return;
  try {
    ws.send(JSON.stringify(ev));
  } catch {
    /* socket gone \u2014 nothing we can do */
  }
}

export async function groupChatRoutes(app: FastifyInstance) {
  // ---- History --------------------------------------------------------

  app.get<{
    Querystring: { limit?: string; before?: string };
  }>(
    "/api/group/messages",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!hasPermission(req.user!.id, FEATURES.GROUP_CHAT)) {
        return reply.code(403).send({ error: "no_permission_group_chat" });
      }
      const limit = Number(req.query.limit) || undefined;
      const before = Number(req.query.before) || undefined;
      const msgs = recentMessages({ limit, before });
      // Hydrate attachments per message.
      const hydrated = msgs.map((m) => {
        const atts = listGroupAttachmentsForMessage(m.id);
        return atts.length === 0
          ? m
          : { ...m, attachments: atts.map(summary) };
      });
      return { messages: hydrated };
    },
  );

  // ---- Post -----------------------------------------------------------

  app.post<{ Body: { body: string; attachment_ids?: string[] } }>(
    "/api/group/messages",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!hasPermission(req.user!.id, FEATURES.GROUP_CHAT)) {
        return reply.code(403).send({ error: "no_permission_group_chat" });
      }
      const text = (req.body?.body ?? "").trim();
      const attachmentIds = Array.isArray(req.body?.attachment_ids)
        ? req.body!.attachment_ids!.slice(0, GROUP_MAX_FILES_PER_MESSAGE)
        : [];
      if (!text && attachmentIds.length === 0) {
        return reply.code(400).send({ error: "empty_message" });
      }
      if (text.length > 4000) {
        return reply.code(413).send({ error: "message_too_long" });
      }
      const u = req.user!;

      // Validate every claimed attachment belongs to this user and is unlinked.
      const claimedRows = attachmentIds
        .map((id) => getGroupAttachment(id))
        .filter(
          (r): r is NonNullable<typeof r> =>
            !!r && r.user_id === u.id && r.message_id === null,
        );
      if (claimedRows.length !== attachmentIds.length) {
        return reply.code(400).send({ error: "bad_attachments" });
      }

      const msg = postMessage(
        { id: u.id, username: u.username, avatar: u.avatar },
        text,
      );
      const linked = linkGroupAttachmentsToMessage({
        userId: u.id,
        messageId: msg.id,
        attachmentIds,
      });
      const out: GroupMessage = {
        ...msg,
        attachments: linked.length > 0 ? linked.map(summary) : undefined,
      };
      // Re-emit broadcast with attachments so live clients see them too.
      if (linked.length > 0) groupHub.emit("message", out);
      return { message: out };
    },
  );

  // ---- Attachment upload ----------------------------------------------
  app.post(
    "/api/group/attachments",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!hasPermission(req.user!.id, FEATURES.GROUP_CHAT)) {
        return reply.code(403).send({ error: "no_permission_group_chat" });
      }
      if (!req.isMultipart()) {
        return reply.code(400).send({ error: "expected_multipart" });
      }
      let file: import("@fastify/multipart").MultipartFile | undefined;
      try {
        file = await req.file();
      } catch (e) {
        req.log.warn({ err: e }, "multipart parse failed");
        return reply.code(400).send({ error: "bad_multipart" });
      }
      if (!file) return reply.code(400).send({ error: "no_file" });

      const mime = (file.mimetype || "application/octet-stream").toLowerCase();
      if (!groupKindFor(mime)) {
        return reply.code(415).send({ error: "unsupported_type", mime });
      }

      const chunks: Buffer[] = [];
      let total = 0;
      try {
        for await (const chunk of file.file) {
          total += chunk.length;
          if (total > GROUP_MAX_FILE_BYTES) {
            return reply.code(413).send({ error: "file_too_large" });
          }
          chunks.push(chunk);
        }
      } catch (e) {
        req.log.warn({ err: e }, "upload stream error");
        return reply.code(400).send({ error: "upload_failed" });
      }
      const bytes = Buffer.concat(chunks);

      try {
        const row = await storeGroupAttachment({
          userId: req.user!.id,
          mime,
          bytes,
          originalName: file.filename || "upload",
        });
        return summary(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "store_failed";
        return reply.code(400).send({ error: msg });
      }
    },
  );

  // ---- Attachment download (auth required — every household member can
  // read group attachments since group_chat permission already grants visibility)
  app.get<{ Params: { id: string } }>(
    "/api/group/attachments/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!hasPermission(req.user!.id, FEATURES.GROUP_CHAT)) {
        return reply.code(403).send({ error: "no_permission_group_chat" });
      }
      const row = getGroupAttachment(req.params.id);
      if (!row) return reply.code(404).send({ error: "not_found" });
      reply
        .code(200)
        .header("Content-Type", row.mime)
        .header("Cache-Control", "private, max-age=300")
        .header(
          "Content-Disposition",
          `inline; filename="${row.original_name.replace(/"/g, "")}"`,
        );
      return reply.send(createReadStream(attachPath(row)));
    },
  );

  // ---- WebSocket ------------------------------------------------------
  //
  // Auth is by `?token=...` because browsers can't set Authorization headers
  // on the WS upgrade. We validate before subscribing so an invalid token
  // just gets the socket closed immediately.

  app.get(
    "/api/group/ws",
    { websocket: true },
    (socket, req) => {
      const ws = socket as unknown as WebSocket;
      const token = (req.query as { token?: string } | undefined)?.token;
      if (!token) {
        send(ws, { type: "error", error: "missing_token" });
        ws.close(4401, "missing_token");
        return;
      }
      const user = resolveSession(token);
      if (!user) {
        send(ws, { type: "error", error: "invalid_or_expired_token" });
        ws.close(4401, "invalid_token");
        return;
      }
      if (!hasPermission(user.id, FEATURES.GROUP_CHAT)) {
        send(ws, { type: "error", error: "no_permission_group_chat" });
        ws.close(4403, "no_permission");
        return;
      }

      // Subscribe to the hub. We tag the closures so we can detach on close.
      const onMessage = (m: GroupMessage) => send(ws, { type: "message", message: m });
      const onTyping = (t: TypingEvent) => {
        // Don't echo a user's own typing back to themselves.
        if (t.user_id === user.id) return;
        send(ws, { type: "typing", typing: t });
      };
      groupHub.on("message", onMessage);
      groupHub.on("typing", onTyping);

      // Tell the client who we authed as. Renderer uses this for cosmetics
      // (avatar, "you" badge, last-read pointer).
      send(ws, { type: "hello", user_id: user.id });

      ws.on("message", (raw) => {
        let ev: IncomingEvent | null = null;
        try {
          ev = JSON.parse(raw.toString());
        } catch {
          return; // ignore malformed
        }
        if (!ev || typeof ev !== "object") return;
        if (ev.type === "typing") {
          emitTyping({
            user_id: user.id,
            username: user.username,
            typing: !!ev.typing,
          });
        } else if (ev.type === "read" && typeof ev.last_read_msg_id === "string") {
          markRead(user.id, ev.last_read_msg_id);
        }
      });

      ws.on("close", () => {
        groupHub.off("message", onMessage);
        groupHub.off("typing", onTyping);
      });
      ws.on("error", () => {
        // Swallow socket errors so they can't bubble to uncaughtException.
        // The close handler above will run too.
      });
    },
  );
}
