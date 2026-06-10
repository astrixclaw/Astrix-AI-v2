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
import { requireAuth } from "../middleware/auth.js";
import { resolveSession } from "../services/auth.js";
import {
  emitTyping,
  groupHub,
  markRead,
  postMessage,
  recentMessages,
  type GroupMessage,
  type TypingEvent,
} from "../services/group_chat.js";
import { FEATURES, hasPermission } from "../services/permissions.js";

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
      return { messages: recentMessages({ limit, before }) };
    },
  );

  // ---- Post -----------------------------------------------------------

  app.post<{ Body: { body: string } }>(
    "/api/group/messages",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!hasPermission(req.user!.id, FEATURES.GROUP_CHAT)) {
        return reply.code(403).send({ error: "no_permission_group_chat" });
      }
      const text = (req.body?.body ?? "").trim();
      if (!text) return reply.code(400).send({ error: "empty_message" });
      if (text.length > 4000) {
        return reply.code(413).send({ error: "message_too_long" });
      }
      const u = req.user!;
      const msg = postMessage(
        { id: u.id, username: u.username, avatar: u.avatar },
        text,
      );
      return { message: msg };
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
