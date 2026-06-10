/**
 * Group chat service.
 *
 * One household-wide room. Every message persists in `group_messages`, so a
 * client that connects late gets history via the REST endpoint and only
 * receives *new* events over WebSocket. The hub is in-memory: when the
 * backend restarts, connected clients reconnect and just refetch history.
 *
 * Design notes:
 *  - We attach the sender's username + avatar to every outgoing event so
 *    clients don't need to keep a user lookup table in sync.
 *  - We never persist typing indicators \u2014 they're WS-only ephemera.
 *  - Permission gating (`group_chat`) is done at the route layer, not here.
 */
import { EventEmitter } from "node:events";
import { db } from "../db/index.js";
import { newId } from "./auth.js";

export interface GroupMessage {
  id: string;
  user_id: string;
  username: string;
  avatar: string | null;
  body: string;
  created_at: number;
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO group_messages (id, user_id, body, created_at)
    VALUES (?, ?, ?, ?)
  `),
  recent: db.prepare(`
    SELECT gm.id, gm.user_id, u.username, u.avatar, gm.body, gm.created_at
    FROM group_messages gm
    JOIN users u ON u.id = gm.user_id
    WHERE (? IS NULL OR gm.created_at < ?)
    ORDER BY gm.created_at DESC
    LIMIT ?
  `),
  setLastRead: db.prepare(`
    INSERT INTO group_reads (user_id, last_read_msg_id, last_read_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE
      SET last_read_msg_id = excluded.last_read_msg_id,
          last_read_at = excluded.last_read_at
  `),
};

/**
 * Broadcast hub. Routes subscribe sockets here; the chat service emits a
 * `message` event when a new line lands. Typing indicators travel through
 * a separate `typing` channel.
 */
class GroupHub extends EventEmitter {
  /** Set of subscriber callbacks per event type. EventEmitter handles it for us. */
  constructor() {
    super();
    // Allow plenty of household members + tabs.
    this.setMaxListeners(50);
  }
}
export const groupHub = new GroupHub();

/** Append a message + broadcast it. Returns the persisted row. */
export function postMessage(
  user: { id: string; username: string; avatar: string | null },
  body: string,
): GroupMessage {
  const id = newId();
  const now = Date.now();
  stmts.insert.run(id, user.id, body, now);
  const msg: GroupMessage = {
    id,
    user_id: user.id,
    username: user.username,
    avatar: user.avatar,
    body,
    created_at: now,
  };
  groupHub.emit("message", msg);
  return msg;
}

/** Fetch the most recent N messages, oldest-first. */
export function recentMessages(opts: {
  limit?: number;
  before?: number;
}): GroupMessage[] {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const before = opts.before ?? null;
  const rows = stmts.recent.all(before, before, limit) as GroupMessage[];
  // Stored DESC for the LIMIT to be efficient; flip back to chronological.
  return rows.reverse();
}

/** Mark which message a user has read up to. Used for unread badges later. */
export function markRead(userId: string, msgId: string | null): void {
  stmts.setLastRead.run(userId, msgId, Date.now());
}

/** Broadcast a "X is typing" event to other connected sockets. Ephemeral. */
export interface TypingEvent {
  user_id: string;
  username: string;
  typing: boolean;
}
export function emitTyping(ev: TypingEvent): void {
  groupHub.emit("typing", ev);
}
