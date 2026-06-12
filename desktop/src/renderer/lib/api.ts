/**
 * Backend HTTP client.
 *
 * One small wrapper around fetch so screens don't sprinkle raw URLs +
 * Authorization headers everywhere. The base URL comes from the persisted
 * AppConfig; the token comes from the in-memory session (set by the auth
 * context). Errors are normalised into ApiError so the UI can branch cleanly.
 */
import type {
  AdminUserView,
  AttachmentSummary,
  Camera,
  CameraRecording,
  ChatMessage,
  ChatStreamEvent,
  ConversationSummary,
  CreateCameraBody,
  CreateUserBody,
  Feature,
  GatewayConfig,
  GroupMessage,
  HueBridgeCandidate,
  HueDiscoverResult,
  HueRoom,
  Permission,
  SessionInfo,
  User,
} from "@shared/types";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message?: string,
  ) {
    super(message ?? `api_${code}`);
  }
}

interface RequestOpts {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
  /** Override the cached base URL (used during initial config probe). */
  baseUrl?: string;
}

/**
 * Hold the current base URL + token in module scope. The auth context updates
 * these via `setAuth()` whenever they change so callers don't have to thread
 * them through every screen.
 */
let _baseUrl = "http://127.0.0.1:18800";
let _token: string | null = null;

export function setBaseUrl(url: string) {
  _baseUrl = url.replace(/\/+$/, "");
}

export function setToken(token: string | null) {
  _token = token;
}

export function getBaseUrl() {
  return _baseUrl;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const base = (opts.baseUrl ?? _baseUrl).replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = opts.token === undefined ? _token : opts.token;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch (e) {
    throw new ApiError(
      "network",
      0,
      e instanceof Error ? e.message : "network_error",
    );
  }

  if (res.status === 204) return undefined as T;

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* tolerate empty body */
  }

  if (!res.ok) {
    const code =
      (json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : `http_${res.status}`);
    throw new ApiError(code, res.status);
  }
  return json as T;
}

// ---- Typed endpoints ----------------------------------------------------

export const api = {
  health: (baseUrl?: string) =>
    request<{ ok: true; ts: number }>("/api/health", { baseUrl }),

  setupStatus: (baseUrl?: string) =>
    request<{ needsSetup: boolean }>("/api/setup-status", { baseUrl }),

  setup: (body: { username: string; pin: string }, baseUrl?: string) =>
    request<SessionInfo>("/api/setup", {
      method: "POST",
      body,
      baseUrl,
      token: null,
    }),

  login: (body: { username: string; pin: string }, baseUrl?: string) =>
    request<SessionInfo>("/api/login", {
      method: "POST",
      body,
      baseUrl,
      token: null,
    }),

  logout: () => request<{ ok: true }>("/api/logout", { method: "POST" }),

  me: () =>
    request<{ user: User; permissions: Permission[] }>("/api/me"),

  setOwnPin: (pin: string) =>
    request<{ ok: true }>("/api/me/pin", { method: "POST", body: { pin } }),

  // ---- conversations ----
  listConversations: () =>
    request<{ conversations: ConversationSummary[] }>("/api/conversations"),
  newConversation: () =>
    request<{ id: string }>("/api/conversations", { method: "POST" }),
  loadConversation: (id: string) =>
    request<{ messages: ChatMessage[] }>(`/api/conversations/${id}`),
  deleteConversation: (id: string) =>
    request<{ ok: true }>(`/api/conversations/${id}`, { method: "DELETE" }),
  deleteChatMessage: (convId: string, msgId: string) =>
    request<{ ok: true }>(`/api/conversations/${convId}/messages/${msgId}`, {
      method: "DELETE",
    }),

  // ---- admin ----
  getGatewayConfig: () =>
    request<GatewayConfig>("/api/admin/gateway"),
  setGatewayConfig: (patch: Partial<GatewayConfig>) =>
    request<GatewayConfig>("/api/admin/gateway", { method: "PATCH", body: patch }),

  // ---- hue pairing (admin) ----
  discoverHue: () =>
    request<HueDiscoverResult>("/api/admin/hue/discover", { method: "POST" }),
  pairHue: (ip: string) =>
    request<{ applicationKey?: string; pending?: boolean }>("/api/admin/hue/pair", {
      method: "POST",
      body: { ip },
    }),

  // ---- lighting ----
  listRooms: () => request<{ rooms: HueRoom[] }>("/api/lighting/rooms"),
  setRoomOn: (id: string, on: boolean) =>
    request<{ room: HueRoom }>(`/api/lighting/rooms/${id}/on`, {
      method: "POST",
      body: { on },
    }),
  setRoomBrightness: (id: string, brightness: number) =>
    request<{ room: HueRoom }>(`/api/lighting/rooms/${id}/brightness`, {
      method: "POST",
      body: { brightness },
    }),
  recallScene: (roomId: string, sceneId: string) =>
    request<{ room: HueRoom }>(
      `/api/lighting/rooms/${roomId}/scenes/${sceneId}`,
      { method: "POST" },
    ),

  // ---- admin: users ----
  listAdminUsers: () =>
    request<{ users: AdminUserView[] }>("/api/admin/users"),
  createAdminUser: (body: CreateUserBody) =>
    request<{ user: AdminUserView }>("/api/admin/users", {
      method: "POST",
      body,
    }),
  patchAdminUser: (
    id: string,
    body: { pin?: string; avatar?: string | null; is_admin?: boolean },
  ) =>
    request<{ user: AdminUserView }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      body,
    }),
  setUserFeaturePermission: (
    id: string,
    feature: Feature,
    body: { granted?: boolean; rooms?: string[] },
  ) =>
    request<{ user: AdminUserView }>(
      `/api/admin/users/${id}/permissions/${feature}`,
      { method: "PUT", body },
    ),
  deleteAdminUser: (id: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}`, { method: "DELETE" }),

  // ---- cameras ----
  listCameras: () =>
    request<{ cameras: Camera[]; ffmpegAvailable: boolean }>("/api/cameras"),
  createCamera: (body: CreateCameraBody) =>
    request<{ camera: Camera }>("/api/cameras", { method: "POST", body }),
  updateCamera: (id: string, body: Partial<CreateCameraBody>) =>
    request<{ camera: Camera }>(`/api/cameras/${id}`, { method: "PATCH", body }),
  deleteCamera: (id: string) =>
    request<{ ok: true }>(`/api/cameras/${id}`, { method: "DELETE" }),
  startStream: async (id: string, quality?: "main" | "sub") => {
    const res = await request<{ ok: true; hlsUrl: string; streamId: string }>(
      `/api/cameras/${id}/stream/start`,
      { method: "POST", body: { quality: quality ?? "main" } },
    );
    // hlsUrl is a path — prefix with base URL so hls.js can fetch the segments
    return { ...res, hlsUrl: `${_baseUrl}${res.hlsUrl}` };
  },
  stopStream: (id: string) =>
    request<{ ok: true }>(`/api/cameras/${id}/stream/stop`, { method: "POST" }),
  streamStatus: (id: string) =>
    request<{ active: boolean; recording: boolean }>(`/api/cameras/${id}/stream/status`),
  snapshotUrl: (id: string) =>
    _token
      ? `${_baseUrl}/api/cameras/${id}/snapshot?token=${encodeURIComponent(_token)}`
      : `${_baseUrl}/api/cameras/${id}/snapshot`,
  mjpegUrl: (id: string) =>
    `${_baseUrl}/api/cameras/${id}/mjpeg`,
  hlsSegmentUrl: (path: string) =>
    _token ? `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(_token)}` : path,
  startRecording: (id: string) =>
    request<{ ok: true; recordingId: string }>(`/api/cameras/${id}/record/start`, { method: "POST" }),
  stopRecording: (id: string) =>
    request<{ ok: true }>(`/api/cameras/${id}/record/stop`, { method: "POST" }),
  listRecordings: (id: string) =>
    request<{ recordings: CameraRecording[] }>(`/api/cameras/${id}/recordings`),
  discoverCameras: (timeoutMs?: number) =>
    request<{ devices: string[] }>("/api/cameras/discover", {
      method: "POST",
      body: { timeoutMs: timeoutMs ?? 4000 },
    }),

  // ---- avatars ----
  uploadOwnAvatar: async (file: File) => uploadAvatar("/api/me/avatar", file),
  uploadUserAvatar: async (id: string, file: File) =>
    uploadAvatar(`/api/admin/users/${id}/avatar`, file),
  deleteOwnAvatar: () =>
    request<{ ok: true }>("/api/me/avatar", { method: "DELETE" }),
  deleteUserAvatar: (id: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}/avatar`, { method: "DELETE" }),

  // ---- attachments ----
  uploadAttachment: async (
    convId: string,
    file: File,
  ): Promise<AttachmentSummary> => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    const headers: Record<string, string> = {};
    if (_token) headers.Authorization = `Bearer ${_token}`;
    const res = await fetch(
      `${_baseUrl}/api/conversations/${convId}/attachments`,
      { method: "POST", headers, body: fd },
    );
    if (!res.ok) {
      let code = `http_${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j?.error) code = j.error;
      } catch { /* ignore */ }
      throw new ApiError(code, res.status);
    }
    return (await res.json()) as AttachmentSummary;
  },
  attachmentUrl: (id: string): string => {
    const url = `${_baseUrl}/api/attachments/${id}`;
    return _token ? `${url}?token=${encodeURIComponent(_token)}` : url;
  },
  getAttachmentAuthorized: async (id: string): Promise<Blob> => {
    const headers: Record<string, string> = {};
    if (_token) headers.Authorization = `Bearer ${_token}`;
    const res = await fetch(`${_baseUrl}/api/attachments/${id}`, { headers });
    if (!res.ok) throw new ApiError(`http_${res.status}`, res.status);
    return await res.blob();
  },

  // ---- group chat ----
  listGroupMessages: (limit = 50, before?: number) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (before) q.set("before", String(before));
    return request<{ messages: GroupMessage[] }>(`/api/group/messages?${q.toString()}`);
  },
  deleteGroupMessage: (id: string) =>
    request<{ ok: true }>(`/api/group/messages/${id}`, { method: "DELETE" }),
  postGroupMessage: (body: string, attachment_ids: string[] = []) =>
    request<{ message: GroupMessage }>("/api/group/messages", {
      method: "POST",
      body: { body, attachment_ids },
    }),
  uploadGroupAttachment: async (file: File): Promise<AttachmentSummary> => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    const headers: Record<string, string> = {};
    if (_token) headers.Authorization = `Bearer ${_token}`;
    const res = await fetch(`${_baseUrl}/api/group/attachments`, {
      method: "POST",
      headers,
      body: fd,
    });
    if (!res.ok) {
      let code = `http_${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j?.error) code = j.error;
      } catch { /* ignore */ }
      throw new ApiError(code, res.status);
    }
    return (await res.json()) as AttachmentSummary;
  },
  groupAttachmentUrl: (id: string): string => {
    const url = `${_baseUrl}/api/group/attachments/${id}`;
    return _token ? `${url}?token=${encodeURIComponent(_token)}` : url;
  },
};

/** Open a WebSocket to the group room. Returns the raw WS so callers control reconnect. */
export function openGroupSocket(): WebSocket {
  const url = new URL(getBaseUrl());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/group/ws";
  if (_token) url.searchParams.set("token", _token);
  return new WebSocket(url.toString());
}

/**
 * Upload a single image file as a raw image body. We avoid multipart on the
 * client because the desktop's File API gives us a clean Blob; the backend
 * accepts both. Auth comes from the in-memory _token.
 */
async function uploadAvatar(
  path: string,
  file: File,
): Promise<{ ok: true; bytes: number }> {
  const headers: Record<string, string> = {
    "Content-Type": file.type || "image/png",
  };
  if (_token) headers.Authorization = `Bearer ${_token}`;
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: "POST",
    headers,
    body: file,
  });
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) code = j.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(code, res.status);
  }
  return (await res.json()) as { ok: true; bytes: number };
}

/**
 * Stream a chat turn from the backend. Returns an async iterable of
 * ChatStreamEvent. Caller decides when to break the loop (e.g. on "done" or
 * "error"). Closing the iterator aborts the request.
 */
export async function* streamChatMessage(
  convId: string,
  text: string,
  attachmentIds: string[] = [],
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent, void, void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (_token) headers.Authorization = `Bearer ${_token}`;

  const res = await fetch(
    `${_baseUrl}/api/conversations/${convId}/messages`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ text, attachment_ids: attachmentIds }),
      signal,
    },
  );

  if (!res.ok || !res.body) {
    let code = `http_${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) code = j.error;
    } catch {
      /* ignore */
    }
    yield { type: "error", error: code };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, sep).trim();
        buffer = buffer.slice(sep + 2);
        if (!event.startsWith("data:")) continue;
        const payload = event.slice(5).trim();
        if (!payload) continue;
        try {
          yield JSON.parse(payload) as ChatStreamEvent;
        } catch {
          /* tolerate malformed events */
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}
