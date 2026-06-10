/**
 * Avatar storage.
 *
 * Each user can have one avatar file at `data/avatars/<userId>.webp`. We
 * always normalise to WebP at 256x256 cover-crop so:
 *   - the served file is small (~5-20 KB)
 *   - every client renders the same shape
 *   - we don't have to track the original mime type per user
 *
 * The route layer enforces auth + admin checks. This service is purely the
 * filesystem + image processing.
 */
import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const AVATAR_DIR = join(__dirname, "..", "..", "data", "avatars");

/** Lazily create the directory the first time anyone wants to write. */
function ensureDir(): void {
  if (!existsSync(AVATAR_DIR)) {
    mkdirSync(AVATAR_DIR, { recursive: true });
  }
}

export function avatarPath(userId: string): string {
  return join(AVATAR_DIR, `${userId}.webp`);
}

export function hasAvatar(userId: string): boolean {
  return existsSync(avatarPath(userId));
}

/** Modification time in ms, or null if there's no avatar. */
export function avatarMtime(userId: string): number | null {
  const p = avatarPath(userId);
  if (!existsSync(p)) return null;
  return statSync(p).mtimeMs;
}

/**
 * Take an arbitrary image buffer, normalise it to a 256x256 cover-cropped
 * WebP, and write it to disk. Returns the file size for logging.
 *
 * Throws for input that sharp can't decode (bad MIME, corrupt file, etc.).
 * The route layer maps that to 415.
 */
export async function writeAvatar(
  userId: string,
  input: Buffer,
): Promise<{ bytes: number }> {
  ensureDir();
  const buf = await sharp(input)
    .rotate() // honour EXIF orientation on phone photos
    .resize(256, 256, { fit: "cover", position: "attention" })
    .webp({ quality: 86 })
    .toBuffer();
  await writeFile(avatarPath(userId), buf);
  return { bytes: buf.length };
}

export function deleteAvatar(userId: string): void {
  const p = avatarPath(userId);
  if (existsSync(p)) {
    try {
      unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}
