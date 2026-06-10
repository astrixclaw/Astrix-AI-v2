/**
 * Personal chat conversations.
 *
 * One conversation is just a `conv_id` that groups messages. We don't have a
 * separate `conversations` table — instead we derive conversations from the
 * messages table on-the-fly. Why? It keeps the schema simple, it auto-cleans
 * when a user is deleted (cascade on personal_messages), and a household-sized
 * dataset is tiny: deriving is faster than maintaining a sync'd second table.
 *
 * A conversation's "title" is the first 60 chars of its first user message.
 * Empty conversations (no messages yet) don't appear in the list.
 */
import { db } from "../db/index.js";
import { newId } from "./auth.js";

export interface MessageRow {
  id: string;
  user_id: string;
  conv_id: string;
  role: "user" | "assistant";
  body: string;
  created_at: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: number;
  message_count: number;
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO personal_messages (id, user_id, conv_id, role, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  listConvsForUser: db.prepare(`
    SELECT
      conv_id AS id,
      MAX(created_at) AS updated_at,
      COUNT(*) AS message_count,
      (
        SELECT body FROM personal_messages
        WHERE user_id = pm.user_id AND conv_id = pm.conv_id AND role = 'user'
        ORDER BY created_at ASC LIMIT 1
      ) AS first_user_body
    FROM personal_messages pm
    WHERE user_id = ?
    GROUP BY conv_id
    ORDER BY updated_at DESC
  `),
  loadConv: db.prepare(`
    SELECT id, user_id, conv_id, role, body, created_at
    FROM personal_messages
    WHERE user_id = ? AND conv_id = ?
    ORDER BY created_at ASC
  `),
  deleteConv: db.prepare(`
    DELETE FROM personal_messages WHERE user_id = ? AND conv_id = ?
  `),
  getMessage: db.prepare(`
    SELECT id, user_id, conv_id, role, body, created_at
    FROM personal_messages WHERE id = ?
  `),
  deleteMessage: db.prepare(`
    DELETE FROM personal_messages
    WHERE id = ? AND user_id = ? AND conv_id = ?
  `),
};

function titleFor(firstUserBody: string | null): string {
  if (!firstUserBody) return "New conversation";
  const oneLine = firstUserBody.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? oneLine.slice(0, 60) + "…" : oneLine || "New conversation";
}

/** Create a brand-new conversation id. No DB rows yet — they appear on first message. */
export function newConversationId(): string {
  return newId();
}

export function appendMessage(
  userId: string,
  convId: string,
  role: "user" | "assistant",
  body: string,
): MessageRow {
  const id = newId();
  const now = Date.now();
  stmts.insert.run(id, userId, convId, role, body, now);
  return { id, user_id: userId, conv_id: convId, role, body, created_at: now };
}

export function listConversations(userId: string): ConversationSummary[] {
  const rows = stmts.listConvsForUser.all(userId) as Array<{
    id: string;
    updated_at: number;
    message_count: number;
    first_user_body: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    title: titleFor(r.first_user_body),
    updated_at: r.updated_at,
    message_count: r.message_count,
  }));
}

export function loadConversation(userId: string, convId: string): MessageRow[] {
  return stmts.loadConv.all(userId, convId) as MessageRow[];
}

export function deleteConversation(userId: string, convId: string): void {
  stmts.deleteConv.run(userId, convId);
}

export function getMessage(messageId: string): MessageRow | null {
  return (stmts.getMessage.get(messageId) as MessageRow | undefined) ?? null;
}

export function deleteMessage(
  userId: string,
  convId: string,
  messageId: string,
): boolean {
  const r = stmts.deleteMessage.run(messageId, userId, convId);
  return r.changes === 1;
}
