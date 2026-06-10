/**
 * Backend HTTP client.
 *
 * One small wrapper around fetch so screens don't sprinkle raw URLs +
 * Authorization headers everywhere. The base URL comes from the persisted
 * AppConfig; the token comes from the in-memory session (set by the auth
 * context). Errors are normalised into ApiError so the UI can branch cleanly.
 */
import type {
  ChatMessage,
  ChatStreamEvent,
  ConversationSummary,
  GatewayConfig,
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
  method?: "GET" | "POST" | "PATCH" | "DELETE";
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

  // ---- admin ----
  getGatewayConfig: () =>
    request<GatewayConfig>("/api/admin/gateway"),
  setGatewayConfig: (patch: Partial<GatewayConfig>) =>
    request<GatewayConfig>("/api/admin/gateway", { method: "PATCH", body: patch }),
};

/**
 * Stream a chat turn from the backend. Returns an async iterable of
 * ChatStreamEvent. Caller decides when to break the loop (e.g. on "done" or
 * "error"). Closing the iterator aborts the request.
 */
export async function* streamChatMessage(
  convId: string,
  text: string,
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
      body: JSON.stringify({ text }),
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
