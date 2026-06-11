/**
 * Settings screen.
 *
 * Two sections so far:
 *  - "Backend" — the URL the desktop talks to (also editable from the unauth
 *    config screen, but useful to expose here too for clarity).
 *  - "Gateway" — admin-only. URL + token + agent for the OpenClaw gateway.
 *
 * The admin Gateway form *loads* its current values on mount via GET, so the
 * input fields reflect actual server state, not a stale cache. The token
 * field shows the masked preview the backend returns (e.g. "1820af…efe8") and
 * we treat an empty submit as "leave token unchanged".
 *
 * Phases 5/6/7 will add more sections (Hue bridge, group chat name, user
 * management). The layout is built to slot them in without rewiring.
 */
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { Sigil } from "../components/Sigil";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { HuePairingWizard } from "./Hue";

type SaveState = "idle" | "saving" | "saved" | "error";

export function Settings() {
  const { user, config, setConfig } = useAuth();
  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "2rem 2.5rem 3rem",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{ maxWidth: 640, margin: "0 auto" }}
      >
        <Header />

        <BackendSection
          current={config?.backendUrl ?? ""}
          onSave={async (url) => {
            await setConfig({ backendUrl: url });
          }}
        />

        {user?.is_admin && <GatewaySection />}

        {user?.is_admin && <HueSection />}

        <AccountSection />
      </motion.div>
    </div>
  );
}

// -------------------------------------------------------------------------

function Header() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.85rem",
        marginBottom: "1.6rem",
      }}
    >
      <Sigil size={36} />
      <div>
        <h1
          className="gradient-text"
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          Settings
        </h1>
        <p
          style={{
            margin: "0.2rem 0 0",
            color: "var(--text-dim)",
            fontSize: 13,
          }}
        >
          App + backend configuration
        </p>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "1.4rem 1.5rem",
        marginBottom: "1.2rem",
      }}
    >
      <h2
        style={{
          margin: "0 0 0.3rem",
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </h2>
      {description && (
        <p
          style={{
            margin: "0 0 1.1rem",
            color: "var(--text-dim)",
            fontSize: 12.5,
            lineHeight: 1.55,
          }}
        >
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-dim)",
        marginBottom: "0.35rem",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
  );
}

function StatusPill({ state, msg }: { state: SaveState; msg?: string }) {
  if (state === "idle") return null;
  const map: Record<SaveState, { color: string; bg: string; text: string }> = {
    idle: { color: "", bg: "", text: "" },
    saving: { color: "var(--text-dim)", bg: "rgba(255,255,255,0.04)", text: "Saving…" },
    saved: { color: "var(--success)", bg: "rgba(109,212,160,0.10)", text: "Saved ✓" },
    error: { color: "var(--danger)", bg: "rgba(255,107,107,0.10)", text: msg ?? "Error" },
  };
  const s = map[state];
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        fontSize: 12,
        padding: "0.35rem 0.65rem",
        borderRadius: 999,
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.color}`,
      }}
    >
      {s.text}
    </motion.span>
  );
}

// -------------------------------------------------------------------------

function BackendSection({
  current,
  onSave,
}: {
  current: string;
  onSave: (url: string) => Promise<void>;
}) {
  const [url, setUrl] = useState(current);
  const [state, setState] = useState<SaveState>("idle");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setUrl(current), [current]);

  async function save() {
    setErr(null);
    setState("saving");
    try {
      await onSave(url.trim());
      setState("saved");
      setTimeout(() => setState("idle"), 1800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
      setState("error");
    }
  }

  const dirty = url.trim() !== current.trim();

  return (
    <Section
      title="Backend"
      description="Where this app reaches Astrix Home. Use the LAN IP of your hub for other devices."
    >
      <FieldLabel>Backend URL</FieldLabel>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="http://192.168.1.74:18800"
        spellCheck={false}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginTop: "0.85rem",
        }}
      >
        <Button onClick={() => void save()} disabled={!dirty} loading={state === "saving"}>
          Save
        </Button>
        <StatusPill state={state} msg={err ?? undefined} />
      </div>
    </Section>
  );
}

// -------------------------------------------------------------------------

function GatewaySection() {
  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState("");
  const [agent, setAgent] = useState("main");
  const [memberAgent, setMemberAgent] = useState("lite");
  const [tokenMasked, setTokenMasked] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await api.getGatewayConfig();
        setUrl(cfg.url);
        setAgent(cfg.agent || "main");
        setMemberAgent(cfg.memberAgent || "lite");
        setTokenMasked(cfg.token);
      } catch (e) {
        setErr(e instanceof ApiError ? e.code : "load_failed");
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  async function save() {
    setErr(null);
    setState("saving");
    try {
      const patch: { url: string; agent: string; memberAgent: string; token?: string } = {
        url: url.trim(),
        agent: agent.trim() || "main",
        memberAgent: memberAgent.trim() || "lite",
      };
      // Only send token when the admin typed a new one.
      if (tokenInput.trim()) patch.token = tokenInput.trim();
      const updated = await api.setGatewayConfig(patch);
      setUrl(updated.url);
      setAgent(updated.agent);
      setMemberAgent(updated.memberAgent || "lite");
      setTokenMasked(updated.token);
      setTokenInput("");
      setState("saved");
      setTimeout(() => setState("idle"), 1800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save_failed");
      setState("error");
    }
  }

  return (
    <Section
      title="OpenClaw Gateway"
      description="The Astrix LLM gateway every household chat goes through. Admin only."
    >
      {!loaded ? (
        <p style={{ color: "var(--text-faint)", fontSize: 13 }}>Loading…</p>
      ) : (
        <>
          <FieldLabel>Gateway URL</FieldLabel>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://127.0.0.1:18789"
            spellCheck={false}
          />

          <div style={{ height: "0.85rem" }} />
          <FieldLabel>Admin agent</FieldLabel>
          <input
            type="text"
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            placeholder="main"
            spellCheck={false}
          />
          <p
            style={{
              margin: "0.35rem 0 0",
              fontSize: 11,
              color: "var(--text-faint)",
            }}
          >
            Agent used for admin accounts. Sent as <code>model: openclaw/&lt;agent&gt;</code>.
          </p>

          <div style={{ height: "0.85rem" }} />
          <FieldLabel>Member agent</FieldLabel>
          <input
            type="text"
            value={memberAgent}
            onChange={(e) => setMemberAgent(e.target.value)}
            placeholder="lite"
            spellCheck={false}
          />
          <p
            style={{
              margin: "0.35rem 0 0",
              fontSize: 11,
              color: "var(--text-faint)",
            }}
          >
            Agent used for non-admin household members. Defaults to <code>lite</code> (gpt-4o-mini).
          </p>

          <div style={{ height: "0.85rem" }} />
          <FieldLabel>Bearer Token</FieldLabel>
          {tokenMasked && (
            <p
              style={{
                margin: "0 0 0.4rem",
                fontSize: 12,
                color: "var(--text-dim)",
              }}
            >
              Current: <code style={{ color: "var(--text)" }}>{tokenMasked}</code>
              {"  "}— leave the field empty to keep it.
            </p>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type={showToken ? "text" : "password"}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={tokenMasked ? "Enter a new token to replace…" : "Paste gateway token"}
              spellCheck={false}
              autoComplete="off"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              style={{
                padding: "0 0.7rem",
                fontSize: 12,
                color: "var(--text-dim)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {showToken ? "Hide" : "Show"}
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginTop: "1rem",
            }}
          >
            <Button onClick={() => void save()} loading={state === "saving"}>
              Save gateway
            </Button>
            <StatusPill state={state} msg={err ?? undefined} />
          </div>
        </>
      )}
    </Section>
  );
}

// -------------------------------------------------------------------------

function HueSection() {
  const [showWizard, setShowWizard] = useState(false);

  if (showWizard) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          marginBottom: "1.2rem",
          overflow: "hidden",
        }}
      >
        <HuePairingWizard onDone={() => setShowWizard(false)} />
      </motion.div>
    );
  }

  return (
    <Section
      title="Philips Hue"
      description="Manage the connection to your Hue bridge. Use 'Re-pair bridge' if lights stopped working or you replaced the bridge."
    >
      <Button onClick={() => setShowWizard(true)}>Re-pair bridge</Button>
    </Section>
  );
}

// -------------------------------------------------------------------------

function AccountSection() {
  const { user, signOut } = useAuth();
  return (
    <Section title="Account" description="Signed in as the user below.">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.85rem",
          padding: "0.4rem 0",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--violet), var(--cyan))",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            color: "#0b0d12",
          }}
        >
          {user?.username.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{user?.username}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {user?.is_admin ? "Admin" : "Member"}
          </div>
        </div>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </Section>
  );
}
