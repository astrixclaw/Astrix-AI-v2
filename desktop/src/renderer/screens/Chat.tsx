/**
 * Chat with Astrix.
 *
 * Layout:
 *   [ Conversations rail | Message stream + composer ]
 *
 * State model:
 *   - convList: ConversationSummary[]    (sidebar)
 *   - currentConvId: string | null
 *   - messages: ChatMessage[]            (the open conv)
 *   - streaming: { assistantId: string; text: string } | null
 *     A synthetic in-flight assistant message; when the server's "done" event
 *     arrives, we replace it with the real saved row.
 *
 * The streaming pattern: we *render* an extra placeholder message at the end
 * of the list while text is arriving, then drop it once the saved message
 * lands. This keeps `messages` honest as the source of truth.
 */
import { motion, AnimatePresence } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "../components/Button";
import { Sigil } from "../components/Sigil";
import { useAuth } from "../lib/auth";
import { api, streamChatMessage } from "../lib/api";
import { hasPermission } from "../lib/perms";
import type { ChatMessage, ConversationSummary } from "@shared/types";

export function Chat() {
  const { user, permissions } = useAuth();
  const canChat = hasPermission(user, permissions, "chat");

  const [convs, setConvs] = useState<ConversationSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ---- load conversation list on mount ---------------------------------
  const refreshConvList = useCallback(async () => {
    try {
      const res = await api.listConversations();
      setConvs(res.conversations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "list_failed");
    }
  }, []);

  useEffect(() => {
    if (!canChat) return;
    void refreshConvList();
  }, [canChat, refreshConvList]);

  // ---- create a fresh conv when the user opens chat with none --------
  useEffect(() => {
    if (!canChat) return;
    if (currentId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { id } = await api.newConversation();
        if (!cancelled) {
          setCurrentId(id);
          setMessages([]);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "new_conv_failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canChat, currentId]);

  // ---- when current conv changes, load its messages -------------------
  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    setLoadingConv(true);
    void (async () => {
      try {
        const res = await api.loadConversation(currentId);
        if (!cancelled) setMessages(res.messages);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "load_failed");
      } finally {
        if (!cancelled) setLoadingConv(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  // ---- send ------------------------------------------------------------
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !currentId || sending) return;

    setError(null);
    setSending(true);
    setInput("");

    // Optimistic user bubble. Real id arrives via "user_saved".
    const tempUserId = `temp-user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempUserId,
        conv_id: currentId,
        role: "user",
        body: text,
        created_at: Date.now(),
      },
    ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreaming("");

    try {
      for await (const event of streamChatMessage(currentId, text, ctrl.signal)) {
        if (event.type === "user_saved") {
          // Swap the temp user message with the persisted one.
          setMessages((prev) =>
            prev.map((m) => (m.id === tempUserId ? event.message : m)),
          );
        } else if (event.type === "delta") {
          setStreaming((prev) => (prev ?? "") + event.text);
        } else if (event.type === "done") {
          setMessages((prev) => [...prev, event.message]);
          setStreaming(null);
          void refreshConvList();
          break;
        } else if (event.type === "error") {
          setError(prettyError(event.error));
          setStreaming(null);
          break;
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "send_failed");
      }
      setStreaming(null);
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [currentId, input, sending, refreshConvList]);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(null);
    setSending(false);
  }, []);

  // ---- conversation actions -------------------------------------------
  const newConv = useCallback(async () => {
    try {
      const { id } = await api.newConversation();
      setCurrentId(id);
      setMessages([]);
      setInput("");
      void refreshConvList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "new_conv_failed");
    }
  }, [refreshConvList]);

  const deleteConv = useCallback(
    async (id: string) => {
      try {
        await api.deleteConversation(id);
        if (id === currentId) {
          setCurrentId(null);
          setMessages([]);
        }
        void refreshConvList();
      } catch (e) {
        setError(e instanceof Error ? e.message : "delete_failed");
      }
    },
    [currentId, refreshConvList],
  );

  // ---- auto-scroll on new content ---------------------------------------
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  if (!canChat) {
    return <NoChatAccess />;
  }

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* conversation rail */}
      <div
        style={{
          width: 240,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-2)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "0.75rem 0.75rem 0.5rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Button
            variant="primary"
            onClick={() => void newConv()}
            style={{ width: "100%", padding: "0.55rem 0.8rem", fontSize: 13 }}
          >
            + New chat
          </Button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
          <ConversationList
            convs={convs}
            currentId={currentId}
            onSelect={setCurrentId}
            onDelete={(id) => void deleteConv(id)}
          />
        </div>
      </div>

      {/* main pane */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.5rem 2rem",
            minHeight: 0,
          }}
        >
          {messages.length === 0 && streaming === null && !loadingConv ? (
            <EmptyState username={user?.username ?? "friend"} />
          ) : (
            <MessageList messages={messages} streaming={streaming} />
          )}
        </div>

        {error && (
          <div
            style={{
              padding: "0.5rem 1rem",
              borderTop: "1px solid var(--border)",
              color: "var(--danger)",
              fontSize: 12,
              background: "rgba(255,107,107,0.06)",
            }}
          >
            {error}
          </div>
        )}

        <Composer
          value={input}
          onChange={setInput}
          onSend={() => void send()}
          onCancel={cancelStream}
          sending={sending}
          streaming={streaming !== null}
        />
      </div>
    </div>
  );
}

// ---- subcomponents ----------------------------------------------------

function ConversationList({
  convs,
  currentId,
  onSelect,
  onDelete,
}: {
  convs: ConversationSummary[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (convs.length === 0) {
    return (
      <p style={{ color: "var(--text-faint)", fontSize: 12, padding: "0.5rem" }}>
        No saved chats yet.
      </p>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
      {convs.map((c) => (
        <ConversationRow
          key={c.id}
          conv={c}
          active={c.id === currentId}
          onClick={() => onSelect(c.id)}
          onDelete={() => onDelete(c.id)}
        />
      ))}
    </div>
  );
}

function ConversationRow({
  conv,
  active,
  onClick,
  onDelete,
}: {
  conv: ConversationSummary;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        borderRadius: "var(--radius-md)",
        background: active ? "var(--bg-3)" : "transparent",
        transition: "background 140ms var(--ease-out)",
      }}
    >
      <motion.button
        whileHover={{ x: 2 }}
        onClick={onClick}
        title={conv.title}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "0.55rem 0.7rem",
          paddingRight: hover ? "2rem" : "0.7rem",
          fontSize: 13,
          fontWeight: active ? 600 : 500,
          color: active ? "var(--text)" : "var(--text-dim)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "block",
        }}
      >
        {conv.title}
      </motion.button>
      {hover && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm("Delete this conversation?")) onDelete();
          }}
          title="Delete"
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-faint)",
            fontSize: 12,
            padding: "2px 6px",
            borderRadius: 6,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function MessageList({
  messages,
  streaming,
}: {
  messages: ChatMessage[];
  streaming: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <AnimatePresence initial={false}>
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} body={m.body} />
        ))}
      </AnimatePresence>
      {streaming !== null && (
        <Bubble role="assistant" body={streaming} streaming />
      )}
    </div>
  );
}

function Bubble({
  role,
  body,
  streaming,
}: {
  role: "user" | "assistant";
  body: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "75%",
        padding: "0.7rem 1rem",
        borderRadius: "var(--radius-lg)",
        background: isUser
          ? "linear-gradient(135deg, rgba(122,167,255,0.22), rgba(164,139,255,0.18))"
          : "var(--bg-2)",
        border: "1px solid var(--border)",
        color: "var(--text)",
        fontSize: 14,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordWrap: "break-word",
      }}
    >
      {body || (streaming ? <TypingDots /> : "")}
      {streaming && body && (
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 14,
            marginLeft: 2,
            verticalAlign: "-2px",
            background: "var(--accent)",
            animation: "blink 1s steps(1) infinite",
          }}
        />
      )}
    </motion.div>
  );
}

function TypingDots() {
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
    <div
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <Sigil size={64} />
        <h2
          className="gradient-text"
          style={{
            margin: "0.8rem 0 0.4rem",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          Hi {username}
        </h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.55 }}>
          Ask me anything — about your home, your day, or the lights.
        </p>
      </div>
    </div>
  );
}

function NoChatAccess() {
  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <Sigil size={56} />
        <h2 style={{ margin: "0.8rem 0 0.4rem", fontSize: 18, fontWeight: 600 }}>
          No chat access yet
        </h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.55 }}>
          Ask the household admin to grant you the <code>chat</code> permission
          and your AI assistant will appear here.
        </p>
      </div>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  onCancel,
  sending,
  streaming,
}: {
  value: string;
  onChange: (s: string) => void;
  onSend: () => void;
  onCancel: () => void;
  sending: boolean;
  streaming: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  // Auto-grow up to ~6 lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  return (
    <div
      style={{
        padding: "0.85rem 1rem",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-2)",
        display: "flex",
        gap: "0.6rem",
        alignItems: "flex-end",
      }}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Message Astrix… (Enter to send, Shift+Enter for newline)"
        rows={1}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        style={{
          flex: 1,
          resize: "none",
          maxHeight: 160,
          lineHeight: 1.5,
        }}
      />
      {streaming ? (
        <Button variant="ghost" onClick={onCancel}>
          Stop
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={onSend}
          loading={sending}
          disabled={!value.trim()}
        >
          Send
        </Button>
      )}
    </div>
  );
}

function prettyError(code: string): string {
  switch (code) {
    case "gateway_not_configured":
      return "The household admin hasn't set up the Astrix gateway yet.";
    case "no_permission_chat":
      return "You don't have permission to chat.";
    case "empty_message":
      return "Message can't be empty.";
    default:
      return code.replace(/_/g, " ");
  }
}
