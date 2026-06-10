/**
 * Backend HTTP client.
 *
 * One small wrapper around fetch so screens don't sprinkle raw URLs +
 * Authorization headers everywhere. The base URL comes from the persisted
 * AppConfig; the token comes from the in-memory session (set by the auth
 * context). Errors are normalised into ApiError so the UI can branch cleanly.
 */
import type { Permission, SessionInfo, User } from "@shared/types";

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
};
