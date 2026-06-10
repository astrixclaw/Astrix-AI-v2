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

export interface GroupAttachmentSummary {
  id: string;
  mime: string;
  size: number;
  original_name: string;
  kind: "image" | "text";
}

export interface GroupMessage {
  id: string;
  user_id: string;
  username: string;
  avatar: string | null;
  body: string;
  created_at: number;
  attachments?: GroupAttachmentSummary[];
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
  getMessage: db.prepare(`
    SELECT id, user_id, body, created_at FROM group_messages WHERE id = ?
  `),
  deleteMessage: db.prepare(`
    DELETE FROM group_messages WHERE id = ? AND user_id = ?
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
  attachments?: GroupAttachmentSummary[],
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
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
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

export interface GroupMessageStub {
  id: string;
  user_id: string;
  body: string;
  created_at: number;
}

export function getGroupMessage(id: string): GroupMessageStub | null {
  return (
    (stmts.getMessage.get(id) as GroupMessageStub | undefined) ?? null
  );
}

/**
 * Delete a message. Only the owner can delete their own message; admins
 * can delete anything. Returns true on success.
 *
 * Broadcasts a `message_deleted` event on the hub so live clients can drop
 * the row from their view without refetching history.
 */
export function deleteGroupMessage(opts: {
  messageId: string;
  ownerOnly: boolean;
  userId: string;
}): boolean {
  const row = getGroupMessage(opts.messageId);
  if (!row) return false;
  if (opts.ownerOnly && row.user_id !== opts.userId) return false;
  // Use ownerOnly=false (admin path) with explicit user check.
  const r = opts.ownerOnly
    ? stmts.deleteMessage.run(opts.messageId, opts.userId)
    : db
        .prepare("DELETE FROM group_messages WHERE id = ?")
        .run(opts.messageId);
  if (r.changes !== 1) return false;
  groupHub.emit("message_deleted", { id: opts.messageId });
  return true;
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
