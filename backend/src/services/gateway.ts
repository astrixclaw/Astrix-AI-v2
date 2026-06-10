/**
 * OpenClaw gateway client.
 *
 * Talks to the upstream OpenClaw `/agent/turn` SSE endpoint and re-emits
 * each delta to our caller. We do almost no transformation — the desktop app
 * gets a clean async iterator of text chunks plus a final done event.
 *
 * Per-user identity is baked in by prepending a system message naming the
 * household member who is talking. The gateway has its own USER.md/SOUL.md,
 * but the system message wins on identity since it's sent every turn.
 *
 * If the gateway isn't configured (no URL set yet), we throw a typed error
 * the route layer can convert into a friendly 503.
 */
import { getGatewayConfig } from "./settings.js";

export class GatewayNotConfiguredError extends Error {
  constructor() {
    super("gateway_not_configured");
  }
}

export class GatewayError extends Error {
  constructor(
    public status: number,
    msg: string,
  ) {
    super(msg);
  }
}

export interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamChunk {
  kind: "delta" | "done" | "error";
  text?: string;
  error?: string;
}

/**
 * Stream a chat turn. Yields `delta` chunks as text arrives, ends with `done`,
 * or yields `error` and stops. Caller decides how to surface to the client
 * (we re-emit as SSE in the route).
 */
export async function* streamChatTurn(opts: {
  username: string;
  history: GatewayMessage[];
  newUserMessage: string;
  signal?: AbortSignal;
}): AsyncGenerator<StreamChunk, void, void> {
  const cfg = getGatewayConfig();
  if (!cfg.url) {
    throw new GatewayNotConfiguredError();
  }

  // Prepend the per-user identity hint. Keep it short — the gateway's own
  // SOUL.md / USER.md fill in the rest.
  const messages: GatewayMessage[] = [
    {
      role: "system",
      content: `You are chatting with the household member named "${opts.username}". Address them by name.`,
    },
    ...opts.history,
    { role: "user", content: opts.newUserMessage },
  ];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;

  let res: Response;
  try {
    res = await fetch(`${cfg.url.replace(/\/+$/, "")}/agent/turn`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        agent: cfg.agent,
        messages,
        stream: true,
      }),
      signal: opts.signal,
    });
  } catch (e) {
    throw new GatewayError(
      0,
      e instanceof Error ? e.message : "gateway_unreachable",
    );
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new GatewayError(res.status, body || `http_${res.status}`);
  }

  // The gateway speaks SSE: lines of `data: <json>` separated by blank lines.
  // We buffer, split on \n\n, and forward each event's payload.
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
        if (payload === "[DONE]") {
          yield { kind: "done" };
          return;
        }
        try {
          const parsed = JSON.parse(payload) as
            | { delta?: string; text?: string; done?: boolean; error?: string };
          if (parsed.error) {
            yield { kind: "error", error: parsed.error };
            return;
          }
          if (parsed.done) {
            yield { kind: "done" };
            return;
          }
          const text = parsed.delta ?? parsed.text;
          if (typeof text === "string" && text.length > 0) {
            yield { kind: "delta", text };
          }
        } catch {
          // Forward any unparseable line as raw text — better than swallowing.
          if (payload) yield { kind: "delta", text: payload };
        }
      }
    }
    yield { kind: "done" };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}
