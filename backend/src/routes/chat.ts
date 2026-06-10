/**
 * Chat routes — personal conversations with Astrix.
 *
 *   GET    /api/conversations                  -> list
 *   POST   /api/conversations                  -> { conv_id }   (just a fresh id)
 *   GET    /api/conversations/:id              -> messages[]
 *   DELETE /api/conversations/:id              -> ok
 *   POST   /api/conversations/:id/messages     -> SSE stream of assistant deltas
 *
 * All routes require auth + the `chat` permission. The SSE route saves both
 * the user message and the final assistant message to the DB so refreshing the
 * window restores the conversation exactly as it was.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import {
  appendMessage,
  deleteConversation,
  listConversations,
  loadConversation,
  newConversationId,
} from "../services/conversations.js";
import {
  GatewayError,
  GatewayNotConfiguredError,
  streamChatTurn,
} from "../services/gateway.js";
import { FEATURES, hasPermission } from "../services/permissions.js";

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
      return { messages };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/conversations/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (denyIfNoChat(reply, req.user!.id)) return;
      deleteConversation(req.user!.id, req.params.id);
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string }; Body: { text: string } }>(
    "/api/conversations/:id/messages",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (denyIfNoChat(reply, req.user!.id)) return;
      const text = (req.body?.text ?? "").trim();
      if (!text) {
        return reply.code(400).send({ error: "empty_message" });
      }

      const user = req.user!;
      const convId = req.params.id;

      // Persist the user message first so it sticks even if streaming fails.
      const userMessage = appendMessage(user.id, convId, "user", text);

      // History = everything in this conv up to (but not including) the new
      // user message we just inserted.
      const allMessages = loadConversation(user.id, convId);
      const priorHistory = allMessages
        .filter((m) => m.id !== userMessage.id)
        .map((m) => ({ role: m.role, content: m.body }));

      // Switch the response into SSE mode.
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // disable nginx-style buffering if proxied
      });

      // Track client disconnect so we (a) abort the upstream fetch, and
      // (b) stop writing to a dead socket. Without this guard, writing after
      // close emits an 'error' on the raw socket; with no listener attached
      // Node would otherwise crash the process. That's why the backend kept
      // dying mid-chat.
      let closed = false;
      req.raw.on("close", () => {
        closed = true;
        abort.abort();
      });
      // Defensive: swallow any late socket errors so they can't bubble up
      // into an uncaughtException. Logged at debug level only.
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

      // Tell the client up-front that the user message was saved.
      const abort = new AbortController();
      send({ type: "user_saved", message: userMessage });

      let assembled = "";
      try {
        for await (const chunk of streamChatTurn({
          username: user.username,
          history: priorHistory,
          newUserMessage: text,
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

        // Save the assistant turn even if it's empty — that way the client
        // can tell "the gateway returned nothing" from "we never got there".
        // Skip if we already persisted text (assembled is non-empty), so
        // canceling mid-stream still gets the partial reply saved.
        if (assembled || !closed) {
          const assistant = appendMessage(
            user.id,
            convId,
            "assistant",
            assembled,
          );
          send({ type: "done", message: assistant });
        }
      } catch (e) {
        // AbortError on client disconnect is expected; do nothing.
        const isAbort =
          (e as { name?: string })?.name === "AbortError" ||
          closed;
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
