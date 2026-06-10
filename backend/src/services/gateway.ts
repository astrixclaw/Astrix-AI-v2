/**
 * OpenClaw gateway client.
 *
 * Talks to the OpenAI-compatible `/v1/chat/completions` endpoint on the
 * OpenClaw gateway. We stream SSE deltas through to our own SSE response so
 * the desktop sees text as it lands.
 *
 * Important contract notes (learned the hard way):
 *  - The `model` field must be `openclaw` or `openclaw/<agentId>` — the
 *    gateway picks the actual LLM from the agent's config, not from this
 *    field. We default to `openclaw/main` unless the admin sets a different
 *    agent.
 *  - SSE events look like:
 *        data: {"choices":[{"delta":{"content":"..."}}]}
 *        ...
 *        data: [DONE]
 *  - Per-user identity comes from a prepended `system` message naming the
 *    household member. The agent's USER.md / SOUL.md fill in the rest.
 *
 * If the gateway URL isn't set, we throw GatewayNotConfiguredError and let
 * the route layer translate to a friendly error event.
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

export type GatewayContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content: string | GatewayContentPart[];
}

export interface StreamChunk {
  kind: "delta" | "done" | "error";
  text?: string;
  error?: string;
}

/** Build the OpenClaw model string from the configured agent. */
function modelFor(agent: string): string {
  const a = agent.trim();
  if (!a || a === "openclaw") return "openclaw";
  if (a.startsWith("openclaw/")) return a;
  return `openclaw/${a}`;
}

/**
 * Stream a chat turn. Yields `delta` chunks as text arrives, ends with `done`,
 * or yields `error` and stops.
 */
export async function* streamChatTurn(opts: {
  username: string;
  history: GatewayMessage[];
  newUserMessage: string | GatewayContentPart[];
  signal?: AbortSignal;
}): AsyncGenerator<StreamChunk, void, void> {
  const cfg = getGatewayConfig();
  if (!cfg.url) {
    throw new GatewayNotConfiguredError();
  }

  // Per-user identity hint goes in as a system message every turn.
  const messages: GatewayMessage[] = [
    {
      role: "system",
      content: `You are chatting with the household member named "${opts.username}". Address them by name when natural; don't overuse it.`,
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
    res = await fetch(
      `${cfg.url.replace(/\/+$/, "")}/v1/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelFor(cfg.agent || "main"),
          messages,
          stream: true,
        }),
        signal: opts.signal,
      },
    );
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

  // Parse SSE: blocks separated by blank lines; each line starts with `data:`.
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
        const event = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        // An event can have multiple `data:` lines; concat them.
        const dataLines: string[] = [];
        for (const line of event.split("\n")) {
          const trimmed = line.replace(/^\r/, "");
          if (trimmed.startsWith("data:")) dataLines.push(trimmed.slice(5).trim());
        }
        if (dataLines.length === 0) continue;
        const payload = dataLines.join("\n");

        if (payload === "[DONE]") {
          yield { kind: "done" };
          return;
        }

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            error?: { message?: string };
          };
          if (parsed.error) {
            yield { kind: "error", error: parsed.error.message ?? "gateway_error" };
            return;
          }
          const choice = parsed.choices?.[0];
          const text = choice?.delta?.content;
          if (typeof text === "string" && text.length > 0) {
            yield { kind: "delta", text };
          }
          if (choice?.finish_reason && choice.finish_reason !== null) {
            // Most providers also send `[DONE]` after the final chunk; treat
            // either signal as end-of-stream.
            yield { kind: "done" };
            return;
          }
        } catch {
          // Ignore malformed events — the gateway shouldn't emit them, but if
          // it does we'd rather miss one delta than crash the whole stream.
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
