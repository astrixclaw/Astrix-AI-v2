/**
 * App shell.
 *
 * Owns the persistent sidebar (nav + user chip) and renders the active view
 * in the main pane. Adds/removes tabs based on the signed-in user's
 * permissions so members never see entries they can't open.
 */
import { motion, AnimatePresence } from "framer-motion";
import { Sigil } from "../components/Sigil";
import { Button } from "../components/Button";
import { useAuth } from "../lib/auth";
import { hasPermission } from "../lib/perms";
import { useView, type ViewName } from "../lib/view";
import { Admin } from "./Admin";
import { Chat } from "./Chat";
import { GroupChat } from "./GroupChat";
import { Lighting } from "./Lighting";
import { Placeholder } from "./Placeholder";
import { Settings } from "./Settings";

export function AppShell() {
  const { user, permissions, signOut } = useAuth();
  const { view, setView } = useView();

  const showChat = hasPermission(user, permissions, "chat");
  const showLighting = hasPermission(user, permissions, "lighting");
  const showGroup = hasPermission(user, permissions, "group_chat");
  const showAdmin = !!user?.is_admin;

  return (
    <motion.div
      className="app-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <aside
        style={{
          width: 220,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-1)",
          display: "flex",
          flexDirection: "column",
          padding: "0.85rem 0.75rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.4rem 0.3rem 1rem",
            borderBottom: "1px solid var(--border)",
            marginBottom: "0.85rem",
          }}
        >
          <Sigil size={26} />
          <span
            className="gradient-text"
            style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}
          >
            Astrix Home
          </span>
        </div>

        {showChat && (
          <NavItem
            label="Chat with Astrix"
            active={view === "chat"}
            onClick={() => setView("chat")}
          />
        )}
        {showGroup && (
          <NavItem
            label="Group Chat"
            active={view === "group"}
            onClick={() => setView("group")}
          />
        )}
        {showLighting && (
          <NavItem
            label="Lighting"
            active={view === "lighting"}
            onClick={() => setView("lighting")}
          />
        )}
        {showAdmin && (
          <NavItem
            label="Admin"
            active={view === "admin"}
            onClick={() => setView("admin")}
          />
        )}
        <NavItem
          label="Settings"
          active={view === "settings"}
          onClick={() => setView("settings")}
        />

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
          style={{ marginTop: "0.5rem", width: "100%", padding: "0.45rem" }}
        >
          Sign out
        </Button>
      </aside>

      {/* main pane */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-1)",
          minWidth: 0,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <Pane view={view} />
          </motion.div>
        </AnimatePresence>
      </main>
    </motion.div>
  );
}

function Pane({ view }: { view: ViewName }) {
  switch (view) {
    case "chat":
      return <Chat />;
    case "lighting":
      return <Lighting />;
    case "group":
      return <GroupChat />;
    case "admin":
      return <Admin />;
    case "settings":
      return <Settings />;
  }
}

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ x: 2 }}
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "0.55rem 0.75rem",
        borderRadius: "var(--radius-md)",
        color: active ? "var(--text)" : "var(--text-dim)",
        background: active ? "var(--bg-3)" : "transparent",
        marginBottom: "0.15rem",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        transition: "background 140ms var(--ease-out)",
      }}
    >
      {label}
    </motion.button>
  );
}
