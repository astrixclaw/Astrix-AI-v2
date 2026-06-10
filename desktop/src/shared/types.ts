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

// ---- Chat ---------------------------------------------------------------

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: number;
  message_count: number;
}

export interface AttachmentSummary {
  id: string;
  mime: string;
  size: number;
  original_name: string;
  kind: "image" | "text";
}

export interface ChatMessage {
  id: string;
  conv_id: string;
  role: "user" | "assistant";
  body: string;
  created_at: number;
  attachments?: AttachmentSummary[];
}

/** SSE event payloads from POST /api/conversations/:id/messages. */
export type ChatStreamEvent =
  | { type: "user_saved"; message: ChatMessage }
  | { type: "delta"; text: string }
  | { type: "done"; message: ChatMessage }
  | { type: "error"; error: string };

// ---- Admin gateway config ----------------------------------------------

export interface GatewayConfig {
  url: string;
  token: string;
  agent: string;
}

// ---- Hue pairing -------------------------------------------------------

export interface HueBridgeCandidate {
  ip: string;
  id: string;
}

export interface HueDiscoverResult {
  candidates: HueBridgeCandidate[];
  hint?: string;
}

// ---- Lighting (Philips Hue) ---------------------------------------------

export interface HueScene {
  id: string;
  name: string;
}

export interface HueRoom {
  id: string;
  name: string;
  archetype: string | null;
  on: boolean;
  brightness: number | null;
  anyReachable: boolean;
  scenes: HueScene[];
}

// ---- Group chat ---------------------------------------------------------

export interface GroupMessage {
  id: string;
  user_id: string;
  username: string;
  avatar: string | null;
  body: string;
  created_at: number;
  attachments?: AttachmentSummary[];
}

export interface GroupTyping {
  user_id: string;
  username: string;
  typing: boolean;
}

export type GroupSocketEvent =
  | { type: "hello"; user_id: string }
  | { type: "message"; message: GroupMessage }
  | { type: "typing"; typing: GroupTyping }
  | { type: "message_deleted"; id: string }
  | { type: "error"; error: string };

// ---- Admin: users + permissions ----------------------------------------

export type Feature = "chat" | "lighting" | "group_chat";

export interface AdminUserView extends User {
  permissions: { feature: Feature; resource_id: string | null }[];
}

export interface CreateUserBody {
  username: string;
  pin: string;
  is_admin?: boolean;
  avatar?: string | null;
  permissions?: {
    chat?: boolean;
    group_chat?: boolean;
    lighting?: string[];
  };
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
