/**
 * Lighting screen — Philips Hue rooms the signed-in user is allowed to control.
 *
 * UX:
 *   - Card per room. Glow ring on cards that are "on" hints at brightness.
 *   - Tap card → toggle on/off (optimistic).
 *   - Drag slider → set brightness (optimistic + throttled fire).
 *   - "Strict" permission model is enforced server-side; we just render what
 *     the API returns.
 *
 * State:
 *   - rooms is the source of truth. We mutate it optimistically and replace
 *     the row with the server's snapshot on every response.
 *   - draftBrightness keeps the slider responsive while the user drags; we
 *     debounce a single PATCH on idle.
 */
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sigil } from "../components/Sigil";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { hasPermission } from "../lib/perms";
import type { HueRoom } from "@shared/types";

export function Lighting() {
  const { user, permissions } = useAuth();

  // A user shows up here only if they have ANY lighting grant. Otherwise we
  // render the "no access" panel so the empty state isn't confusing.
  const canSeeLighting =
    !!user?.is_admin ||
    permissions.some((p) => p.feature === "lighting");

  const [rooms, setRooms] = useState<HueRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.listRooms();
      setRooms(res.rooms);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "hue_not_paired") {
          setError("Hue bridge isn't paired yet.");
        } else if (e.code === "no_permission_lighting") {
          setError("You don't have lighting access.");
        } else {
          setError(e.code);
        }
      } else {
        setError("Could not reach the bridge.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canSeeLighting) {
      setLoading(false);
      return;
    }
    void refresh();
    // Light state can change from the Hue app or a wall switch; poll every
    // 20s so the UI doesn't drift.
    const id = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(id);
  }, [canSeeLighting, refresh]);

  if (!canSeeLighting) return <NoLightingAccess />;

  if (loading) {
    return (
      <Centred>
        <Sigil size={48} spinning />
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 12 }}>
          Reading the lights…
        </p>
      </Centred>
    );
  }

  if (error) {
    return (
      <Centred>
        <h2 style={{ margin: "0 0 0.4rem", fontSize: 18, fontWeight: 600 }}>
          Lighting unavailable
        </h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13 }}>{error}</p>
      </Centred>
    );
  }

  if (!rooms || rooms.length === 0) {
    return (
      <Centred>
        <h2 style={{ margin: "0 0 0.4rem", fontSize: 18, fontWeight: 600 }}>
          No rooms granted yet
        </h2>
        <p
          style={{
            color: "var(--text-dim)",
            fontSize: 13,
            lineHeight: 1.55,
            maxWidth: 320,
            textAlign: "center",
          }}
        >
          Ask the household admin to give you access to a room, and it'll appear
          here.
        </p>
      </Centred>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "2rem 2.5rem 3rem" }}>
      <Header count={rooms.length} />
      <motion.div
        layout
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "1rem",
          marginTop: "1.4rem",
        }}
      >
        {rooms.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            onUpdate={(next) =>
              setRooms((prev) =>
                prev ? prev.map((r) => (r.id === next.id ? next : r)) : prev,
              )
            }
            onError={(msg) => setError(msg)}
          />
        ))}
      </motion.div>
    </div>
  );
}

// -------------------------------------------------------------------------

function Header({ count }: { count: number }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}
    >
      <Sigil size={32} />
      <div>
        <h1
          className="gradient-text"
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          Lighting
        </h1>
        <p style={{ margin: "0.2rem 0 0", color: "var(--text-dim)", fontSize: 12 }}>
          {count} room{count === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------

interface CardProps {
  room: HueRoom;
  onUpdate: (next: HueRoom) => void;
  onError: (msg: string) => void;
}

function RoomCard({ room, onUpdate, onError }: CardProps) {
  // Local draft brightness so slider feels instant.
  const [draft, setDraft] = useState<number | null>(null);
  const sendTimer = useRef<number | null>(null);

  const displayedBrightness = draft ?? room.brightness ?? 0;
  const isOn = room.on;

  const toggle = useCallback(async () => {
    const next: HueRoom = { ...room, on: !isOn };
    onUpdate(next); // optimistic
    try {
      const res = await api.setRoomOn(room.id, !isOn);
      onUpdate(res.room);
    } catch {
      onUpdate(room); // roll back
      onError("Could not toggle " + room.name);
    }
  }, [room, isOn, onUpdate, onError]);

  const queueBrightness = useCallback(
    (v: number) => {
      setDraft(v);
      if (sendTimer.current) window.clearTimeout(sendTimer.current);
      sendTimer.current = window.setTimeout(async () => {
        try {
          const res = await api.setRoomBrightness(room.id, v);
          onUpdate(res.room);
          setDraft(null);
        } catch {
          onError("Could not dim " + room.name);
          setDraft(null);
        }
      }, 200);
    },
    [room.id, room.name, onUpdate, onError],
  );

  return (
    <motion.div
      layout
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      style={{
        position: "relative",
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "1.1rem 1.1rem 0.85rem",
        boxShadow: isOn
          ? `0 0 ${Math.max(8, displayedBrightness / 3)}px rgba(255, 209, 109, ${Math.min(0.32, displayedBrightness / 280)})`
          : "var(--shadow-1)",
        transition: "box-shadow 220ms var(--ease-out), border-color 200ms var(--ease-out)",
        borderColor: isOn ? "rgba(255, 209, 109, 0.35)" : "var(--border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.7rem",
          marginBottom: "0.85rem",
        }}
      >
        <RoomIcon archetype={room.archetype} on={isOn} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {room.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {isOn ? `${displayedBrightness}%` : "off"}
          </div>
        </div>
        <Toggle on={isOn} onClick={() => void toggle()} />
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={displayedBrightness}
        onChange={(e) => queueBrightness(Number(e.target.value))}
        disabled={!isOn}
        aria-label={`${room.name} brightness`}
        style={{
          width: "100%",
          accentColor: "var(--accent)",
          opacity: isOn ? 1 : 0.4,
          cursor: isOn ? "pointer" : "not-allowed",
        }}
      />
    </motion.div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      aria-pressed={on}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        background: on ? "var(--accent)" : "var(--bg-3)",
        border: "1px solid var(--border)",
        position: "relative",
        transition: "background 200ms var(--ease-out)",
      }}
    >
      <motion.span
        animate={{ x: on ? 20 : 2 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        style={{
          position: "absolute",
          top: 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }}
      />
    </motion.button>
  );
}

function RoomIcon({
  archetype,
  on,
}: {
  archetype: string | null;
  on: boolean;
}) {
  const emoji = useMemo(() => {
    switch (archetype) {
      case "bedroom":
        return "🛏️";
      case "bathroom":
        return "🛁";
      case "kitchen":
        return "🍳";
      case "office":
      case "living_room":
        return "💡";
      case "hallway":
        return "🚪";
      case "garage":
        return "🚗";
      case "garden":
      case "outdoor":
        return "🌿";
      case "staircase":
        return "🪜";
      case "dining":
        return "🍽️";
      default:
        return "💡";
    }
  }, [archetype]);
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: "var(--radius-md)",
        background: on ? "rgba(255, 209, 109, 0.12)" : "var(--bg-3)",
        display: "grid",
        placeItems: "center",
        fontSize: 18,
        border: "1px solid var(--border)",
      }}
      aria-hidden
    >
      {emoji}
    </div>
  );
}

// -------------------------------------------------------------------------

function Centred({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center" }}>{children}</div>
    </div>
  );
}

function NoLightingAccess() {
  return (
    <Centred>
      <Sigil size={56} />
      <h2 style={{ margin: "0.8rem 0 0.4rem", fontSize: 18, fontWeight: 600 }}>
        No lighting access
      </h2>
      <p
        style={{
          color: "var(--text-dim)",
          fontSize: 13,
          lineHeight: 1.55,
          maxWidth: 320,
          marginInline: "auto",
        }}
      >
        Ask the household admin to grant you access to a room and you'll see it
        here.
      </p>
    </Centred>
  );
}
