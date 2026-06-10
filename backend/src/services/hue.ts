/**
 * Philips Hue v2 client + cache.
 *
 * Reads the existing pairing from ~/.openclaw/secrets/hue.json so we don't
 * have to build a pairing wizard yet (Phase 5A in the plan). A later
 * milestone can replace this with a DB-stored pairing + a UI flow.
 *
 * Why a cache instead of "fetch from the bridge every call"?
 *   - The bridge is throttled (~10 commands/s) and slow over LAN HTTPS.
 *   - The Lighting UI wants a *snapshot* of all rooms with their current
 *     on/off + brightness, which is several HTTP calls if done naively.
 *   - We refresh the cache every 10s and also on-demand after a command,
 *     so the UI reflects writes immediately.
 *
 * The Hue v2 API uses a self-signed cert. Until we plumb in cert pinning
 * we accept the bridge's cert without verification — same posture as every
 * other Hue client we've shipped. The connection is LAN-only and the
 * application key is the real auth here.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Agent, fetch as undiciFetch } from "undici";
import { getHueBridgeConfig } from "./settings.js";

const SECRETS_PATH =
  process.env.HUE_SECRETS_PATH ??
  join(homedir(), ".openclaw", "secrets", "hue.json");

interface HueSecrets {
  bridgeIp: string;
  applicationKey: string;
}

/**
 * Load credentials: DB settings row takes precedence, then fall back to
 * the legacy ~/.openclaw/secrets/hue.json so existing pairings keep working
 * without requiring a re-pair.
 */
function loadSecrets(): HueSecrets | null {
  // 1. Check DB settings (written by the pairing wizard).
  const dbCfg = getHueBridgeConfig();
  if (dbCfg) return { bridgeIp: dbCfg.ip, applicationKey: dbCfg.applicationKey };

  // 2. Fall back to secrets file.
  if (!existsSync(SECRETS_PATH)) return null;
  try {
    const data = JSON.parse(readFileSync(SECRETS_PATH, "utf8"));
    if (!data.bridgeIp || !data.applicationKey) return null;
    return { bridgeIp: data.bridgeIp, applicationKey: data.applicationKey };
  } catch {
    return null;
  }
}

export function isHueConfigured(): boolean {
  return loadSecrets() !== null;
}

// Self-signed bridge cert. Reused across requests so we don't recreate it.
const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });

async function hueFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const s = loadSecrets();
  if (!s) throw new Error("hue_not_paired");
  // We use undici's fetch directly (not Node's global fetch) because only the
  // direct export respects the `dispatcher` field for self-signed TLS. The
  // global wrapper silently drops it and fails with `fetch failed`.
  const res = await undiciFetch(`https://${s.bridgeIp}/clip/v2/resource${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "hue-application-key": s.applicationKey,
      "content-type": "application/json",
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    dispatcher,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`hue_${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ---- Types ---------------------------------------------------------------

export interface HueRoom {
  id: string;
  name: string;
  archetype: string | null;
  /** Aggregated on/off across the room's lights. */
  on: boolean;
  /** Average brightness 0..100, or null if the room has no dimmable lights. */
  brightness: number | null;
  /** Whether any light is currently reachable — useful UX hint. */
  anyReachable: boolean;
  /** Available scenes paired to this room. Empty array if none. */
  scenes: HueScene[];
}

export interface HueScene {
  id: string;
  name: string;
}

// ---- Raw bridge shapes (only the fields we care about) ------------------

interface RoomResource {
  id: string;
  metadata: { name: string; archetype?: string };
  children: { rid: string; rtype: string }[]; // device ids
}

interface DeviceResource {
  id: string;
  services: { rid: string; rtype: string }[];
}

interface LightResource {
  id: string;
  on: { on: boolean };
  dimming?: { brightness: number };
}

interface SceneResource {
  id: string;
  metadata: { name: string };
  group: { rid: string; rtype: string };
}

interface GroupedLight {
  id: string;
  on: { on: boolean };
  dimming?: { brightness: number };
}

// ---- Snapshot building --------------------------------------------------

interface Snapshot {
  rooms: HueRoom[];
  /** Map room id -> grouped_light id, for fast on/off + dim. */
  groupedLightForRoom: Map<string, string>;
  fetchedAt: number;
}

let snapshot: Snapshot | null = null;
let fetchInFlight: Promise<Snapshot> | null = null;
const SNAPSHOT_TTL_MS = 10_000;

/**
 * Fetch + assemble the snapshot. The bridge v2 API splits things across four
 * resource types — room, device, light, grouped_light — and rooms only
 * directly reference devices, not lights. So:
 *   1. list rooms
 *   2. list devices (we need device.services to find the light services)
 *   3. list lights (on/off + dim per light)
 *   4. list grouped_lights (so room-level on/off/dim is one HTTP call)
 *
 * We do all four in parallel.
 */
async function buildSnapshot(): Promise<Snapshot> {
  const [roomRes, deviceRes, lightRes, groupedRes, sceneRes] = await Promise.all([
    hueFetch<{ data: RoomResource[] }>("/room"),
    hueFetch<{ data: DeviceResource[] }>("/device"),
    hueFetch<{ data: LightResource[] }>("/light"),
    hueFetch<{ data: (GroupedLight & { owner: { rid: string; rtype: string } })[] }>(
      "/grouped_light",
    ),
    hueFetch<{ data: SceneResource[] }>("/scene"),
  ]);

  // Build lookup tables.
  const devicesById = new Map(deviceRes.data.map((d) => [d.id, d]));
  const lightsById = new Map(lightRes.data.map((l) => [l.id, l]));
  const groupedByRoom = new Map<string, GroupedLight>();
  for (const g of groupedRes.data) {
    if (g.owner?.rtype === "room") groupedByRoom.set(g.owner.rid, g);
  }

  // Group scenes by their owning room.
  const scenesByRoom = new Map<string, HueScene[]>();
  for (const s of sceneRes.data) {
    if (s.group?.rtype !== "room") continue;
    const list = scenesByRoom.get(s.group.rid) ?? [];
    list.push({ id: s.id, name: s.metadata.name });
    scenesByRoom.set(s.group.rid, list);
  }

  const rooms: HueRoom[] = [];
  const groupedLightForRoom = new Map<string, string>();

  for (const room of roomRes.data) {
    // Find every light service hanging off the room's devices.
    const lightIds: string[] = [];
    for (const child of room.children) {
      if (child.rtype !== "device") continue;
      const dev = devicesById.get(child.rid);
      if (!dev) continue;
      for (const svc of dev.services) {
        if (svc.rtype === "light") lightIds.push(svc.rid);
      }
    }

    // Aggregate.
    let on = false;
    let brightSum = 0;
    let brightCount = 0;
    let reachable = false;
    for (const lid of lightIds) {
      const l = lightsById.get(lid);
      if (!l) continue;
      reachable = true; // listed = paired, treat as reachable
      if (l.on.on) on = true;
      if (typeof l.dimming?.brightness === "number") {
        brightSum += l.dimming.brightness;
        brightCount += 1;
      }
    }

    const scenes = (scenesByRoom.get(room.id) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    rooms.push({
      id: room.id,
      name: room.metadata.name,
      archetype: room.metadata.archetype ?? null,
      on,
      brightness: brightCount ? Math.round(brightSum / brightCount) : null,
      anyReachable: reachable,
      scenes,
    });

    const grouped = groupedByRoom.get(room.id);
    if (grouped) groupedLightForRoom.set(room.id, grouped.id);
  }

  // Stable sort by name so the UI doesn't reshuffle between polls.
  rooms.sort((a, b) => a.name.localeCompare(b.name));

  return { rooms, groupedLightForRoom, fetchedAt: Date.now() };
}

export async function getSnapshot(force = false): Promise<Snapshot> {
  if (!force && snapshot && Date.now() - snapshot.fetchedAt < SNAPSHOT_TTL_MS) {
    return snapshot;
  }
  // Coalesce concurrent fetches.
  if (fetchInFlight) return fetchInFlight;
  fetchInFlight = buildSnapshot()
    .then((s) => {
      snapshot = s;
      return s;
    })
    .finally(() => {
      fetchInFlight = null;
    });
  return fetchInFlight;
}

/** Convenience: rooms only, with cache. */
export async function listRooms(): Promise<HueRoom[]> {
  const s = await getSnapshot();
  return s.rooms;
}

/** Look up the grouped_light id for a room, fetching the snapshot if needed. */
async function groupedIdFor(roomId: string): Promise<string | null> {
  const s = await getSnapshot();
  return s.groupedLightForRoom.get(roomId) ?? null;
}

// ---- Commands -----------------------------------------------------------

export async function setRoomOn(roomId: string, on: boolean): Promise<void> {
  const gid = await groupedIdFor(roomId);
  if (!gid) throw new Error("unknown_room");
  await hueFetch(`/grouped_light/${gid}`, { method: "PUT", body: { on: { on } } });
  // Invalidate so the next snapshot fetch picks up the change.
  snapshot = null;
}

export async function setRoomBrightness(
  roomId: string,
  brightness: number,
): Promise<void> {
  const gid = await groupedIdFor(roomId);
  if (!gid) throw new Error("unknown_room");
  const b = Math.max(1, Math.min(100, Math.round(brightness)));
  // Setting brightness on a light that's off is a no-op on the v2 API —
  // we also set on:true so a slider drag turns the room on as a side effect.
  await hueFetch(`/grouped_light/${gid}`, {
    method: "PUT",
    body: { on: { on: b > 0 }, dimming: { brightness: b } },
  });
  snapshot = null;
}

/**
 * Apply ("recall") a scene to a room. The Hue v2 API does this by PUT-ing
 * `recall: { action: "active" }` to the scene resource itself. We also
 * verify the scene actually belongs to the room the caller named, so a
 * lighting-permission check on the room translates correctly — you can't
 * recall the Bedroom "Relax" scene through a route that authorised you for
 * Office only.
 */
export async function recallScene(
  roomId: string,
  sceneId: string,
): Promise<void> {
  const snap = await getSnapshot();
  const room = snap.rooms.find((r) => r.id === roomId);
  if (!room) throw new Error("unknown_room");
  if (!room.scenes.some((s) => s.id === sceneId)) {
    throw new Error("scene_not_in_room");
  }
  await hueFetch(`/scene/${sceneId}`, {
    method: "PUT",
    body: { recall: { action: "active" } },
  });
  snapshot = null;
}
