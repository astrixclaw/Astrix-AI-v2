/**
 * Group chat screen — household-wide room.
 *
 * Two transports:
 *   - REST GET /api/group/messages  → initial history when we mount or reconnect
 *   - WS  /api/group/ws             → real-time stream of new messages + typing
 *
 * Reconnection strategy:
 *   - Auto-reconnect on close, exponential backoff (1s → 2s → 4s …, capped at 30s).
 *   - On reconnect, refetch history so any messages we missed during downtime
 *     reappear without manual refresh.
 *
 * UX notes:
 *   - Your own bubbles are right-aligned, gradient-tinted, no avatar circle.
 *   - Other people's bubbles are left-aligned with a coloured initial avatar.
 *   - Same day = grouped under a day header.
 *   - Composer behaves like the personal chat (auto-grow, Enter to send,
 *     Shift+Enter for newline).
 *   - We send a `typing` ping on every keystroke (debounced 600ms) so other
 *     household members see "… is typing" with a fade-in/out.
 */
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Avatar as UserAvatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { Sigil } from "../components/Sigil";
import { useAuth } from "../lib/auth";
import { api, openGroupSocket } from "../lib/api";
import { hasPermission } from "../lib/perms";
import type { GroupMessage, GroupSocketEvent, GroupTyping } from "@shared/types";

// ---------------------------------------------------------------------------

export function GroupChat() {
  const { user, permissions } = useAuth();
  const allowed = hasPermission(user, permissions, "group_chat");

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({}); // userId -> username
  const typingTimers = useRef<Record<string, number>>({});

  // ---- load history (also called on reconnect) -----------------------
  const loadHistory = useCallback(async () => {
    try {
      const res = await api.listGroupMessages(80);
      setMessages(res.messages);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  }, []);

  // ---- WebSocket with reconnect --------------------------------------
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const closedByUsRef = useRef(false);

  const handleEvent = useCallback((ev: GroupSocketEvent) => {
    if (ev.type === "message") {
      setMessages((prev) => {
        // Dedupe: REST POST returns the row and we also receive it over WS.
        if (prev.some((m) => m.id === ev.message.id)) return prev;
        return [...prev, ev.message];
      });
    } else if (ev.type === "typing") {
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (ev.typing.typing) next[ev.typing.user_id] = ev.typing.username;
        else delete next[ev.typing.user_id];
        return next;
      });
      // Auto-clear after 4s if no follow-up event arrives.
      const t = typingTimers.current[ev.typing.user_id];
      if (t) window.clearTimeout(t);
      if (ev.typing.typing) {
        typingTimers.current[ev.typing.user_id] = window.setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[ev.typing.user_id];
            return next;
          });
        }, 4000);
      }
    } else if (ev.type === "error") {
      setError(ev.error);
    }
  }, []);

  const connect = useCallback(() => {
    if (!allowed) return;
    closedByUsRef.current = false;
    try {
      const ws = openGroupSocket();
      wsRef.current = ws;
      ws.onopen = () => {
        backoffRef.current = 1000;
        setConnected(true);
        // Refetch history in case we missed messages during a reconnect.
        void loadHistory();
      };
      ws.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as GroupSocketEvent;
          handleEvent(ev);
        } catch {
          /* ignore garbage */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (closedByUsRef.current) return;
        const delay = Math.min(backoffRef.current, 30000);
        backoffRef.current = Math.min(backoffRef.current * 2, 30000);
        window.setTimeout(connect, delay);
      };
      ws.onerror = () => {
        // The close handler will fire too; nothing to do here.
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "ws_open_failed");
    }
  }, [allowed, loadHistory, handleEvent]);

  useEffect(() => {
    if (!allowed) return;
    void loadHistory();
    connect();
    return () => {
      closedByUsRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
      Object.values(typingTimers.current).forEach((t) => window.clearTimeout(t));
    };
  }, [allowed, connect, loadHistory]);

  // ---- send ----------------------------------------------------------
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.postGroupMessage(text);
      setInput("");
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "send_failed");
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  // ---- typing emit (debounced) ---------------------------------------
  const typingTimer = useRef<number | null>(null);
  const typingActiveRef = useRef(false);
  const onInputChange = useCallback((v: string) => {
    setInput(v);
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      try {
        ws.send(JSON.stringify({ type: "typing", typing: true }));
      } catch {
        /* socket gone */
      }
    }
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      typingActiveRef.current = false;
      try {
        ws.send(JSON.stringify({ type: "typing", typing: false }));
      } catch {
        /* socket gone */
      }
    }, 1500);
  }, []);

  // ---- auto-scroll ---------------------------------------------------
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, typingUsers]);

  // ---- groupings -----------------------------------------------------
  const grouped = useMemo(() => groupByDay(messages), [messages]);
  const meId = user?.id ?? "";

  if (!allowed) return <NoAccess />;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header connected={connected} />

      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: "auto", padding: "1rem 1.5rem 0.5rem", minHeight: 0 }}
      >
        {messages.length === 0 ? (
          <EmptyState username={user?.username ?? "friend"} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <AnimatePresence initial={false}>
              {grouped.map((group) => (
                <div key={group.dayKey}>
                  <DayHeader label={group.dayLabel} />
                  {group.messages.map((m, i) => (
                    <Bubble
                      key={m.id}
                      msg={m}
                      isMe={m.user_id === meId}
                      prev={group.messages[i - 1]}
                    />
                  ))}
                </div>
              ))}
            </AnimatePresence>
          </div>
        )}

        <TypingIndicator users={Object.values(typingUsers).filter((u) => u !== user?.username)} />
      </div>

      {error && (
        <div
          style={{
            padding: "0.5rem 1rem",
            color: "var(--danger)",
            fontSize: 12,
            background: "rgba(255,107,107,0.06)",
            borderTop: "1px solid var(--border)",
          }}
        >
          {prettyError(error)}
        </div>
      )}

      <Composer
        value={input}
        onChange={onInputChange}
        onSend={() => void send()}
        sending={sending}
        connected={connected}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Header({ connected }: { connected: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "1rem 1.5rem 0.5rem",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      <Sigil size={26} />
      <div style={{ flex: 1 }}>
        <h1
          className="gradient-text"
          style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}
        >
          Household
        </h1>
        <p style={{ margin: "0.15rem 0 0", fontSize: 12, color: "var(--text-dim)" }}>
          Everyone with group chat access can see this room
        </p>
      </div>
      <div
        title={connected ? "Live" : "Reconnecting…"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          fontSize: 11,
          color: connected ? "var(--success)" : "var(--text-dim)",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: connected ? "var(--success)" : "var(--text-faint)",
            boxShadow: connected ? "0 0 8px var(--success)" : "none",
          }}
        />
        {connected ? "Live" : "Reconnecting"}
      </div>
    </div>
  );
}

function DayHeader({ label }: { label: string }) {
  return (
    <div style={{ textAlign: "center", margin: "0.6rem 0 0.4rem" }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--text-faint)",
          background: "var(--bg-2)",
          padding: "0.15rem 0.6rem",
          borderRadius: 999,
          border: "1px solid var(--border)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Bubble({
  msg,
  isMe,
  prev,
}: {
  msg: GroupMessage;
  isMe: boolean;
  prev?: GroupMessage;
}) {
  // Stack messages from the same sender within 2 min — hide the name on follow-ups.
  const stack =
    !!prev &&
    prev.user_id === msg.user_id &&
    msg.created_at - prev.created_at < 2 * 60 * 1000;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: "flex",
        flexDirection: isMe ? "row-reverse" : "row",
        gap: "0.55rem",
        alignItems: "flex-end",
        margin: stack ? "0.15rem 0" : "0.6rem 0 0.15rem",
      }}
    >
      {!isMe && (
        stack ? <div style={{ width: 28 }} /> : (
          <UserAvatar userId={msg.user_id} username={msg.username} size={28} />
        )
      )}
      {isMe && <div style={{ width: 28 }} />}

      <div
        style={{
          maxWidth: "70%",
          display: "flex",
          flexDirection: "column",
          alignItems: isMe ? "flex-end" : "flex-start",
        }}
      >
        {!stack && !isMe && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-dim)",
              marginBottom: 2,
              fontWeight: 600,
            }}
          >
            {msg.username}
          </div>
        )}
        <div
          style={{
            padding: "0.55rem 0.85rem",
            borderRadius: "var(--radius-lg)",
            background: isMe
              ? "linear-gradient(135deg, rgba(122,167,255,0.30), rgba(164,139,255,0.22))"
              : "var(--bg-2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordWrap: "break-word",
          }}
          title={new Date(msg.created_at).toLocaleString()}
        >
          {msg.body}
        </div>
      </div>
    </motion.div>
  );
}

function TypingIndicator({ users }: { users: string[] }) {
  return (
    <AnimatePresence>
      {users.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          style={{
            marginTop: "0.4rem",
            paddingLeft: "0.4rem",
            color: "var(--text-dim)",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <Dots />
          <span>
            {users.length === 1
              ? `${users[0]} is typing…`
              : users.length === 2
                ? `${users[0]} and ${users[1]} are typing…`
                : `${users.length} people are typing…`}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Dots() {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--text-dim)",
          }}
        />
      ))}
    </span>
  );
}

function EmptyState({ username }: { username: string }) {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", textAlign: "center" }}>
      <div style={{ maxWidth: 320 }}>
        <Sigil size={56} />
        <h2
          className="gradient-text"
          style={{
            margin: "0.6rem 0 0.4rem",
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          Hi {username} ✨
        </h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.55 }}>
          No messages yet — be the first to say something to the household.
        </p>
      </div>
    </div>
  );
}

function NoAccess() {
  return (
    <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "2rem", textAlign: "center" }}>
      <div style={{ maxWidth: 320 }}>
        <Sigil size={56} />
        <h2 style={{ margin: "0.8rem 0 0.4rem", fontSize: 18, fontWeight: 600 }}>
          No group chat access
        </h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.55 }}>
          Ask the household admin to grant you the <code>group_chat</code> permission.
        </p>
      </div>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  sending,
  connected,
}: {
  value: string;
  onChange: (s: string) => void;
  onSend: () => void;
  sending: boolean;
  connected: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  return (
    <div
      style={{
        padding: "0.75rem 1rem",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-2)",
        display: "flex",
        gap: "0.55rem",
        alignItems: "flex-end",
      }}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={connected ? "Message the household…" : "Reconnecting — you can still type"}
        rows={1}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        style={{ flex: 1, resize: "none", maxHeight: 160, lineHeight: 1.5 }}
      />
      <Button
        variant="primary"
        onClick={onSend}
        loading={sending}
        disabled={!value.trim()}
      >
        Send
      </Button>
    </div>
  );
}

// ---- helpers ----------------------------------------------------------

interface DayGroup {
  dayKey: string;
  dayLabel: string;
  messages: GroupMessage[];
}

function groupByDay(messages: GroupMessage[]): DayGroup[] {
  const out: DayGroup[] = [];
  let cur: DayGroup | null = null;
  for (const m of messages) {
    const d = new Date(m.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!cur || cur.dayKey !== key) {
      cur = { dayKey: key, dayLabel: dayLabel(d), messages: [] };
      out.push(cur);
    }
    cur.messages.push(m);
  }
  return out;
}

function dayLabel(d: Date): string {
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const dayOfYear = (x: Date) =>
    Math.floor((x.getTime() - new Date(x.getFullYear(), 0, 0).getTime()) / 86400000);
  if (sameYear && dayOfYear(now) === dayOfYear(d)) return "Today";
  if (sameYear && dayOfYear(now) - dayOfYear(d) === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

function prettyError(code: string): string {
  switch (code) {
    case "no_permission_group_chat":
      return "You don't have group chat access.";
    case "empty_message":
      return "Message can't be empty.";
    case "message_too_long":
      return "Message is too long.";
    default:
      return code.replace(/_/g, " ");
  }
}
