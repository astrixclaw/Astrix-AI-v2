/**
 * Security Cameras screen.
 *
 * Shows a grid of camera feeds. Click any feed to enter fullscreen view.
 * Admin controls: add/edit/delete cameras, start/stop recording.
 * Everyone: live view, snapshots, quality toggle.
 *
 * Streaming: RTSP → HLS via FFmpeg on the backend. Renderer plays HLS with
 * hls.js (loaded dynamically to keep the bundle lean). Falls back to a still
 * snapshot + reload loop when HLS isn't available (e.g. FFmpeg not installed).
 */
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type MouseEvent,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Camera } from "@shared/types";
import { CameraSetupWizard } from "../components/CameraSetupWizard";

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

// ---- HLS player hook ---------------------------------------------------

type PlayerState = "idle" | "loading" | "playing" | "paused" | "error";

function useCameraStream(camera: Camera | null, active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<unknown>(null);
  const [state, setState] = useState<PlayerState>("idle");
  const [error, setError] = useState<string | null>(null);

  const destroy = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hls = hlsRef.current as any;
    if (hls) { try { hls.destroy(); } catch { /* ignore */ } hlsRef.current = null; }
    if (videoRef.current) videoRef.current.src = "";
    setState("idle");
  }, []);

  useEffect(() => {
    if (!active || !camera) { destroy(); return; }

    let cancelled = false;
    setState("loading");
    setError(null);

    (async () => {
      try {
        const { hlsUrl } = await api.startStream(camera.id);

        if (cancelled) return;

        // Load hls.js dynamically
        const HlsModule = await import("hls.js");
        const Hls = HlsModule.default;

        if (cancelled) return;

        if (Hls.isSupported() && videoRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const hls = new Hls({
            // hls.js 1.x uses fetch by default — use fetchSetup to inject auth token.
            // xhrSetup is silently ignored in fetch mode.
            fetchSetup: (context: { url: string }, initParams: RequestInit) => {
              const authed = api.hlsSegmentUrl(context.url);
              return new Request(authed, initParams);
            },
          } as Record<string, unknown>);
          hlsRef.current = hls;
          hls.loadSource(hlsUrl);
          hls.attachMedia(videoRef.current);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!cancelled) {
              videoRef.current?.play().catch(() => {});
              setState("playing");
            }
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          hls.on(Hls.Events.ERROR, (_: unknown, data: any) => {
            if (data.fatal) {
              setError("Stream error — check camera connection");
              setState("error");
            }
          });
        } else if (videoRef.current?.canPlayType("application/vnd.apple.mpegurl")) {
          // Safari native HLS
          videoRef.current.src = hlsUrl;
          videoRef.current.play().catch(() => {});
          setState("playing");
        } else {
          setError("HLS not supported in this browser");
          setState("error");
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      destroy();
      api.stopStream(camera.id).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, camera?.id]);

  const pause = () => { videoRef.current?.pause(); setState("paused"); };
  const play = () => { videoRef.current?.play().catch(() => {}); setState("playing"); };

  return { videoRef, state, error, pause, play };
}

// ---- Snapshot helper ---------------------------------------------------

function useSnapshot(camera: Camera | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const take = useCallback(async () => {
    if (!camera) return;
    setLoading(true);
    try {
      const snapshotUrl = api.snapshotUrl(camera.id);
      // Add cache-buster
      setUrl(`${snapshotUrl}&_t=${Date.now()}`);
    } finally {
      setLoading(false);
    }
  }, [camera]);

  return { url, loading, take };
}

// ---- CameraCard --------------------------------------------------------

interface CameraCardProps {
  camera: Camera;
  isAdmin: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function CameraCard({ camera, isAdmin, onClick, onEdit, onDelete }: CameraCardProps) {
  const [hovered, setHovered] = useState(false);
  const snapshotSrc = api.snapshotUrl(camera.id);

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
      onClick={onClick}
    >
      {/* Snapshot preview */}
      <img
        src={snapshotSrc}
        alt={camera.name}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />

      {/* Offline overlay when snapshot fails */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111",
          fontSize: 13,
          color: "var(--text-dim)",
          flexDirection: "column",
          gap: "0.4rem",
          zIndex: 0,
        }}
      >
        <span style={{ fontSize: 28 }}>📷</span>
        <span>Offline / no preview</span>
      </div>

      {/* Hover overlay */}
      {hovered && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2,
          }}
        >
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>▶ Open live view</span>
        </div>
      )}

      {/* Name badge */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
          padding: "1.2rem 0.75rem 0.5rem",
          zIndex: 3,
        }}
      >
        <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{camera.name}</div>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{brandLabel(camera.brand)} · ch{camera.channel}</div>
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

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
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

// ---- Fullscreen live view modal ----------------------------------------

interface LiveViewProps {
  camera: Camera;
  isAdmin: boolean;
  onClose: () => void;
}

function LiveView({ camera, isAdmin, onClose }: LiveViewProps) {
  const { videoRef, state, error, pause, play } = useCameraStream(camera, true);
  const { url: snapUrl, loading: snapLoading, take: takeSnap } = useSnapshot(camera);
  const [quality, setQuality] = useState<"main" | "sub">("main");
  const [recording, setRecording] = useState(false);
  const [recMsg, setRecMsg] = useState<string | null>(null);

  async function toggleRecording() {
    if (recording) {
      await api.stopRecording(camera.id);
      setRecording(false);
      setRecMsg("Recording saved.");
      setTimeout(() => setRecMsg(null), 3000);
    } else {
      await api.startRecording(camera.id);
      setRecording(true);
      setRecMsg("Recording started…");
    }
  }

  async function toggleQuality() {
    const next = quality === "main" ? "sub" : "main";
    if (!camera.sub_rtsp_url && next === "sub") return;
    setQuality(next);
    // Restart stream with new quality
    await api.stopStream(camera.id);
    await api.startStream(camera.id, next);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.88)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            all: "unset",
            color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
          }}
          title="Close"
        >
          ✕
        </button>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{camera.name}</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>
            {brandLabel(camera.brand)} · Channel {camera.channel} · {quality === "main" ? "Main stream" : "Sub stream"}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Status pill */}
        <div
          style={{
            background: state === "playing" ? "rgba(34,197,94,0.2)" : state === "error" ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.1)",
            color: state === "playing" ? "#4ade80" : state === "error" ? "#f87171" : "rgba(255,255,255,0.5)",
            border: `1px solid ${state === "playing" ? "rgba(74,222,128,0.3)" : state === "error" ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.15)"}`,
            borderRadius: 999,
            padding: "0.2rem 0.7rem",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {state === "loading" ? "⏳ Connecting…" : state === "playing" ? "● LIVE" : state === "paused" ? "⏸ Paused" : state === "error" ? "⚠ Error" : "○ Idle"}
        </div>
      </div>

      {/* Video */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#000" }}>
        <video
          ref={videoRef}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            // Force GPU compositing layer — fixes Electron black video rendering bug
            transform: "translateZ(0)",
            WebkitTransform: "translateZ(0)",
            willChange: "transform",
          }}
          autoPlay
          playsInline
          muted
        />
        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            <div style={{ fontSize: 36 }}>⚠️</div>
            <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div>
            {error.includes("ffmpeg") && (
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "monospace", background: "rgba(0,0,0,0.5)", padding: "0.3rem 0.6rem", borderRadius: 4 }}>
                sudo apt-get install -y ffmpeg
              </div>
            )}
          </div>
        )}
        {snapUrl && (
          <img
            src={snapUrl}
            alt="snapshot"
            style={{ position: "absolute", bottom: "1rem", right: "1rem", width: 160, border: "2px solid rgba(255,255,255,0.2)", borderRadius: 6 }}
          />
        )}
      </div>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          padding: "0.75rem 1rem",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          flexWrap: "wrap",
        }}
      >
        {/* Play/Pause */}
        {state === "playing" ? (
          <CtrlBtn onClick={pause} label="Pause">⏸ Pause</CtrlBtn>
        ) : (
          <CtrlBtn onClick={play} label="Play">▶ Play</CtrlBtn>
        )}

        {/* Snapshot */}
        <CtrlBtn onClick={takeSnap} label="Snapshot" disabled={snapLoading}>
          {snapLoading ? "⏳ Capturing…" : "📷 Snapshot"}
        </CtrlBtn>

        {/* Quality toggle */}
        {camera.sub_rtsp_url && (
          <CtrlBtn onClick={toggleQuality} label="Quality">
            🎥 {quality === "main" ? "HD → SD" : "SD → HD"}
          </CtrlBtn>
        )}

        {/* Record (admin only) */}
        {isAdmin && (
          <CtrlBtn
            onClick={toggleRecording}
            label={recording ? "Stop Recording" : "Record"}
            style={{ background: recording ? "rgba(239,68,68,0.25)" : undefined, borderColor: recording ? "rgba(239,68,68,0.5)" : undefined }}
          >
            {recording ? "⏹ Stop Rec" : "⏺ Record"}
          </CtrlBtn>
        )}

        {/* Fullscreen */}
        <CtrlBtn onClick={() => videoRef.current?.requestFullscreen?.()} label="Fullscreen">
          ⛶ Fullscreen
        </CtrlBtn>

        {recMsg && (
          <span style={{ color: "#4ade80", fontSize: 12, marginLeft: "auto" }}>{recMsg}</span>
        )}
      </div>
    </div>
  );
}

function CtrlBtn({
  onClick,
  label,
  children,
  disabled,
  style: extStyle,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        all: "unset",
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "var(--radius-md)",
        padding: "0.4rem 0.85rem",
        color: disabled ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.9)",
        cursor: disabled ? "default" : "pointer",
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: "nowrap",
        ...extStyle,
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
  const [rtspUrl, setRtspUrl] = useState(camera?.rtsp_url ?? "");
  const [subRtspUrl, setSubRtspUrl] = useState(camera?.sub_rtsp_url ?? "");
  const [brand, setBrand] = useState(camera?.brand ?? "generic_rtsp");
  const [channel, setChannel] = useState(camera?.channel ?? 1);
  const [enabled, setEnabled] = useState(camera?.enabled !== 0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || !rtspUrl.trim()) { setErr("Name and RTSP URL are required."); return; }
    setSaving(true);
    setErr(null);
    try {
      if (camera) {
        await api.updateCamera(camera.id, { name, rtsp_url: rtspUrl, sub_rtsp_url: subRtspUrl || null, brand, channel, enabled });
      } else {
        await api.createCamera({ name, rtsp_url: rtspUrl, sub_rtsp_url: subRtspUrl || null, brand, channel, enabled });
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
      <div style={{ width: 440, maxWidth: "90vw" }}>
        <h3 style={{ margin: "0 0 1.2rem", fontSize: 16 }}>{camera ? "Edit Camera" : "Add Camera"}</h3>

        <Label>Camera name</Label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Office camera" />

        <div style={{ height: "0.8rem" }} />
        <Label>Brand</Label>
        <select className="input" value={brand} onChange={(e) => setBrand(e.target.value)} style={{ cursor: "pointer" }}>
          {Object.entries(BRAND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <div style={{ height: "0.8rem" }} />
        <Label>Channel number</Label>
        <input className="input" type="number" min={1} max={64} value={channel} onChange={(e) => setChannel(Number(e.target.value))} />

        <div style={{ height: "0.8rem" }} />
        <Label>Main RTSP URL</Label>
        <input className="input" value={rtspUrl} onChange={(e) => setRtspUrl(e.target.value)} placeholder="rtsp://admin:pass@192.168.1.x:554/ch1/main/av_stream" spellCheck={false} />

        <div style={{ height: "0.8rem" }} />
        <Label>Sub stream URL (optional — lower resolution)</Label>
        <input className="input" value={subRtspUrl} onChange={(e) => setSubRtspUrl(e.target.value)} placeholder="rtsp://admin:pass@192.168.1.x:554/ch1/sub/av_stream" spellCheck={false} />

        <div style={{ height: "0.8rem" }} />
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: 13, color: "var(--text)" }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled (visible to members)
        </label>

        {err && <div style={{ color: "var(--error)", fontSize: 12, marginTop: "0.6rem" }}>{err}</div>}

        <div style={{ display: "flex", gap: "0.6rem", marginTop: "1.2rem", justifyContent: "flex-end" }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Overlay>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>{children}</div>;
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e: MouseEvent) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--bg-0)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "1.5rem 1.75rem", boxShadow: "0 16px 40px rgba(0,0,0,0.5)" }}>
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
  const [ffmpegAvailable, setFfmpegAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [liveCamera, setLiveCamera] = useState<Camera | null>(null);
  const [editCamera, setEditCamera] = useState<Camera | "new" | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Camera | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.listCameras();
      setCameras(res.cameras);
      setFfmpegAvailable(res.ffmpegAvailable);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

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
            {cameras.length} camera{cameras.length !== 1 ? "s" : ""} configured
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-ghost" onClick={() => setShowWizard(true)}>
              🔍 Setup Wizard
            </button>
            <button className="btn-primary" onClick={() => setEditCamera("new")}>
              + Add Camera
            </button>
          </div>
        )}
      </div>

      {/* FFmpeg warning */}
      {!ffmpegAvailable && (
        <div
          style={{
            margin: "0.75rem 1.5rem 0",
            padding: "0.65rem 1rem",
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.3)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
            color: "var(--text)",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          <span>⚠️</span>
          <span>
            <strong>FFmpeg not installed.</strong> Live streaming requires FFmpeg.{" "}
            <code style={{ background: "rgba(255,255,255,0.08)", padding: "0 0.3rem", borderRadius: 3 }}>
              sudo apt-get install -y ffmpeg
            </code>{" "}
            then restart the backend. Snapshots will also be unavailable until then.
          </span>
        </div>
      )}

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
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>No cameras configured</div>
            <div style={{ fontSize: 13 }}>
              {isAdmin
                ? 'Click "Setup Wizard" to scan your network, or "+ Add Camera" to add one manually.'
                : "Ask your admin to set up security cameras."}
            </div>
            {isAdmin && (
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button className="btn-ghost" onClick={() => setShowWizard(true)}>🔍 Setup Wizard</button>
                <button className="btn-primary" onClick={() => setEditCamera("new")}>+ Add Camera</button>
              </div>
            )}
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
                onClick={() => setLiveCamera(cam)}
                onEdit={() => setEditCamera(cam)}
                onDelete={() => setDeleteTarget(cam)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Live view modal */}
      {liveCamera && (
        <LiveView
          camera={liveCamera}
          isAdmin={isAdmin}
          onClose={() => setLiveCamera(null)}
        />
      )}

      {/* Edit / Add modal */}
      {editCamera && (
        <EditCameraModal
          camera={editCamera === "new" ? null : editCamera}
          onSave={() => { setEditCamera(null); void load(); }}
          onClose={() => setEditCamera(null)}
        />
      )}

      {/* Setup wizard */}
      {showWizard && (
        <CameraSetupWizard
          onClose={() => setShowWizard(false)}
          onAdded={() => { setShowWizard(false); void load(); }}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <Overlay onClose={() => setDeleteTarget(null)}>
          <div style={{ width: 340 }}>
            <h3 style={{ margin: "0 0 0.75rem", fontSize: 16 }}>Delete camera?</h3>
            <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 1.2rem" }}>
              "{deleteTarget.name}" will be removed. Any active stream will be stopped. Recordings are kept.
            </p>
            <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
