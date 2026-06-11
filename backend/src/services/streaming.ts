/**
 * RTSP → HLS streaming service.
 *
 * For each active camera we spawn an FFmpeg process that:
 *   rtsp://...  →  /tmp/astrix-streams/{cameraId}/stream.m3u8  (+ .ts segments)
 *
 * Callers poll /api/cameras/{id}/hls/stream.m3u8 which is served straight
 * from the temp dir. The renderer plays it with hls.js.
 *
 * Snapshots: a one-shot ffmpeg call returns a JPEG buffer.
 * Recording: a separate ffmpeg process saves an MP4 to the recordings dir.
 *
 * FFmpeg availability is checked lazily; if not found, methods throw
 * FfmpegNotFoundError with install instructions.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, existsSync, statSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { rm, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createRecordingEntry, finalizeRecording } from "./cameras.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Where HLS segments live while a stream is active.
export const STREAMS_ROOT = join(tmpdir(), "astrix-streams");

// Where recordings are saved permanently.
const RECORDINGS_ROOT = join(__dirname, "../../../recordings");

export class FfmpegNotFoundError extends Error {
  constructor() {
    super("ffmpeg_not_found");
  }
}

// ---- FFmpeg discovery ---------------------------------------------------

let _ffmpegPath: string | null | undefined = undefined; // undefined = not yet checked

export function findFfmpeg(): string {
  if (_ffmpegPath !== undefined) {
    if (_ffmpegPath === null) throw new FfmpegNotFoundError();
    return _ffmpegPath;
  }
  const candidates = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/snap/bin/ffmpeg"];
  for (const p of candidates) {
    if (existsSync(p)) {
      _ffmpegPath = p;
      return p;
    }
  }
  // Try PATH resolution via spawnSync
  try {
    const result = spawnSync("which", ["ffmpeg"], { encoding: "utf8" });
    const path = (result.stdout as string).trim();
    if (path) {
      _ffmpegPath = path;
      return path;
    }
  } catch {
    // ignore
  }
  _ffmpegPath = null;
  throw new FfmpegNotFoundError();
}



export function ffmpegAvailable(): boolean {
  try { findFfmpeg(); return true; } catch { return false; }
}

// ---- Active stream registry --------------------------------------------

interface StreamEntry {
  cameraId: string;
  rtspUrl: string;
  proc: ChildProcess;
  hlsDir: string;
  startedAt: number;
  watchers: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const activeStreams = new Map<string, StreamEntry>();

// Stop a stream after 30 s of no watchers (saves CPU/bandwidth).
const IDLE_TIMEOUT_MS = 30_000;

function hlsDirFor(cameraId: string): string {
  return join(STREAMS_ROOT, cameraId);
}

export function getHlsDir(cameraId: string): string {
  return hlsDirFor(cameraId);
}

export function isStreamActive(cameraId: string): boolean {
  return activeStreams.has(cameraId);
}

/**
 * Start (or reuse) an HLS stream for the given camera.
 * Returns the path to stream.m3u8.
 */
export async function startStream(cameraId: string, rtspUrl: string): Promise<string> {
  // If already running, bump watcher count and return.
  const existing = activeStreams.get(cameraId);
  if (existing) {
    existing.watchers++;
    if (existing.idleTimer) {
      clearTimeout(existing.idleTimer);
      existing.idleTimer = null;
    }
    return join(existing.hlsDir, "stream.m3u8");
  }

  const ffmpeg = findFfmpeg();
  const hlsDir = hlsDirFor(cameraId);
  await mkdir(hlsDir, { recursive: true });

  const m3u8 = join(hlsDir, "stream.m3u8");

  // FFmpeg args: low-latency HLS, 2-second segments, keep 3 segments.
  const args = [
    "-loglevel", "warning",
    "-rtsp_transport", "tcp",         // more reliable over LAN than UDP
    "-i", rtspUrl,
    "-c:v", "copy",                    // no re-encode — pass through as-is
    "-c:a", "aac",
    "-b:a", "96k",
    "-f", "hls",
    "-hls_time", "2",
    "-hls_list_size", "3",
    "-hls_flags", "delete_segments+append_list",
    "-hls_segment_filename", join(hlsDir, "seg_%03d.ts"),
    m3u8,
  ];

  const proc = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });

  const entry: StreamEntry = {
    cameraId,
    rtspUrl,
    proc,
    hlsDir,
    startedAt: Date.now(),
    watchers: 1,
    idleTimer: null,
  };
  activeStreams.set(cameraId, entry);

  proc.on("exit", (code) => {
    // If it dies unexpectedly (not us stopping it), clean up the map.
    if (activeStreams.get(cameraId) === entry) {
      activeStreams.delete(cameraId);
    }
  });

  // Give FFmpeg a moment to create the manifest before we return.
  await waitForFile(m3u8, 8000);
  return m3u8;
}

/**
 * Decrement watcher count. After IDLE_TIMEOUT_MS with zero watchers, kill.
 */
export function releaseStream(cameraId: string): void {
  const entry = activeStreams.get(cameraId);
  if (!entry) return;
  entry.watchers = Math.max(0, entry.watchers - 1);
  if (entry.watchers === 0 && !entry.idleTimer) {
    entry.idleTimer = setTimeout(() => stopStream(cameraId), IDLE_TIMEOUT_MS);
  }
}

export function stopStream(cameraId: string): void {
  const entry = activeStreams.get(cameraId);
  if (!entry) return;
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  entry.proc.kill("SIGTERM");
  activeStreams.delete(cameraId);
  // Clean up HLS segments async.
  rm(entry.hlsDir, { recursive: true, force: true }).catch(() => {});
}

export function stopAllStreams(): void {
  for (const id of activeStreams.keys()) stopStream(id);
}

// ---- Snapshot ----------------------------------------------------------

/**
 * Grab a single JPEG frame from the RTSP stream.
 * Returns a Buffer with JPEG data.
 */
export async function takeSnapshot(rtspUrl: string): Promise<Buffer> {
  const ffmpeg = findFfmpeg();
  return new Promise((resolve, reject) => {
    const args = [
      "-loglevel", "error",
      "-rtsp_transport", "tcp",
      "-i", rtspUrl,
      "-frames:v", "1",
      "-f", "image2",
      "-vcodec", "mjpeg",
      "pipe:1",
    ];
    const chunks: Buffer[] = [];
    const proc = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
    proc.stdout!.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr!.on("data", () => {}); // suppress
    proc.on("close", (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg snapshot exited ${code}`));
      }
    });
    // Timeout after 10s
    setTimeout(() => { proc.kill(); reject(new Error("snapshot_timeout")); }, 10_000);
  });
}

// ---- Recording ---------------------------------------------------------

interface RecordJob {
  proc: ChildProcess;
  cameraId: string;
  recordingId: string;
  filename: string;
  startedAt: number;
}

const activeRecordings = new Map<string, RecordJob>(); // cameraId → job

export function isRecording(cameraId: string): boolean {
  return activeRecordings.has(cameraId);
}

export async function startRecording(cameraId: string, rtspUrl: string): Promise<string> {
  if (activeRecordings.has(cameraId)) throw new Error("already_recording");

  mkdirSync(RECORDINGS_ROOT, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `camera-${cameraId}-${ts}.mp4`;
  const filepath = join(RECORDINGS_ROOT, filename);
  const ffmpeg = findFfmpeg();

  const rec = createRecordingEntry(cameraId, filename);

  const args = [
    "-loglevel", "warning",
    "-rtsp_transport", "tcp",
    "-i", rtspUrl,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "128k",
    filepath,
  ];

  const proc = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
  const job: RecordJob = { proc, cameraId, recordingId: rec.id, filename, startedAt: Date.now() };
  activeRecordings.set(cameraId, job);

  proc.on("close", () => {
    activeRecordings.delete(cameraId);
    try {
      const stat = statSync(filepath);
      const durationS = (Date.now() - job.startedAt) / 1000;
      finalizeRecording(job.recordingId, durationS, stat.size);
    } catch {
      finalizeRecording(job.recordingId, 0, 0);
    }
  });

  return rec.id;
}

export function stopRecording(cameraId: string): void {
  const job = activeRecordings.get(cameraId);
  if (!job) return;
  job.proc.kill("SIGINT"); // SIGINT causes FFmpeg to write a valid MP4 footer
}

// ---- ONVIF discovery ---------------------------------------------------

/**
 * WS-Discovery multicast probe to find ONVIF-compatible devices on the LAN.
 * Returns a list of device endpoint URLs (XAddrs).
 *
 * Lightweight implementation — no external npm dep.
 */
export async function discoverOnvifDevices(timeoutMs = 4000): Promise<string[]> {
  const { createSocket } = await import("node:dgram");

  const PROBE = `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:${randomId()}</w:MessageID>
    <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe>
  </e:Body>
</e:Envelope>`;

  return new Promise((resolve) => {
    const sock = createSocket("udp4");
    const found: string[] = [];

    sock.bind(() => {
      sock.setBroadcast(true);
      sock.send(PROBE, 3702, "239.255.255.250");
    });

    sock.on("message", (msg: Buffer) => {
      const text = msg.toString();
      // Extract XAddrs from the response XML
      const match = text.match(/<[^:]*:?XAddrs[^>]*>(.*?)<\/[^:]*:?XAddrs>/s);
      if (match?.[1]) {
        const addrs = match[1].trim().split(/\s+/).filter(Boolean);
        for (const a of addrs) {
          if (!found.includes(a)) found.push(a);
        }
      }
    });

    sock.on("error", () => { /* ignore */ });

    setTimeout(() => {
      sock.close();
      resolve(found);
    }, timeoutMs);
  });
}

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---- helpers -----------------------------------------------------------

function waitForFile(path: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (existsSync(path)) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error(`timeout waiting for ${path}`));
      setTimeout(check, 200);
    };
    check();
  });
}
