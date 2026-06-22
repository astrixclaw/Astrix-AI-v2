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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "../components/Button";
import { Sigil } from "../components/Sigil";
import { useAuth } from "../lib/auth";
import { api, streamChatMessage } from "../lib/api";
import { hasPermission } from "../lib/perms";
import type {
  AttachmentSummary,
  ChatMessage,
  ConversationSummary,
} from "@shared/types";

const MAX_ATTACHMENTS = 4;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ACCEPTED = "image/png,image/jpeg,image/webp,.txt,.md,.json,.log";

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

  // Staged files queued for the next send (one row per uploaded file).
  const [staged, setStaged] = useState<AttachmentSummary[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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

  // ---- attachment helpers ----------------------------------------------
  const ensureConv = useCallback(async (): Promise<string> => {
    if (currentId) return currentId;
    const { id } = await api.newConversation();
    setCurrentId(id);
    setMessages([]);
    void refreshConvList();
    return id;
  }, [currentId, refreshConvList]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      if (staged.length + list.length > MAX_ATTACHMENTS) {
        setError(`Up to ${MAX_ATTACHMENTS} files per message.`);
        return;
      }
      const oversized = list.find((f) => f.size > MAX_FILE_BYTES);
      if (oversized) {
        setError(`"${oversized.name}" is over the 8 MB limit.`);
        return;
      }
      setError(null);
      setUploading(true);
      try {
        const convId = await ensureConv();
        for (const file of list) {
          try {
            const att = await api.uploadAttachment(convId, file);
            setStaged((prev) => [...prev, att]);
          } catch (e) {
            setError(prettyError(
              e instanceof Error ? e.message.replace(/^api_/, "") : "upload_failed",
            ));
            break;
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [staged, ensureConv],
  );

  const removeStaged = useCallback((id: string) => {
    setStaged((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const deleteMessage = useCallback(
    async (msgId: string) => {
      if (!currentId) return;
      if (!window.confirm("Delete this message?")) return;
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      try {
        await api.deleteChatMessage(currentId, msgId);
        void refreshConvList();
      } catch (e) {
        setError(e instanceof Error ? e.message : "delete_failed");
      }
    },
    [currentId, refreshConvList],
  );

  // ---- send ------------------------------------------------------------
  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && staged.length === 0) || sending) return;
    const convId = currentId ?? (await ensureConv());

    setError(null);
    setSending(true);
    setInput("");
    const attachmentsForTurn = staged;
    setStaged([]);

    // Optimistic user bubble. Real id arrives via "user_saved".
    const tempUserId = `temp-user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempUserId,
        conv_id: convId,
        role: "user",
        body: text,
        created_at: Date.now(),
        attachments: attachmentsForTurn,
      },
    ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreaming("");

    try {
      const ids = attachmentsForTurn.map((a) => a.id);
      for await (const event of streamChatMessage(convId, text, ids, ctrl.signal)) {
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
  }, [currentId, input, sending, staged, ensureConv, refreshConvList]);

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
          position: "relative",
        }}
        onDragEnter={(e) => {
          if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) {
            e.preventDefault();
          }
        }}
        onDragLeave={(e) => {
          // Only clear if leaving the pane entirely
          if (
            e.currentTarget instanceof HTMLElement &&
            !e.currentTarget.contains(e.relatedTarget as Node)
          ) {
            setDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer?.files?.length) {
            void handleFiles(e.dataTransfer.files);
          }
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
            <MessageList
              messages={messages}
              streaming={streaming}
              meId={user?.id ?? ""}
              onDelete={(id) => void deleteMessage(id)}
            />
          )}
          {dragOver && <DragOverlay />}
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
          staged={staged}
          uploading={uploading}
          onFiles={(fs) => void handleFiles(fs)}
          onRemoveStaged={removeStaged}
          isAdmin={!!user?.is_admin}
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
  meId,
  onDelete,
}: {
  messages: ChatMessage[];
  streaming: string | null;
  meId: string;
  onDelete: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <AnimatePresence initial={false}>
        {messages.map((m) => (
          <Bubble
            key={m.id}
            role={m.role}
            body={m.body}
            attachments={m.attachments}
            onDelete={
              m.role === "user" && m.id && !m.id.startsWith("temp-")
                ? () => onDelete(m.id)
                : undefined
            }
          />
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
  attachments,
  streaming,
  onDelete,
}: {
  role: "user" | "assistant";
  body: string;
  attachments?: AttachmentSummary[];
  streaming?: boolean;
  onDelete?: () => void;
}) {
  const isUser = role === "user";
  const showTyping = !body && streaming;
  const [hover, setHover] = useState(false);
  const hasText = !!body && body.length > 0;
  const hasAtt = !!attachments && attachments.length > 0;
  const imageOnly = !hasText && hasAtt &&
    attachments!.every((a) => a.kind === "image");
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "75%",
        padding: imageOnly ? 0 : "0.7rem 1rem",
        borderRadius: "var(--radius-lg)",
        background: imageOnly
          ? "transparent"
          : isUser
            ? "linear-gradient(135deg, rgba(122,167,255,0.22), rgba(164,139,255,0.18))"
            : "var(--bg-2)",
        border: imageOnly ? "none" : "1px solid var(--border)",
        color: "var(--text)",
        fontSize: 14,
        lineHeight: 1.55,
        wordWrap: "break-word",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {hasAtt && (
        <AttachmentGrid attachments={attachments!} compact={imageOnly} />
      )}
      {hover && onDelete && (
        <button
          onClick={onDelete}
          title="Delete message"
          style={{
            position: "absolute",
            top: -10,
            left: -10,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            color: "var(--text-dim)",
            fontSize: 11,
            lineHeight: 1,
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
            zIndex: 2,
          }}
        >
          ✕
        </button>
      )}
      {showTyping ? (
        <TypingDots />
      ) : (
        <div className="md" style={{ whiteSpace: "pre-wrap" }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer noopener">
                  {children}
                </a>
              ),
              code: ({ children, className }) => {
                const isBlock = className?.startsWith("language-");
                return isBlock ? (
                  <pre style={codeBlockStyle}>
                    <code>{children}</code>
                  </pre>
                ) : (
                  <code style={inlineCodeStyle}>{children}</code>
                );
              },
            }}
          >
            {body}
          </ReactMarkdown>
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
        </div>
      )}
    </motion.div>
  );
}

const codeBlockStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.35)",
  borderRadius: 6,
  padding: "0.55rem 0.75rem",
  overflowX: "auto",
  fontSize: 12.5,
  lineHeight: 1.45,
  margin: "0.4rem 0",
};
const inlineCodeStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.3)",
  padding: "0.05rem 0.35rem",
  borderRadius: 4,
  fontSize: 12.5,
};

function AttachmentGrid({
  attachments,
  compact = false,
}: {
  attachments: AttachmentSummary[];
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: compact ? 0 : 6,
      }}
    >
      {attachments.map((a) =>
        a.kind === "image" ? (
          <img
            key={a.id}
            src={api.attachmentUrl(a.id)}
            alt={a.original_name}
            onClick={() => window.open(api.attachmentUrl(a.id), "_blank")}
            style={{
              maxWidth: compact ? 360 : 220,
              maxHeight: compact ? 360 : 220,
              borderRadius: compact ? 12 : 8,
              border: compact ? "none" : "1px solid var(--border)",
              display: "block",
              cursor: "zoom-in",
            }}
          />
        ) : (
          <div
            key={a.id}
            style={{
              padding: "0.4rem 0.6rem",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "rgba(0,0,0,0.25)",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
              maxWidth: 220,
            }}
          >
            <span aria-hidden>📄</span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={a.original_name}
            >
              {a.original_name}
            </span>
            <span style={{ color: "var(--text-faint)", fontSize: 11 }}>
              {humanSize(a.size)}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DragOverlay() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(122,167,255,0.10)",
        border: "2px dashed rgba(122,167,255,0.5)",
        borderRadius: 12,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      <div
        style={{
          padding: "0.6rem 1rem",
          borderRadius: 8,
          background: "rgba(0,0,0,0.5)",
          fontSize: 13,
          color: "var(--text)",
        }}
      >
        Drop to attach (max {MAX_ATTACHMENTS}, 8 MB each)
      </div>
    </div>
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
  staged,
  uploading,
  onFiles,
  onRemoveStaged,
  isAdmin,
}: {
  value: string;
  onChange: (s: string) => void;
  onSend: () => void;
  onCancel: () => void;
  sending: boolean;
  streaming: boolean;
  staged: AttachmentSummary[];
  uploading: boolean;
  onFiles: (files: FileList | File[]) => void;
  onRemoveStaged: (id: string) => void;
  isAdmin?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Admin-only model switcher state
  const [models, setModels] = useState<{ id: string; name?: string }[]>([]);
  const [modelsErr, setModelsErr] = useState(false);
  const [currentModel, setCurrentModel] = useState("");

  const loadModels = useCallback(() => {
    if (!isAdmin) return;
    setModelsErr(false);
    void Promise.all([
      api.getGatewayModels(),
      api.getGatewayConfig(),
    ]).then(([mRes, cfg]) => {
      setModels(mRes.data ?? []);
      setCurrentModel(cfg.modelOverride ?? "");
    }).catch(() => { setModelsErr(true); });
  }, [isAdmin]);

  useEffect(() => { loadModels(); }, [loadModels]);

  async function handleModelChange(id: string) {
    setCurrentModel(id);
    try {
      await api.setGatewayConfig({ modelOverride: id });
    } catch { /* best-effort */ }
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files: File[] = [];
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        onFiles(files);
      }
    },
    [onFiles],
  );

  const canSend = (value.trim().length > 0 || staged.length > 0) && !uploading;
  const stagedFull = staged.length >= MAX_ATTACHMENTS;

  return (
    <div
      style={{
        padding: "0.6rem 1rem 0.85rem",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-2)",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      {staged.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {staged.map((a) => (
            <StagedTile key={a.id} att={a} onRemove={() => onRemoveStaged(a.id)} />
          ))}
          {uploading && (
            <div style={{ fontSize: 12, color: "var(--text-faint)", alignSelf: "center" }}>
              uploading…
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-end" }}>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={stagedFull || uploading}
          title={stagedFull ? "Up to 4 files per message" : "Attach files"}
          style={{
            padding: "0.55rem 0.6rem",
            borderRadius: 8,
            background: "transparent",
            border: "1px solid var(--border)",
            color: stagedFull ? "var(--text-faint)" : "var(--text-dim)",
            cursor: stagedFull || uploading ? "not-allowed" : "pointer",
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          📎
        </button>
        {isAdmin && (
          modelsErr ? (
            <button
              type="button"
              onClick={loadModels}
              title="Failed to load models — click to retry"
              style={{
                padding: "0.45rem 0.5rem",
                borderRadius: 8,
                background: "transparent",
                border: "1px solid var(--danger, #ff6b6b)",
                color: "var(--danger, #ff6b6b)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              ⚠ models
            </button>
          ) : (
            <select
              value={currentModel}
              onChange={(e) => void handleModelChange(e.target.value)}
              title="Switch model (admin)"
              style={{
                padding: "0.45rem 0.5rem",
                borderRadius: 8,
                background: "var(--bg-3, var(--bg-2))",
                border: "1px solid var(--border)",
                color: "var(--text-dim)",
                fontSize: 12,
                cursor: "pointer",
                maxWidth: 170,
              }}
            >
              <option value="">{models.length === 0 ? "Loading…" : "Default model"}</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
            </select>
          )
        )}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          placeholder="Message Astrix… (Enter to send, Shift+Enter for newline)"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
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
            disabled={!canSend}
          >
            Send
          </Button>
        )}
      </div>
    </div>
  );
}

function StagedTile({
  att,
  onRemove,
}: {
  att: AttachmentSummary;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: att.kind === "image" ? 2 : "0.4rem 0.55rem",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "rgba(0,0,0,0.2)",
        maxWidth: 200,
      }}
    >
      {att.kind === "image" ? (
        <img
          src={api.attachmentUrl(att.id)}
          alt={att.original_name}
          style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }}
        />
      ) : (
        <span aria-hidden>📄</span>
      )}
      <div style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden" }}>
        <div
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 130,
          }}
          title={att.original_name}
        >
          {att.original_name}
        </div>
        <div style={{ color: "var(--text-faint)", fontSize: 10 }}>
          {humanSize(att.size)}
        </div>
      </div>
      <button
        onClick={onRemove}
        title="Remove"
        style={{
          position: "absolute",
          top: -6,
          right: -6,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          fontSize: 10,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
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
    case "unsupported_type":
      return "That file type isn't supported. Try PNG/JPEG/WebP, or .txt/.md/.json/.log.";
    case "file_too_large":
      return "File is too big (8 MB max).";
    case "too_many_staged_files":
      return "Up to 4 files per message.";
    case "bad_image":
      return "That image couldn't be processed.";
    case "bad_attachments":
      return "Attachment is no longer valid — please re-upload.";
    default:
      return code.replace(/_/g, " ");
  }
}
