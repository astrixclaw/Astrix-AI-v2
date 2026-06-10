/**
 * App shell: the main UI users see once signed in.
 *
 * This is a Phase 3 placeholder. Subsequent phases fill in the sidebar, the
 * chat area, the Hue controls, the group chat panel, and the admin pane.
 *
 * We deliberately keep the layout primitives here (sidebar + main pane) so
 * future screens slot in without rewiring the shell.
 */
import { motion } from "framer-motion";
import { Sigil } from "../components/Sigil";
import { Button } from "../components/Button";
import { useAuth } from "../lib/auth";

export function AppShell() {
  const { user, signOut } = useAuth();

  return (
    <motion.div
      className="app-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: 240,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-2)",
          display: "flex",
          flexDirection: "column",
          padding: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.7rem",
            padding: "0.4rem 0.2rem 1rem",
            borderBottom: "1px solid var(--border)",
            marginBottom: "1rem",
          }}
        >
          <Sigil size={28} />
          <span
            className="gradient-text"
            style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}
          >
            Astrix Home
          </span>
        </div>

        <NavItem label="Chat with Astrix" />
        <NavItem label="Group Chat" />
        <NavItem label="Lighting" />
        {user?.is_admin ? <NavItem label="Admin" /> : null}
        <NavItem label="Settings" />

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.5rem",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, var(--violet), var(--cyan))",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 13,
              color: "#0b0d12",
            }}
          >
            {user?.username.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 13,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {user?.username}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {user?.is_admin ? "Admin" : "Member"}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={() => void signOut()}
          style={{ marginTop: "0.6rem", width: "100%" }}
        >
          Sign out
        </Button>
      </aside>

      {/* Main pane */}
      <main
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: "2rem",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{
            textAlign: "center",
            maxWidth: 480,
          }}
        >
          <Sigil size={80} />
          <h1
            className="gradient-text"
            style={{
              fontSize: 32,
              fontWeight: 700,
              margin: "1rem 0 0.5rem",
              letterSpacing: "-0.02em",
            }}
          >
            Hi {user?.username} ✨
          </h1>
          <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.55 }}>
            The chat, lighting, and group chat panels will land in the next
            phases. For now, sign-in and the design language are wired up.
          </p>
        </motion.div>
      </main>
    </motion.div>
  );
}

function NavItem({ label }: { label: string }) {
  return (
    <motion.button
      whileHover={{ x: 2 }}
      style={{
        textAlign: "left",
        padding: "0.55rem 0.75rem",
        borderRadius: "var(--radius-md)",
        color: "var(--text-dim)",
        marginBottom: "0.15rem",
        fontSize: 13,
        fontWeight: 500,
      }}
      onClick={() => {
        /* Phase 4+ routes go here */
      }}
    >
      {label}
    </motion.button>
  );
}
