/**
 * Group chat attachments.
 *
 * One row per file in `group_attachments`, file on disk at
 * `data/group_attachments/<YYYY-MM>/<attachmentId>.<ext>`. We bucket by month
 * so the directory doesn't grow unbounded.
 *
 * Same content rules as personal chat attachments:
 *   - image: JPEG/PNG/WebP \u2192 re-encoded to WebP, max 1024px long edge, q80
 *   - text:  .txt/.md/.json/.log \u2192 stored as-is
 *
 * `message_id` is NULL until the user actually sends the group message.
 * Orphans are swept hourly together with chat-attachment orphans.
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
export const GROUP_ATTACH_DIR = join(
  __dirname,
  "..",
  "..",
  "data",
  "group_attachments",
);

export const GROUP_MAX_FILES_PER_MESSAGE = 4;
export const GROUP_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const GROUP_IMAGE_MAX_DIM = 1024;

export const GROUP_ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
export const GROUP_ALLOWED_TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/json",
  "text/x-log",
]);

export type GroupAttachmentKind = "image" | "text";

export interface GroupAttachmentRow {
  id: string;
  user_id: string;
  message_id: string | null;
  mime: string;
  size: number;
  original_name: string;
  kind: GroupAttachmentKind;
  created_at: number;
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO group_attachments
      (id, user_id, message_id, mime, size, original_name, kind, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
  `),
  byId: db.prepare(`SELECT * FROM group_attachments WHERE id = ?`),
  linkOne: db.prepare(`
    UPDATE group_attachments SET message_id = ?
    WHERE id = ? AND user_id = ? AND message_id IS NULL
  `),
  byMessage: db.prepare(`
    SELECT * FROM group_attachments WHERE message_id = ? ORDER BY created_at ASC
  `),
  orphans: db.prepare(`
    SELECT * FROM group_attachments WHERE message_id IS NULL AND created_at < ?
  `),
  deleteOne: db.prepare(`DELETE FROM group_attachments WHERE id = ?`),
};

function bucketFor(createdAt: number): string {
  const d = new Date(createdAt);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function ensureBucket(bucket: string): string {
  const dir = join(GROUP_ATTACH_DIR, bucket);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function extFor(row: GroupAttachmentRow): string {
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

function pathFor(row: GroupAttachmentRow): string {
  return join(GROUP_ATTACH_DIR, bucketFor(row.created_at), `${row.id}${extFor(row)}`);
}

export function groupKindFor(mime: string): GroupAttachmentKind | null {
  const m = mime.toLowerCase();
  if (GROUP_ALLOWED_IMAGE_MIMES.has(m)) return "image";
  if (GROUP_ALLOWED_TEXT_MIMES.has(m)) return "text";
  return null;
}

export function getGroupAttachment(id: string): GroupAttachmentRow | null {
  return (stmts.byId.get(id) as GroupAttachmentRow | undefined) ?? null;
}

export function listGroupAttachmentsForMessage(
  messageId: string,
): GroupAttachmentRow[] {
  return stmts.byMessage.all(messageId) as GroupAttachmentRow[];
}

export async function storeGroupAttachment(opts: {
  userId: string;
  mime: string;
  bytes: Buffer;
  originalName: string;
}): Promise<GroupAttachmentRow> {
  const kind = groupKindFor(opts.mime);
  if (!kind) throw new Error("unsupported_type");
  if (opts.bytes.length === 0) throw new Error("empty_file");

  let stored: Buffer;
  let storedMime: string;
  if (kind === "image") {
    try {
      stored = await sharp(opts.bytes)
        .rotate()
        .resize(GROUP_IMAGE_MAX_DIM, GROUP_IMAGE_MAX_DIM, {
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
  const row: GroupAttachmentRow = {
    id,
    user_id: opts.userId,
    message_id: null,
    mime: storedMime,
    size: stored.length,
    original_name: (opts.originalName || "upload").slice(0, 200),
    kind,
    created_at: now,
  };

  ensureBucket(bucketFor(now));
  await writeFile(pathFor(row), stored);
  stmts.insert.run(
    row.id,
    row.user_id,
    row.mime,
    row.size,
    row.original_name,
    row.kind,
    row.created_at,
  );
  return row;
}

export function linkGroupAttachmentsToMessage(opts: {
  userId: string;
  messageId: string;
  attachmentIds: string[];
}): GroupAttachmentRow[] {
  const linked: GroupAttachmentRow[] = [];
  for (const aid of opts.attachmentIds.slice(0, GROUP_MAX_FILES_PER_MESSAGE)) {
    const r = stmts.linkOne.run(opts.messageId, aid, opts.userId);
    if (r.changes === 1) {
      const row = getGroupAttachment(aid);
      if (row) linked.push({ ...row, message_id: opts.messageId });
    }
  }
  return linked;
}

export async function readGroupAttachmentBytes(
  row: GroupAttachmentRow,
): Promise<Buffer | null> {
  try {
    return readFileSync(pathFor(row));
  } catch {
    return null;
  }
}

export function deleteGroupAttachment(row: GroupAttachmentRow): void {
  try { unlinkSync(pathFor(row)); } catch { /* ignore */ }
  stmts.deleteOne.run(row.id);
}

/** Drop just the DB row for an attachment id (file caller's responsibility). */
export function deleteGroupAttachmentRow(id: string): void {
  stmts.deleteOne.run(id);
}

/** Drop staged group uploads older than 1 hour. */
export function purgeGroupOrphanAttachments(): void {
  const cutoff = Date.now() - 60 * 60 * 1000;
  const rows = stmts.orphans.all(cutoff) as GroupAttachmentRow[];
  for (const r of rows) {
    try { unlinkSync(pathFor(r)); } catch { /* ignore */ }
    stmts.deleteOne.run(r.id);
  }
}

export function groupAttachmentDiskSize(
  row: GroupAttachmentRow,
): number | null {
  try { return statSync(pathFor(row)).size; } catch { return null; }
}
