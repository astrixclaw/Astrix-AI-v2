/**
 * Camera CRUD service.
 *
 * Cameras are stored in SQLite; the actual RTSP streams are handled by
 * the streaming service (streaming.ts). This module only handles metadata.
 */
import { db } from "../db/index.js";
import { randomUUID } from "node:crypto";

export interface Camera {
  id: string;
  name: string;
  brand: string;
  rtsp_url: string;
  sub_rtsp_url: string | null;
  channel: number;
  enabled: 0 | 1;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface CameraRecording {
  id: string;
  camera_id: string;
  filename: string;
  duration_s: number | null;
  size_bytes: number | null;
  started_at: number;
  ended_at: number | null;
}

const stmts = {
  list: db.prepare(`SELECT * FROM cameras ORDER BY sort_order ASC, created_at ASC`),
  get: db.prepare(`SELECT * FROM cameras WHERE id = ?`),
  insert: db.prepare(`
    INSERT INTO cameras (id, name, brand, rtsp_url, sub_rtsp_url, channel, enabled, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  update: db.prepare(`
    UPDATE cameras
    SET name=?, brand=?, rtsp_url=?, sub_rtsp_url=?, channel=?, enabled=?, sort_order=?, updated_at=?
    WHERE id=?
  `),
  delete: db.prepare(`DELETE FROM cameras WHERE id = ?`),
  listRecordings: db.prepare(`
    SELECT * FROM camera_recordings WHERE camera_id = ? ORDER BY started_at DESC LIMIT 100
  `),
  insertRecording: db.prepare(`
    INSERT INTO camera_recordings (id, camera_id, filename, duration_s, size_bytes, started_at, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  finalizeRecording: db.prepare(`
    UPDATE camera_recordings SET ended_at=?, duration_s=?, size_bytes=? WHERE id=?
  `),
};

export function listCameras(): Camera[] {
  return stmts.list.all() as Camera[];
}

export function getCamera(id: string): Camera | null {
  return (stmts.get.get(id) as Camera | undefined) ?? null;
}

export interface CreateCameraOpts {
  name: string;
  brand?: string;
  rtsp_url: string;
  sub_rtsp_url?: string | null;
  channel?: number;
  enabled?: boolean;
  sort_order?: number;
}

export function createCamera(opts: CreateCameraOpts): Camera {
  const id = randomUUID();
  const now = Date.now();
  stmts.insert.run(
    id,
    opts.name,
    opts.brand ?? "generic_rtsp",
    opts.rtsp_url,
    opts.sub_rtsp_url ?? null,
    opts.channel ?? 1,
    opts.enabled !== false ? 1 : 0,
    opts.sort_order ?? 0,
    now,
    now,
  );
  return getCamera(id)!;
}

export function updateCamera(id: string, patch: Partial<CreateCameraOpts>): Camera | null {
  const cam = getCamera(id);
  if (!cam) return null;
  const now = Date.now();
  stmts.update.run(
    patch.name ?? cam.name,
    patch.brand ?? cam.brand,
    patch.rtsp_url ?? cam.rtsp_url,
    patch.sub_rtsp_url !== undefined ? patch.sub_rtsp_url : cam.sub_rtsp_url,
    patch.channel ?? cam.channel,
    patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : cam.enabled,
    patch.sort_order ?? cam.sort_order,
    now,
    id,
  );
  return getCamera(id)!;
}

export function deleteCamera(id: string): boolean {
  const result = stmts.delete.run(id);
  return result.changes > 0;
}

export function listRecordings(cameraId: string): CameraRecording[] {
  return stmts.listRecordings.all(cameraId) as CameraRecording[];
}

export function createRecordingEntry(cameraId: string, filename: string): CameraRecording {
  const id = randomUUID();
  const now = Date.now();
  stmts.insertRecording.run(id, cameraId, filename, null, null, now, null);
  return { id, camera_id: cameraId, filename, duration_s: null, size_bytes: null, started_at: now, ended_at: null };
}

export function finalizeRecording(id: string, durationS: number, sizeBytes: number): void {
  stmts.finalizeRecording.run(Date.now(), durationS, sizeBytes, id);
}
