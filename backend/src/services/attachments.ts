/**
 * Chat attachments.
 *
 * Up to MAX_FILES_PER_MESSAGE files per personal-chat message:
 *   - "image"  -> JPEG/PNG/WebP. Re-encoded to WebP, max 1024px long edge,
 *                 quality 80. Keeps vision-model token cost sensible while
 *                 staying legible.
 *   - "text"   -> .txt / .md / .json / .log (and equivalents). Stored as
 *                 received; the chat route caps how much text actually gets
 *                 shipped to the gateway.
 *
 * Layout: data/attachments/<convId>/<attachmentId>.<ext>
 * One row per file in the `attachments` table; `message_id` is NULL until
 * the chat route links the file to a sent message. Orphans are swept by a
 * periodic job.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { db } from "../db/index.js";
import { newId } from "./auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ATTACH_DIR = join(__dirname, "..", "..", "data", "attachments");

export const MAX_FILES_PER_MESSAGE = 4;
export const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB pre-encode cap
export const IMAGE_MAX_DIM = 1024;             // long edge

export const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
export const ALLOWED_TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/json",
  "text/x-log",
]);

export type AttachmentKind = "image" | "text";

export interface AttachmentRow {
  id: string;
  user_id: string;
  conv_id: string;
  message_id: string | null;
  mime: string;
  size: number;
  original_name: string;
  kind: AttachmentKind;
  created_at: number;
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO attachments
      (id, user_id, conv_id, message_id, mime, size, original_name, kind, created_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
  `),
  byId: db.prepare(`SELECT * FROM attachments WHERE id = ?`),
  linkOne: db.prepare(`
    UPDATE attachments SET message_id = ?
    WHERE id = ? AND user_id = ? AND conv_id = ? AND message_id IS NULL
  `),
  byMessage: db.prepare(`
    SELECT * FROM attachments WHERE message_id = ? ORDER BY created_at ASC
  `),
  unlinkedForConv: db.prepare(`
    SELECT * FROM attachments
    WHERE user_id = ? AND conv_id = ? AND message_id IS NULL
    ORDER BY created_at ASC
  `),
  byConv: db.prepare(`
    SELECT * FROM attachments WHERE conv_id = ? AND user_id = ?
  `),
  orphans: db.prepare(`
    SELECT * FROM attachments WHERE message_id IS NULL AND created_at < ?
  `),
  deleteOne: db.prepare(`DELETE FROM attachments WHERE id = ?`),
  deleteConv: db.prepare(`DELETE FROM attachments WHERE conv_id = ? AND user_id = ?`),
};

function ensureConvDir(convId: string): string {
  const dir = join(ATTACH_DIR, convId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function extFor(row: AttachmentRow): string {
  if (row.kind === "image") return ".webp";
  const i = row.original_name.lastIndexOf(".");
  if (i >= 0) {
    const e = row.original_name.slice(i).toLowerCase();
    if ([".txt", ".md", ".json", ".log"].includes(e)) return e;
  }
  if (row.mime === "application/json") return ".json";
  if (row.mime === "text/markdown" || row.mime === "text/x-markdown") return ".md";
  return ".txt";
}

function pathFor(row: AttachmentRow): string {
  return join(ATTACH_DIR, row.conv_id, `${row.id}${extFor(row)}`);
}

export function kindFor(mime: string): AttachmentKind | null {
  const m = mime.toLowerCase();
  if (ALLOWED_IMAGE_MIMES.has(m)) return "image";
  if (ALLOWED_TEXT_MIMES.has(m)) return "text";
  return null;
}

export function getAttachment(id: string): AttachmentRow | null {
  return (stmts.byId.get(id) as AttachmentRow | undefined) ?? null;
}

export function listAttachmentsForMessage(messageId: string): AttachmentRow[] {
  return stmts.byMessage.all(messageId) as AttachmentRow[];
}

export function listUnlinkedForConv(
  userId: string,
  convId: string,
): AttachmentRow[] {
  return stmts.unlinkedForConv.all(userId, convId) as AttachmentRow[];
}

/**
 * Persist an uploaded file. Throws Error("<code>") for validation problems;
 * the route maps to the right status code.
 */
export async function storeAttachment(opts: {
  userId: string;
  convId: string;
  mime: string;
  bytes: Buffer;
  originalName: string;
}): Promise<AttachmentRow> {
  const kind = kindFor(opts.mime);
  if (!kind) throw new Error("unsupported_type");
  if (opts.bytes.length === 0) throw new Error("empty_file");

  let stored: Buffer;
  let storedMime: string;
  if (kind === "image") {
    try {
      stored = await sharp(opts.bytes)
        .rotate()
        .resize(IMAGE_MAX_DIM, IMAGE_MAX_DIM, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      throw new Error("bad_image");
    }
    storedMime = "image/webp";
  } else {
    stored = opts.bytes;
    storedMime = opts.mime;
  }

  const id = newId();
  const now = Date.now();
  const row: AttachmentRow = {
    id,
    user_id: opts.userId,
    conv_id: opts.convId,
    message_id: null,
    mime: storedMime,
    size: stored.length,
    original_name: (opts.originalName || "upload").slice(0, 200),
    kind,
    created_at: now,
  };

  ensureConvDir(opts.convId);
  await writeFile(pathFor(row), stored);
  stmts.insert.run(
    row.id,
    row.user_id,
    row.conv_id,
    row.mime,
    row.size,
    row.original_name,
    row.kind,
    row.created_at,
  );
  return row;
}

export function linkAttachmentsToMessage(opts: {
  userId: string;
  convId: string;
  messageId: string;
  attachmentIds: string[];
}): AttachmentRow[] {
  const linked: AttachmentRow[] = [];
  for (const aid of opts.attachmentIds.slice(0, MAX_FILES_PER_MESSAGE)) {
    const r = stmts.linkOne.run(opts.messageId, aid, opts.userId, opts.convId);
    if (r.changes === 1) {
      const row = getAttachment(aid);
      if (row) linked.push({ ...row, message_id: opts.messageId });
    }
  }
  return linked;
}

export async function readAttachmentBytes(
  row: AttachmentRow,
): Promise<Buffer | null> {
  try {
    return readFileSync(pathFor(row));
  } catch {
    return null;
  }
}

export async function attachmentToDataUrl(
  row: AttachmentRow,
): Promise<string | null> {
  if (row.kind !== "image") return null;
  const buf = await readAttachmentBytes(row);
  if (!buf) return null;
  return `data:${row.mime};base64,${buf.toString("base64")}`;
}

export function deleteAttachment(row: AttachmentRow): void {
  try { unlinkSync(pathFor(row)); } catch { /* ignore */ }
  stmts.deleteOne.run(row.id);
}

export async function purgeConversationAttachments(
  userId: string,
  convId: string,
): Promise<void> {
  const rows = stmts.byConv.all(convId, userId) as AttachmentRow[];
  for (const r of rows) {
    try { unlinkSync(pathFor(r)); } catch { /* ignore */ }
  }
  stmts.deleteConv.run(convId, userId);
}

/** Drop staged uploads older than 1 hour that were never linked to a message. */
export function purgeOrphanAttachments(): void {
  const cutoff = Date.now() - 60 * 60 * 1000;
  const rows = stmts.orphans.all(cutoff) as AttachmentRow[];
  for (const r of rows) {
    try { unlinkSync(pathFor(r)); } catch { /* ignore */ }
    stmts.deleteOne.run(r.id);
  }
}

export function attachmentDiskSize(row: AttachmentRow): number | null {
  try { return statSync(pathFor(row)).size; } catch { return null; }
}
