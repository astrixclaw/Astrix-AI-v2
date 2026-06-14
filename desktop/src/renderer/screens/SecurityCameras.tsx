/**
 * Security Cameras screen.
 *
 * ZOSI BNC cameras connect via DVR only — no local RTSP or HTTP snapshot
 * endpoint is available. Live view requires the ZOSI AVSS (iOS/Android)
 * or ZOSI AVSS (Windows/Mac PC client from zositech.com/pages/app).
 *
 * This screen shows the configured camera list and links out to ZOSI Smart.
 */
import React, { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Camera } from "@shared/types";

// ---- Constants ---------------------------------------------------------

const ZOSI_APP_URL = "https://www.zositech.com/pages/app";

// Try to open the ZOSI AVSS desktop client via protocol handler, fall back to download page.
function openZosiApp() {
  // Attempt deep link first (ZOSI CMS registers "zosiapp://" on some installs)
  window.api.openExternal("zosiapp://").catch(() => {
    window.api.openExternal(ZOSI_APP_URL);
  });
}

// ---- Brand display helpers ---------------------------------------------

const BRAND_LABELS: Record<string, string> = {
  zosi: "Zosi",
  hikvision: "Hikvision",
  dahua: "Dahua",
  reolink: "Reolink",
  amcrest: "Amcrest",
  lorex: "Lorex",
  foscam: "Foscam",
  tapo: "TP-Link Tapo",
  annke: "Annke",
  generic_onvif: "ONVIF",
  generic_rtsp: "RTSP",
};

function brandLabel(brand: string): string {
  return BRAND_LABELS[brand] ?? brand;
}

// ---- CameraCard --------------------------------------------------------

interface CameraCardProps {
  camera: Camera;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function CameraCard({ camera, isAdmin, onEdit, onDelete }: CameraCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        position: "relative",
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        cursor: "pointer",
        aspectRatio: "16/9",
        transition: "border-color 0.15s",
        borderColor: hovered ? "var(--accent)" : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={openZosiApp}
    >
      {/* Static background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f1117 0%, #1a1d2e 100%)",
          gap: "0.5rem",
        }}
      >
        <span style={{ fontSize: 32, opacity: 0.4 }}>📷</span>
        <span style={{ fontSize: 11, color: "var(--text-dim)", opacity: 0.6 }}>
          View in ZOSI AVSS
        </span>
      </div>

      {/* Hover overlay */}
      {hovered && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2,
          }}
        >
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
            ↗ Open ZOSI AVSS
          </span>
        </div>
      )}

      {/* Name badge */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
          padding: "1.2rem 0.75rem 0.5rem",
          zIndex: 3,
        }}
      >
        <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{camera.name}</div>
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
          {brandLabel(camera.brand)} · ch{camera.channel}
        </div>
      </div>

      {/* Admin controls */}
      {isAdmin && (
        <div
          style={{
            position: "absolute",
            top: "0.4rem",
            right: "0.4rem",
            display: "flex",
            gap: "0.3rem",
            zIndex: 4,
          }}
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <IconBtn title="Edit" onClick={onEdit}>✏️</IconBtn>
          <IconBtn title="Delete" onClick={onDelete}>🗑️</IconBtn>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        all: "unset",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "var(--radius-sm)",
        padding: "0.25rem 0.35rem",
        cursor: "pointer",
        fontSize: 13,
        lineHeight: 1,
        color: "#fff",
      }}
    >
      {children}
    </button>
  );
}

// ---- Edit camera modal -------------------------------------------------

function EditCameraModal({
  camera,
  onSave,
  onClose,
}: {
  camera: Camera | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(camera?.name ?? "");
  const [brand, setBrand] = useState(camera?.brand ?? "zosi");
  const [channel, setChannel] = useState(camera?.channel ?? 1);
  const [enabled, setEnabled] = useState(camera?.enabled !== 0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setErr("Camera name is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      // rtsp_url stored as empty string — no longer used for streaming
      if (camera) {
        await api.updateCamera(camera.id, {
          name,
          rtsp_url: camera.rtsp_url ?? "",
          sub_rtsp_url: null,
          brand,
          channel,
          enabled,
        });
      } else {
        await api.createCamera({
          name,
          rtsp_url: "",
          sub_rtsp_url: null,
          brand,
          channel,
          enabled,
        });
      }
      onSave();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ width: 380, maxWidth: "90vw" }}>
        <h3 style={{ margin: "0 0 1.2rem", fontSize: 16 }}>
          {camera ? "Edit Camera" : "Add Camera"}
        </h3>

        <Label>Camera name</Label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Front door"
        />

        <div style={{ height: "0.8rem" }} />
        <Label>Brand</Label>
        <select
          className="input"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          style={{ cursor: "pointer" }}
        >
          {Object.entries(BRAND_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <div style={{ height: "0.8rem" }} />
        <Label>Channel number</Label>
        <input
          className="input"
          type="number"
          min={1}
          max={64}
          value={channel}
          onChange={(e) => setChannel(Number(e.target.value))}
        />

        <div style={{ height: "0.8rem" }} />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
            fontSize: 13,
            color: "var(--text)",
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled (visible to members)
        </label>

        {err && (
          <div style={{ color: "var(--error)", fontSize: 12, marginTop: "0.6rem" }}>{err}</div>
        )}

        <div
          style={{ display: "flex", gap: "0.6rem", marginTop: "1.2rem", justifyContent: "flex-end" }}
        >
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-dim)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: "0.3rem",
      }}
    >
      {children}
    </div>
  );
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e: MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-0)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "1.5rem 1.75rem",
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ---- Main screen -------------------------------------------------------

export function SecurityCameras() {
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCamera, setEditCamera] = useState<Camera | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Camera | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.listCameras();
      setCameras(res.cameras);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    await api.deleteCamera(deleteTarget.id);
    setDeleteTarget(null);
    void load();
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "1rem 1.5rem",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flexShrink: 0,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Security Cameras</h2>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
            {cameras.length} camera{cameras.length !== 1 ? "s" : ""} · live view via ZOSI AVSS
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn-primary" onClick={openZosiApp}>
            ↗ Open ZOSI AVSS
          </button>
          {isAdmin && (
            <button className="btn-ghost" onClick={() => setEditCamera("new")}>
              + Add Camera
            </button>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div
        style={{
          margin: "0.75rem 1.5rem 0",
          padding: "0.65rem 1rem",
          background: "rgba(99,102,241,0.08)",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: "var(--radius-md)",
          fontSize: 12,
          color: "var(--text-dim)",
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          flexShrink: 0,
        }}
      >
        <span>ℹ️</span>
        <span>
          These cameras connect via DVR only. Live view requires the{" "}
          <button
            onClick={openZosiApp}
            style={{
              all: "unset",
              color: "var(--accent)",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            ZOSI AVSS
          </button>
          . Tap any camera tile to open it.
        </span>
      </div>

      {/* Camera grid */}
      <div style={{ flex: 1, overflow: "auto", padding: "1.25rem 1.5rem" }}>
        {loading ? (
          <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Loading…</div>
        ) : cameras.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "0.75rem",
              color: "var(--text-dim)",
            }}
          >
            <span style={{ fontSize: 40 }}>📷</span>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
              No cameras configured
            </div>
            <div style={{ fontSize: 13 }}>
              {isAdmin
                ? 'Click "+ Add Camera" to register a camera, or open ZOSI AVSS to view live feeds.'
                : "Ask your admin to configure cameras, then use ZOSI AVSS to view live feeds."}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button className="btn-primary" onClick={openZosiApp}>
                ↗ Open ZOSI AVSS
              </button>
              {isAdmin && (
                <button className="btn-ghost" onClick={() => setEditCamera("new")}>
                  + Add Camera
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "1rem",
            }}
          >
            {cameras.map((cam) => (
              <CameraCard
                key={cam.id}
                camera={cam}
                isAdmin={isAdmin}
                onEdit={() => setEditCamera(cam)}
                onDelete={() => setDeleteTarget(cam)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit / Add modal */}
      {editCamera && (
        <EditCameraModal
          camera={editCamera === "new" ? null : editCamera}
          onSave={() => {
            setEditCamera(null);
            void load();
          }}
          onClose={() => setEditCamera(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <Overlay onClose={() => setDeleteTarget(null)}>
          <div style={{ width: 340 }}>
            <h3 style={{ margin: "0 0 0.75rem", fontSize: 16 }}>Remove camera?</h3>
            <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 1.2rem" }}>
              "{deleteTarget.name}" will be removed from the list. This doesn't affect the DVR or
              ZOSI app.
            </p>
            <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleDelete}>
                Remove
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
