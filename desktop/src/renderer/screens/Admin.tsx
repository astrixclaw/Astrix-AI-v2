/**
 * Admin screen — household member management + permissions.
 *
 * Layout:
 *   [ Header (+ Add member button) ]
 *   [ Table of users ]
 *
 * Selecting a row slides in a drawer with edit controls (PIN, admin toggle,
 * delete, and per-feature permission editors). The drawer covers ~40% of the
 * pane and feels modal but doesn't block the table.
 *
 * Member permissions:
 *   - chat        — single toggle
 *   - group_chat  — single toggle
 *   - lighting    — checkbox grid of rooms (live from /api/lighting/rooms)
 *
 * Admins always show as having everything — backend ignores permissions for
 * admin users and we mirror that here with greyed-out controls.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar as UserAvatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { Sigil } from "../components/Sigil";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import type { AdminUserView, HueRoom } from "@shared/types";

export function Admin() {
  const { user } = useAuth();
  if (!user?.is_admin) return <NotAllowed />;

  const [users, setUsers] = useState<AdminUserView[] | null>(null);
  const [rooms, setRooms] = useState<HueRoom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([
        api.listAdminUsers(),
        api.listRooms().catch(() => ({ rooms: [] as HueRoom[] })),
      ]);
      setUsers(u.users);
      setRooms(r.rooms);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = useMemo(
    () => users?.find((u) => u.id === selectedId) ?? null,
    [users, selectedId],
  );

  return (
    <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "1.6rem 2rem 1rem" }}>
        <Header onAdd={() => setAdding(true)} />
        {error && (
          <div
            style={{
              marginTop: "0.6rem",
              color: "var(--danger)",
              fontSize: 12,
              padding: "0.4rem 0.7rem",
              background: "rgba(255,107,107,0.08)",
              border: "1px solid rgba(255,107,107,0.25)",
              borderRadius: "var(--radius-md)",
            }}
          >
            {error}
          </div>
        )}
      </div>

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <div style={{ height: "100%", overflowY: "auto", padding: "0 2rem 2rem" }}>
          {users == null ? (
            <CentredHint>Loading…</CentredHint>
          ) : (
            <UsersTable
              users={users}
              selectedId={selectedId}
              currentUserId={user.id}
              onSelect={setSelectedId}
            />
          )}
        </div>

        <AnimatePresence>
          {selected && (
            <UserDrawer
              key={selected.id}
              user={selected}
              rooms={rooms}
              isSelf={selected.id === user.id}
              onClose={() => setSelectedId(null)}
              onChanged={async () => {
                await refresh();
              }}
            />
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {adding && (
          <AddUserModal
            rooms={rooms}
            onClose={() => setAdding(false)}
            onCreated={async () => {
              setAdding(false);
              await refresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ----------------------------------------------------------------------

function Header({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
      <Sigil size={32} />
      <div style={{ flex: 1 }}>
        <h1
          className="gradient-text"
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          Household
        </h1>
        <p style={{ margin: "0.2rem 0 0", color: "var(--text-dim)", fontSize: 12 }}>
          Manage members and permissions
        </p>
      </div>
      <Button onClick={onAdd}>+ Add member</Button>
    </div>
  );
}

function CentredHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        height: "100%",
        color: "var(--text-dim)",
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------

function UsersTable({
  users,
  selectedId,
  currentUserId,
  onSelect,
}: {
  users: AdminUserView[];
  selectedId: string | null;
  currentUserId: string;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(180px, 1.4fr) 100px 1fr",
          padding: "0.7rem 1rem",
          fontSize: 11,
          color: "var(--text-dim)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontWeight: 600,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>Member</div>
        <div>Role</div>
        <div>Permissions</div>
      </div>
      {users.map((u) => (
        <UserRow
          key={u.id}
          user={u}
          isSelf={u.id === currentUserId}
          selected={u.id === selectedId}
          onClick={() => onSelect(selectedId === u.id ? null : u.id)}
        />
      ))}
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  selected,
  onClick,
}: {
  user: AdminUserView;
  isSelf: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const perms = useMemo(() => {
    if (user.is_admin) return ["all features"];
    const out: string[] = [];
    if (user.permissions.some((p) => p.feature === "chat")) out.push("chat");
    if (user.permissions.some((p) => p.feature === "group_chat"))
      out.push("group_chat");
    const lighting = user.permissions.filter((p) => p.feature === "lighting");
    if (lighting.length === 0) {
      /* nothing */
    } else if (lighting.some((p) => p.resource_id === null)) {
      out.push("lighting (all rooms)");
    } else {
      out.push(`lighting (${lighting.length} room${lighting.length === 1 ? "" : "s"})`);
    }
    return out.length ? out : ["none"];
  }, [user]);

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }}
      animate={{
        backgroundColor: selected ? "rgba(122,167,255,0.10)" : "transparent",
      }}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 1.4fr) 100px 1fr",
        padding: "0.85rem 1rem",
        width: "100%",
        textAlign: "left",
        borderBottom: "1px solid var(--border)",
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
        <UserAvatar userId={user.id} username={user.username} size={30} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{user.username}</div>
          {isSelf && (
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>you</div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: user.is_admin ? "var(--accent)" : "var(--text-dim)" }}>
        {user.is_admin ? "Admin" : "Member"}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
        {perms.join(" · ")}
      </div>
    </motion.button>
  );
}

// ----------------------------------------------------------------------

function UserDrawer({
  user,
  rooms,
  isSelf,
  onClose,
  onChanged,
}: {
  user: AdminUserView;
  rooms: HueRoom[];
  isSelf: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChat = user.permissions.some((p) => p.feature === "chat");
  const hasGroup = user.permissions.some((p) => p.feature === "group_chat");
  const lightingGrants = useMemo(
    () => user.permissions.filter((p) => p.feature === "lighting"),
    [user.permissions],
  );
  const grantedRoomIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of lightingGrants) if (p.resource_id) ids.add(p.resource_id);
    return ids;
  }, [lightingGrants]);

  async function withBusy<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : e instanceof Error ? e.message : "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function savePin() {
    if (!pin.trim()) return;
    const ok = await withBusy(() => api.patchAdminUser(user.id, { pin: pin.trim() }));
    if (ok) {
      setPin("");
      await onChanged();
    }
  }

  async function toggleAdmin() {
    await withBusy(() => api.patchAdminUser(user.id, { is_admin: !user.is_admin }));
    await onChanged();
  }

  async function toggleFeature(feature: "chat" | "group_chat") {
    const granted =
      feature === "chat" ? !hasChat : !hasGroup;
    await withBusy(() =>
      api.setUserFeaturePermission(user.id, feature, { granted }),
    );
    await onChanged();
  }

  async function toggleRoom(roomId: string) {
    const next = new Set(grantedRoomIds);
    if (next.has(roomId)) next.delete(roomId);
    else next.add(roomId);
    await withBusy(() =>
      api.setUserFeaturePermission(user.id, "lighting", {
        rooms: Array.from(next),
      }),
    );
    await onChanged();
  }

  async function deleteUser() {
    if (!confirm(`Delete ${user.username}? This can't be undone.`)) return;
    const ok = await withBusy(() => api.deleteAdminUser(user.id));
    if (ok) {
      await onChanged();
      onClose();
    }
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 280, damping: 32 }}
      style={{
        position: "absolute",
        inset: 0,
        left: "auto",
        width: "min(440px, 55%)",
        background: "var(--bg-1)",
        borderLeft: "1px solid var(--border-strong)",
        boxShadow: "-20px 0 60px rgba(0,0,0,0.45)",
        overflowY: "auto",
        padding: "1.4rem 1.5rem 2rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.2rem",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <AvatarEditor
          user={user}
          isSelf={isSelf}
          onChanged={onChanged}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{user.username}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {user.is_admin ? "Admin · full access" : "Member"}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            color: "var(--text-dim)",
            fontSize: 20,
            padding: "0.25rem 0.55rem",
            borderRadius: "var(--radius-md)",
          }}
        >
          ×
        </button>
      </div>

      {error && (
        <div
          style={{
            color: "var(--danger)",
            fontSize: 12,
            padding: "0.4rem 0.7rem",
            background: "rgba(255,107,107,0.08)",
            border: "1px solid rgba(255,107,107,0.25)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {humanError(error)}
        </div>
      )}

      {/* PIN */}
      <Section title="Reset PIN">
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
          Set a new 4–12 digit PIN.
        </p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
            placeholder="••••"
            style={{ flex: 1 }}
            disabled={busy}
          />
          <Button onClick={() => void savePin()} disabled={busy || pin.length < 4}>
            Save
          </Button>
        </div>
      </Section>

      {/* Role */}
      <Section title="Role">
        <Row>
          <RowLabel>Administrator</RowLabel>
          <Toggle on={!!user.is_admin} onClick={() => void toggleAdmin()} />
        </Row>
      </Section>

      {/* Permissions */}
      <Section title="Permissions">
        {user.is_admin ? (
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
            Admins have all permissions automatically.
          </p>
        ) : (
          <>
            <Row>
              <RowLabel>Chat with Astrix</RowLabel>
              <Toggle on={hasChat} onClick={() => void toggleFeature("chat")} />
            </Row>
            <Row>
              <RowLabel>Group chat</RowLabel>
              <Toggle on={hasGroup} onClick={() => void toggleFeature("group_chat")} />
            </Row>
            <div style={{ marginTop: "0.85rem" }}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-dim)",
                  marginBottom: "0.45rem",
                }}
              >
                Lighting rooms
              </div>
              {rooms.length === 0 ? (
                <p style={{ color: "var(--text-faint)", fontSize: 12 }}>
                  No rooms available yet.
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.35rem 0.6rem",
                  }}
                >
                  {rooms.map((r) => {
                    const granted = grantedRoomIds.has(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => void toggleRoom(r.id)}
                        disabled={busy}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          padding: "0.45rem 0.65rem",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-md)",
                          background: granted ? "rgba(122,167,255,0.10)" : "transparent",
                          color: granted ? "var(--text)" : "var(--text-dim)",
                          fontSize: 13,
                          textAlign: "left",
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 4,
                            border: "1px solid var(--border-strong)",
                            display: "grid",
                            placeItems: "center",
                            background: granted ? "var(--accent)" : "transparent",
                            color: "#0b0d12",
                            fontSize: 10,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {granted ? "✓" : ""}
                        </span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </Section>

      {/* Delete */}
      <div style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
        <Button
          variant="danger"
          onClick={() => void deleteUser()}
          disabled={busy || isSelf}
          style={{ width: "100%" }}
        >
          {isSelf ? "Can't delete yourself" : `Delete ${user.username}`}
        </Button>
      </div>
    </motion.div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        style={{
          margin: "0 0 0.5rem",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-dim)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0.45rem 0",
        gap: "0.6rem",
      }}
    >
      {children}
    </div>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, fontSize: 13.5 }}>{children}</div>
  );
}

/** Small toggle, reused from the lighting screen with the geometry-safe math. */
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  const TRACK_W = 46;
  const TRACK_H = 26;
  const KNOB = 20;
  const PAD = 2;
  const travel = TRACK_W - KNOB - PAD * 2 - 2;
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      aria-pressed={on}
      style={{
        width: TRACK_W,
        height: TRACK_H,
        borderRadius: TRACK_H / 2,
        background: on ? "var(--accent)" : "var(--bg-3)",
        border: "1px solid var(--border)",
        position: "relative",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <motion.span
        animate={{ x: on ? travel : 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        style={{
          position: "absolute",
          top: PAD,
          left: PAD,
          width: KNOB,
          height: KNOB,
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }}
      />
    </motion.button>
  );
}

// ----------------------------------------------------------------------

function AddUserModal({
  rooms,
  onClose,
  onCreated,
}: {
  rooms: HueRoom[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [chat, setChat] = useState(true);
  const [group, setGroup] = useState(true);
  const [lightingRooms, setLightingRooms] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    /^[a-z0-9_]{3,32}$/.test(username) && /^[0-9]{4,12}$/.test(pin) && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.createAdminUser({
        username,
        pin,
        is_admin: isAdmin,
        permissions: {
          chat,
          group_chat: group,
          lighting: Array.from(lightingRooms),
        },
      });
      await onCreated();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
        padding: "2rem",
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 12, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 12, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 100%)",
          background: "var(--bg-2)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-xl)",
          padding: "1.4rem 1.5rem",
          boxShadow: "var(--shadow-2)",
        }}
      >
        <h2
          className="gradient-text"
          style={{ margin: "0 0 0.2rem", fontSize: 18, fontWeight: 700 }}
        >
          Add member
        </h2>
        <p style={{ margin: "0 0 1rem", color: "var(--text-dim)", fontSize: 12 }}>
          They can change their PIN later.
        </p>

        <Field label="Username">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="keena"
            spellCheck={false}
          />
          <FieldHint>3–32 chars, lowercase letters/digits/underscore</FieldHint>
        </Field>

        <Field label="PIN">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
            placeholder="••••"
          />
          <FieldHint>4–12 digits</FieldHint>
        </Field>

        <Row>
          <RowLabel>Administrator</RowLabel>
          <Toggle on={isAdmin} onClick={() => setIsAdmin((v) => !v)} />
        </Row>

        {!isAdmin && (
          <>
            <Row>
              <RowLabel>Chat with Astrix</RowLabel>
              <Toggle on={chat} onClick={() => setChat((v) => !v)} />
            </Row>
            <Row>
              <RowLabel>Group chat</RowLabel>
              <Toggle on={group} onClick={() => setGroup((v) => !v)} />
            </Row>
            <div style={{ marginTop: "0.6rem" }}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-dim)",
                  marginBottom: "0.4rem",
                }}
              >
                Lighting rooms
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.35rem 0.6rem",
                }}
              >
                {rooms.length === 0 ? (
                  <p style={{ color: "var(--text-faint)", fontSize: 12 }}>(none)</p>
                ) : (
                  rooms.map((r) => {
                    const granted = lightingRooms.has(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => {
                          const next = new Set(lightingRooms);
                          if (next.has(r.id)) next.delete(r.id);
                          else next.add(r.id);
                          setLightingRooms(next);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          padding: "0.4rem 0.6rem",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-md)",
                          background: granted ? "rgba(122,167,255,0.10)" : "transparent",
                          color: granted ? "var(--text)" : "var(--text-dim)",
                          fontSize: 13,
                          textAlign: "left",
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 4,
                            border: "1px solid var(--border-strong)",
                            background: granted ? "var(--accent)" : "transparent",
                            color: "#0b0d12",
                            display: "grid",
                            placeItems: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {granted ? "✓" : ""}
                        </span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.name}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}

        {error && (
          <p style={{ marginTop: "0.8rem", color: "var(--danger)", fontSize: 12 }}>
            {humanError(error)}
          </p>
        )}

        <div style={{ display: "flex", gap: "0.6rem", marginTop: "1.2rem" }}>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!canSubmit}
            loading={busy}
            style={{ flex: 1 }}
          >
            Create
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: "0.85rem" }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-dim)",
          marginBottom: "0.3rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: "0.25rem", fontSize: 11, color: "var(--text-faint)" }}>
      {children}
    </div>
  );
}

/**
 * Clickable avatar in the drawer header. Opens a file picker on click; on
 * file select, uploads via /api/me/avatar (when editing self) or
 * /api/admin/users/:id/avatar (when editing someone else).
 *
 * Long-press / right-click would be a fine way to delete, but for now we
 * just expose an explicit × button below the avatar.
 */
function AvatarEditor({
  user,
  isSelf,
  onChanged,
}: {
  user: AdminUserView;
  isSelf: boolean;
  onChanged: () => Promise<void>;
}) {
  const { bumpAvatarVersion, avatarVersion } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (isSelf) await api.uploadOwnAvatar(file);
      else await api.uploadUserAvatar(user.id, file);
      bumpAvatarVersion();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "upload_failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      if (isSelf) await api.deleteOwnAvatar();
      else await api.deleteUserAvatar(user.id);
      bumpAvatarVersion();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "delete_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Upload new avatar"
        style={{
          position: "relative",
          padding: 0,
          border: 0,
          background: "transparent",
          cursor: busy ? "wait" : "pointer",
          borderRadius: "50%",
          outline: "none",
        }}
      >
        <UserAvatar userId={user.id} username={user.username} size={40} version={avatarVersion} />
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            color: "white",
            fontSize: 10,
            opacity: 0,
            transition: "opacity 120ms var(--ease-out)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
        >
          edit
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => void onPick(e)}
      />
      <button
        onClick={() => void clear()}
        disabled={busy}
        style={{
          fontSize: 10,
          color: "var(--text-faint)",
          padding: 0,
          background: "transparent",
          border: 0,
          cursor: busy ? "wait" : "pointer",
        }}
      >
        clear
      </button>
      {error && (
        <span style={{ fontSize: 10, color: "var(--danger)" }} title={error}>
          {humanError(error)}
        </span>
      )}
    </div>
  );
}

function NotAllowed() {
  return (
    <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "2rem" }}>
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        <Sigil size={48} />
        <h2 style={{ margin: "0.8rem 0 0.4rem", fontSize: 18, fontWeight: 600 }}>
          Admins only
        </h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.55 }}>
          This screen is reserved for household admins.
        </p>
      </div>
    </div>
  );
}

function humanError(code: string): string {
  switch (code) {
    case "invalid_username":
      return "Username must be 3–32 lowercase letters/digits/underscore.";
    case "invalid_pin":
      return "PIN must be 4–12 digits.";
    case "username_taken":
      return "That username is already taken.";
    case "last_admin":
      return "You can't remove the last admin.";
    case "cant_delete_self":
      return "You can't delete your own account.";
    case "not_found":
      return "Member no longer exists.";
    case "too_large":
      return "Image is too large (max 5 MB).";
    case "bad_image":
    case "upload_failed":
      return "Could not read that image. Try a PNG or JPEG.";
    case "delete_failed":
      return "Could not clear avatar.";
    default:
      return code.replace(/_/g, " ");
  }
}
