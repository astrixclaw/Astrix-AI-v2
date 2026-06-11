/**
 * Backend settings store.
 *
 * Single-row key/value table. We expose a tiny typed surface over it so callers
 * don't sprinkle SQL or magic-string keys around. Right now we only persist
 * the OpenClaw gateway URL + token; future settings (Hue bridge IP, group
 * chat title, etc.) go through the same `getSetting` / `setSetting` pair.
 *
 * Empty string means "unset" — we treat it the same as a missing row so
 * callers can do `if (!gateway.url)` without worrying about whitespace rows.
 */
import { db } from "../db/index.js";

const stmts = {
  get: db.prepare(`SELECT value FROM settings WHERE key = ?`),
  upsert: db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE
      SET value = excluded.value, updated_at = excluded.updated_at
  `),
};

export const SETTING_KEYS = {
  GATEWAY_URL: "gateway.url",
  GATEWAY_TOKEN: "gateway.token",
  GATEWAY_AGENT: "gateway.agent",
  GATEWAY_MEMBER_AGENT: "gateway.member_agent",
  HUE_BRIDGE_IP: "hue_bridge.ip",
  HUE_BRIDGE_KEY: "hue_bridge.application_key",
} as const;

function getSetting(key: string): string {
  const row = stmts.get.get(key) as { value: string } | undefined;
  return row?.value?.trim() ?? "";
}

function setSetting(key: string, value: string): void {
  stmts.upsert.run(key, value, Date.now());
}

export interface GatewayConfig {
  url: string;
  token: string;
  agent: string;
  memberAgent: string;
}

export function getGatewayConfig(): GatewayConfig {
  return {
    url: getSetting(SETTING_KEYS.GATEWAY_URL),
    token: getSetting(SETTING_KEYS.GATEWAY_TOKEN),
    agent: getSetting(SETTING_KEYS.GATEWAY_AGENT) || "default",
    memberAgent: getSetting(SETTING_KEYS.GATEWAY_MEMBER_AGENT) || "lite",
  };
}

export function setGatewayConfig(patch: Partial<GatewayConfig>): GatewayConfig {
  if (patch.url !== undefined) setSetting(SETTING_KEYS.GATEWAY_URL, patch.url.trim());
  if (patch.token !== undefined) setSetting(SETTING_KEYS.GATEWAY_TOKEN, patch.token.trim());
  if (patch.agent !== undefined) setSetting(SETTING_KEYS.GATEWAY_AGENT, patch.agent.trim());
  if (patch.memberAgent !== undefined) setSetting(SETTING_KEYS.GATEWAY_MEMBER_AGENT, patch.memberAgent.trim());
  return getGatewayConfig();
}

export interface HueBridgeConfig {
  ip: string;
  applicationKey: string;
}

export function getHueBridgeConfig(): HueBridgeConfig | null {
  const ip = getSetting(SETTING_KEYS.HUE_BRIDGE_IP);
  const key = getSetting(SETTING_KEYS.HUE_BRIDGE_KEY);
  if (!ip || !key) return null;
  return { ip, applicationKey: key };
}

export function setHueBridgeConfig(cfg: HueBridgeConfig): void {
  setSetting(SETTING_KEYS.HUE_BRIDGE_IP, cfg.ip.trim());
  setSetting(SETTING_KEYS.HUE_BRIDGE_KEY, cfg.applicationKey.trim());
}
