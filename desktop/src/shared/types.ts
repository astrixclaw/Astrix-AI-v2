/**
 * Types shared between main, preload, and renderer.
 *
 * If you change any of these, run `npm run typecheck` to catch downstream
 * fallout in both projects.
 */

// ---- Backend user / session ----------------------------------------------

export interface User {
  id: string;
  username: string;
  is_admin: 0 | 1;
  avatar: string | null;
  created_at: number;
  updated_at: number;
}

export interface Permission {
  id: string;
  user_id: string;
  feature: "chat" | "lighting" | "group_chat";
  resource_id: string | null;
  created_at: number;
}

export interface SessionInfo {
  user: User;
  token: string;
  expires_at: number;
}

// ---- App settings (persisted on disk via the main process) ---------------

export interface AppConfig {
  /** Backend base URL, e.g. http://192.168.1.74:18800 */
  backendUrl: string;
}

// ---- IPC: what the preload exposes on window.api ------------------------

export interface ApiBridge {
  // -- config --
  getConfig(): Promise<AppConfig>;
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>;

  // -- session --
  getStoredSession(): Promise<SessionInfo | null>;
  saveSession(session: SessionInfo | null): Promise<void>;

  // -- meta --
  getAppVersion(): Promise<string>;
  openExternal(url: string): Promise<void>;
}

declare global {
  interface Window {
    api: ApiBridge;
  }
}
