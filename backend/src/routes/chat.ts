/**
 * Chat routes — personal conversations with Astrix.
 *
 *   GET    /api/conversations                          -> list
 *   POST   /api/conversations                          -> { id }
 *   GET    /api/conversations/:id                      -> messages[] (with attachments[])
 *   DELETE /api/conversations/:id                      -> ok
 *   POST   /api/conversations/:id/messages             -> SSE stream of assistant deltas
 *   POST   /api/conversations/:id/attachments          -> { id } (upload one file)
 *   GET    /api/attachments/:id                        -> raw bytes (auth, owner-only)
 *
 * All conversation routes require auth + the `chat` permission. The SSE route
 * saves both user message and the final assistant message to the DB, then
 * links any pre-uploaded attachments to the user message.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { requireAuth } from "../middleware/auth.js";
import {
  appendMessage,
  deleteConversation,
  listConversations,
  loadConversation,
  newConversationId,
} from "../services/conversations.js";
import {
  type GatewayContentPart,
  GatewayError,
  GatewayNotConfiguredError,
  streamChatTurn,
} from "../services/gateway.js";
import { FEATURES, hasPermission } from "../services/permissions.js";
import {
  attachmentToDataUrl,
  getAttachment,
  kindFor,
  linkAttachmentsToMessage,
  listAttachmentsForMessage,
  listUnlinkedForConv,
  MAX_FILE_BYTES,
  MAX_FILES_PER_MESSAGE,
  purgeConversationAttachments,
  readAttachmentBytes,
  storeAttachment,
} from "../services/attachments.js";

/** Helper: 403 if the caller doesn't have `chat`. */
function denyIfNoChat(reply: FastifyReply, userId: string): boolean {
  if (!hasPermission(userId, FEATURES.CHAT)) {
    reply.code(403).send({ error: "no_permission_chat" });
    return true;
  }
  return false;
}

export async function chatRoutes(app: FastifyInstance) {
  app.get(
    "/api/conversations",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (denyIfNoChat(reply, req.user!.id)) return;
      return { conversations: listConversations(req.user!.id) };
    },
  );

  app.post(
    "/api/conversations",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (denyIfNoChat(reply, req.user!.id)) return;
      return { id: newConversationId() };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/conversations/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (denyIfNoChat(reply, req.user!.id)) return;
      const messages = loadConversation(req.user!.id, req.params.id);
      // Hydrate attachments per message.
      const messagesWithAttachments = messages.map((m) => ({
        ...m,
        attachments: listAttachmentsForMessage(m.id).map((a) => ({
          id: a.id,
          mime: a.mime,
          size: a.size,
          original_name: a.original_name,
          kind: a.kind,
        })),
      }));
      return { messages: messagesWithAttachments };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/conversations/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (denyIfNoChat(reply, req.user!.id)) return;
      await purgeConversationAttachments(req.user!.id, req.params.id);
      deleteConversation(req.user!.id, req.params.id);
      return { ok: true };
    },
  );

  // ─── Attachment upload ───────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/api/conversations/:id/attachments",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (denyIfNoChat(reply, req.user!.id)) return;
      if (!req.isMultipart()) {
        return reply.code(400).send({ error: "expected_multipart" });
      }

      // Cap unlinked staged files per conv to MAX_FILES_PER_MESSAGE so users
      // can't pile up gigabytes on the disk by uploading without sending.
      const staged = listUnlinkedForConv(req.user!.id, req.params.id);
      if (staged.length >= MAX_FILES_PER_MESSAGE) {
        return reply.code(400).send({ error: "too_many_staged_files" });
      }

      let file: MultipartFile | undefined;
      try {
        file = await req.file();
      } catch (e) {
        req.log.warn({ err: e }, "multipart parse failed");
        return reply.code(400).send({ error: "bad_multipart" });
      }
      if (!file) return reply.code(400).send({ error: "no_file" });

      const mime = (file.mimetype || "application/octet-stream").toLowerCase();
      if (!kindFor(mime)) {
        return reply.code(415).send({ error: "unsupported_type", mime });
      }

      // Stream body into a buffer, enforcing the size cap as we go.
      const chunks: Buffer[] = [];
      let total = 0;
      try {
        for await (const chunk of file.file) {
          total += chunk.length;
          if (total > MAX_FILE_BYTES) {
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
        const row = await storeAttachment({
          userId: req.user!.id,
          convId: req.params.id,
          mime,
          bytes,
          originalName: file.filename || "upload",
        });
        return {
          id: row.id,
          mime: row.mime,
          size: row.size,
          original_name: row.original_name,
          kind: row.kind,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "store_failed";
        return reply.code(400).send({ error: msg });
      }
    },
  );

  // ─── Attachment download (auth, owner-only) ─────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/attachments/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const row = getAttachment(req.params.id);
      if (!row) return reply.code(404).send({ error: "not_found" });
      if (row.user_id !== req.user!.id) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const bytes = await readAttachmentBytes(row);
      if (!bytes) return reply.code(404).send({ error: "file_missing" });
      reply
        .code(200)
        .header("Content-Type", row.mime)
        .header("Cache-Control", "private, max-age=300")
        .header(
          "Content-Disposition",
          `inline; filename="${row.original_name.replace(/"/g, "")}"`,
        )
        .send(bytes);
    },
  );

  app.post<{
    Params: { id: string };
    Body: { text: string; attachment_ids?: string[] };
  }>(
    "/api/conversations/:id/messages",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (denyIfNoChat(reply, req.user!.id)) return;
      const text = (req.body?.text ?? "").trim();
      const attachmentIds = Array.isArray(req.body?.attachment_ids)
        ? req.body!.attachment_ids!.slice(0, MAX_FILES_PER_MESSAGE)
        : [];
      if (!text && attachmentIds.length === 0) {
        return reply.code(400).send({ error: "empty_message" });
      }

      const user = req.user!;
      const convId = req.params.id;

      // Validate every claimed attachment belongs to this user + conv and is unlinked.
      const claimedRows = attachmentIds
        .map((id) => getAttachment(id))
        .filter(
          (r): r is NonNullable<typeof r> =>
            !!r &&
            r.user_id === user.id &&
            r.conv_id === convId &&
            r.message_id === null,
        );
      if (claimedRows.length !== attachmentIds.length) {
        return reply.code(400).send({ error: "bad_attachments" });
      }

      // Persist the user message first so it sticks even if streaming fails.
      const userMessage = appendMessage(user.id, convId, "user", text);
      // Link attachments now.
      const linked = linkAttachmentsToMessage({
        userId: user.id,
        convId,
        messageId: userMessage.id,
        attachmentIds,
      });

      // History = everything in this conv up to (but not including) the new
      // user message. We rebuild past content too so the model sees images
      // from earlier turns. We only attach images (not text-file blocks) to
      // history — text blocks were already concatenated into the message body.
      const allMessages = loadConversation(user.id, convId);
      const priorHistory: Array<{
        role: "user" | "assistant";
        content: string | GatewayContentPart[];
      }> = [];
      for (const m of allMessages) {
        if (m.id === userMessage.id) continue;
        const atts = listAttachmentsForMessage(m.id);
        const imgs = atts.filter((a) => a.kind === "image");
        if (imgs.length === 0) {
          priorHistory.push({ role: m.role, content: m.body });
        } else {
          const parts: GatewayContentPart[] = [];
          if (m.body) parts.push({ type: "text", text: m.body });
          for (const a of imgs) {
            const url = await attachmentToDataUrl(a);
            if (url) parts.push({ type: "image_url", image_url: { url } });
          }
          priorHistory.push({ role: m.role, content: parts });
        }
      }

      // Build the new user content. If text-file attachments are present,
      // we read them inline and prepend a quoted block per file to the text.
      // Images go in as image_url parts.
      let composedText = text;
      const imageParts: GatewayContentPart[] = [];
      for (const a of linked) {
        if (a.kind === "text") {
          const bytes = await readAttachmentBytes(a);
          if (bytes) {
            const content = bytes.toString("utf8").slice(0, 200_000); // cap at 200 KB of text
            const fence =
              a.mime === "application/json"
                ? "json"
                : a.mime === "text/markdown" || a.mime === "text/x-markdown"
                  ? "md"
                  : "";
            composedText =
              `Attached file: ${a.original_name}\n\n\`\`\`${fence}\n${content}\n\`\`\`\n\n` +
              composedText;
          }
        } else if (a.kind === "image") {
          const url = await attachmentToDataUrl(a);
          if (url) imageParts.push({ type: "image_url", image_url: { url } });
        }
      }

      const newUserMessage: string | GatewayContentPart[] =
        imageParts.length > 0
          ? [
              ...(composedText
                ? ([{ type: "text", text: composedText }] as GatewayContentPart[])
                : []),
              ...imageParts,
            ]
          : composedText;

      // Switch the response into SSE mode.
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      let closed = false;
      const abort = new AbortController();
      req.raw.on("close", () => {
        closed = true;
        abort.abort();
      });
      reply.raw.on("error", (err) => {
        req.log.debug({ err }, "sse socket error (ignored)");
      });

      const send = (event: object) => {
        if (closed || reply.raw.writableEnded) return;
        try {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch (err) {
          req.log.debug({ err }, "sse write failed (ignored)");
        }
      };

      const endResponse = () => {
        if (reply.raw.writableEnded) return;
        try {
          reply.raw.end();
        } catch (err) {
          req.log.debug({ err }, "sse end failed (ignored)");
        }
      };

      send({
        type: "user_saved",
        message: {
          ...userMessage,
          attachments: linked.map((a) => ({
            id: a.id,
            mime: a.mime,
            size: a.size,
            original_name: a.original_name,
            kind: a.kind,
          })),
        },
      });

      let assembled = "";
      try {
        for await (const chunk of streamChatTurn({
          username: user.username,
          history: priorHistory,
          newUserMessage,
          signal: abort.signal,
        })) {
          if (closed) break;
          if (chunk.kind === "delta" && chunk.text) {
            assembled += chunk.text;
            send({ type: "delta", text: chunk.text });
          } else if (chunk.kind === "error") {
            send({ type: "error", error: chunk.error ?? "gateway_error" });
            endResponse();
            return;
          } else if (chunk.kind === "done") {
            break;
          }
        }

        if (assembled || !closed) {
          const assistant = appendMessage(user.id, convId, "assistant", assembled);
          send({
            type: "done",
            message: { ...assistant, attachments: [] },
          });
        }
      } catch (e) {
        const isAbort =
          (e as { name?: string })?.name === "AbortError" || closed;
        if (!isAbort) {
          if (e instanceof GatewayNotConfiguredError) {
            send({ type: "error", error: "gateway_not_configured" });
          } else if (e instanceof GatewayError) {
            send({ type: "error", error: e.message });
          } else {
            send({
              type: "error",
              error: e instanceof Error ? e.message : "unknown_error",
            });
          }
        }
      } finally {
        endResponse();
      }
    },
  );

}
