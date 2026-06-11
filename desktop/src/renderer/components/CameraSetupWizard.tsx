/**
 * Camera Setup Wizard.
 *
 * Walks the admin through:
 *   Step 1 — Choose method: ONVIF auto-discover OR brand preset OR manual URL
 *   Step 2 — Configure (brand + IP + credentials → RTSP URL is auto-built)
 *   Step 3 — Name the camera + test connection (snapshot preview)
 *   Step 4 — Save
 *
 * Supported brand presets with RTSP URL templates:
 *   Zosi, Hikvision, Dahua, Reolink, Amcrest/Lorex, Foscam, TP-Link Tapo, Annke, Generic RTSP
 */
import { useState, type ReactNode } from "react";
import { api } from "../lib/api";

// ---- RTSP URL templates ------------------------------------------------

interface BrandPreset {
  id: string;
  label: string;
  mainUrl: (ip: string, user: string, pass: string, ch: number) => string;
  subUrl?: (ip: string, user: string, pass: string, ch: number) => string;
  defaultUser: string;
  defaultPort: number;
  notes?: string;
}

const BRAND_PRESETS: BrandPreset[] = [
  {
    id: "zosi",
    label: "Zosi (ZR08VN / ZR04MN / NVR)",
    mainUrl: (ip, u, p, ch) => `rtsp://${u}:${p}@${ip}:554/ch${ch}/main/av_stream`,
    subUrl: (ip, u, p, ch) => `rtsp://${u}:${p}@${ip}:554/ch${ch}/sub/av_stream`,
    defaultUser: "admin",
    defaultPort: 554,
    notes: "Default password is blank or printed on the DVR sticker.",
  },
  {
    id: "hikvision",
    label: "Hikvision (DVR/NVR/IP camera)",
    mainUrl: (ip, u, p, ch) => `rtsp://${u}:${p}@${ip}:554/Streaming/Channels/${ch}01`,
    subUrl: (ip, u, p, ch) => `rtsp://${u}:${p}@${ip}:554/Streaming/Channels/${ch}02`,
    defaultUser: "admin",
    defaultPort: 554,
  },
  {
    id: "dahua",
    label: "Dahua / Amcrest / Lorex",
    mainUrl: (ip, u, p, ch) => `rtsp://${u}:${p}@${ip}:554/cam/realmonitor?channel=${ch}&subtype=0`,
    subUrl: (ip, u, p, ch) => `rtsp://${u}:${p}@${ip}:554/cam/realmonitor?channel=${ch}&subtype=1`,
    defaultUser: "admin",
    defaultPort: 554,
  },
  {
    id: "reolink",
    label: "Reolink",
    mainUrl: (ip, u, p, _ch) => `rtsp://${u}:${p}@${ip}:554/h264Preview_01_main`,
    subUrl: (ip, u, p, _ch) => `rtsp://${u}:${p}@${ip}:554/h264Preview_01_sub`,
    defaultUser: "admin",
    defaultPort: 554,
    notes: "Enable RTSP in the Reolink app under Settings → Network → Advanced.",
  },
  {
    id: "foscam",
    label: "Foscam",
    mainUrl: (ip, u, p, _ch) => `rtsp://${u}:${p}@${ip}:88/videoMain`,
    defaultUser: "admin",
    defaultPort: 88,
  },
  {
    id: "tapo",
    label: "TP-Link Tapo",
    mainUrl: (ip, u, p, _ch) => `rtsp://${u}:${p}@${ip}:554/stream1`,
    subUrl: (ip, u, p, _ch) => `rtsp://${u}:${p}@${ip}:554/stream2`,
    defaultUser: "admin",
    defaultPort: 554,
    notes: "Enable RTSP in the Tapo app under Camera Settings → Advanced.",
  },
  {
    id: "annke",
    label: "Annke",
    mainUrl: (ip, u, p, ch) => `rtsp://${u}:${p}@${ip}:554/Streaming/Channels/${ch}01`,
    subUrl: (ip, u, p, ch) => `rtsp://${u}:${p}@${ip}:554/Streaming/Channels/${ch}02`,
    defaultUser: "admin",
    defaultPort: 554,
  },
  {
    id: "generic_onvif",
    label: "Generic ONVIF device",
    mainUrl: (ip, u, p, _ch) => `rtsp://${u}:${p}@${ip}:554/stream`,
    defaultUser: "admin",
    defaultPort: 554,
    notes: "RTSP URL may vary. Check your camera's manual or ONVIF Device Manager.",
  },
  {
    id: "generic_rtsp",
    label: "Other / manual URL",
    mainUrl: (_ip, _u, _p, _ch) => "",
    defaultUser: "admin",
    defaultPort: 554,
  },
];

// ---- Wizard steps ------------------------------------------------------

type WizardStep = "method" | "configure" | "name-test" | "done";
type Method = "onvif" | "preset" | "manual";

// ---- shared mini-components --------------------------------------------

function ModalShell({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--bg-0)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "1.75rem 2rem", width: 520, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.2rem" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17 }}>📷 Camera Setup Wizard</h2>
            {subtitle && <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ all: "unset", cursor: "pointer", color: "var(--text-dim)", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", marginBottom: "0.5rem" }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function Inp({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>{label}</div>
      <input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} style={{ width: "100%", boxSizing: "border-box" }} />
    </div>
  );
}

function BtnRow({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end", marginTop: "1.2rem" }}>{children}</div>;
}

// ---- Main wizard component ---------------------------------------------

interface CameraSetupWizardProps {
  onClose: () => void;
  onAdded: () => void;
}

export function CameraSetupWizard({ onClose, onAdded }: CameraSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>("method");
  const [method, setMethod] = useState<Method | null>(null);

  // Preset / configure state
  const [selectedPreset, setSelectedPreset] = useState<BrandPreset | null>(null);
  const [ip, setIp] = useState("");
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("");
  const [channel, setChannel] = useState(1);
  const [manualRtsp, setManualRtsp] = useState("");
  const [manualSub, setManualSub] = useState("");

  // Name + test state
  const [name, setName] = useState("");
  const [snapshotOk, setSnapshotOk] = useState<boolean | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ONVIF discovery
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<string[]>([]);

  // ---- helpers -----------------------------------------------------------

  function buildRtspUrl(): string {
    if (method === "manual") return manualRtsp.trim();
    if (!selectedPreset || !ip.trim()) return "";
    return selectedPreset.mainUrl(ip.trim(), user || "admin", encodeURIComponent(pass), channel);
  }

  function buildSubUrl(): string | null {
    if (method === "manual") return manualSub.trim() || null;
    if (!selectedPreset?.subUrl || !ip.trim()) return null;
    return selectedPreset.subUrl(ip.trim(), user || "admin", encodeURIComponent(pass), channel);
  }

  async function handleDiscover() {
    setDiscovering(true);
    setDiscovered([]);
    setErr(null);
    try {
      const res = await api.discoverCameras(4000);
      setDiscovered(res.devices);
      if (res.devices.length === 0) setErr("No ONVIF devices found on the LAN. Try manual entry.");
    } catch (e) {
      setErr(String(e));
    } finally {
      setDiscovering(false);
    }
  }

  async function handleTestSnapshot() {
    const rtspUrl = buildRtspUrl();
    if (!rtspUrl) { setErr("RTSP URL is required."); return; }

    // We can't test the snapshot directly from the wizard (we haven't saved yet).
    // Instead, create a temp camera, test it, then delete if cancelled.
    setTesting(true);
    setSnapshotOk(null);
    setSnapshotUrl(null);
    setErr(null);
    try {
      const res = await api.createCamera({
        name: name.trim() || "Test camera",
        brand: selectedPreset?.id ?? "generic_rtsp",
        rtsp_url: rtspUrl,
        sub_rtsp_url: buildSubUrl(),
        channel,
        enabled: false, // hidden until confirmed
      });
      const snap = api.snapshotUrl(res.camera.id);
      setSnapshotUrl(`${snap}&_t=${Date.now()}`);
      // Try loading the image
      const img = new Image();
      img.onload = () => { setSnapshotOk(true); setTesting(false); };
      img.onerror = () => {
        setSnapshotOk(false);
        setTesting(false);
        // Clean up temp camera
        api.deleteCamera(res.camera.id).catch(() => {});
        setErr("Snapshot failed — check the RTSP URL, username, and password.");
      };
      img.src = snap;
      // Store the camera id so we can enable it on save
      setCameraIdForSave(res.camera.id);
    } catch (e) {
      setSnapshotOk(false);
      setTesting(false);
      setErr(String(e));
    }
  }

  const [cameraIdForSave, setCameraIdForSave] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) { setErr("Please enter a camera name."); return; }
    const rtspUrl = buildRtspUrl();
    if (!rtspUrl) { setErr("RTSP URL is required."); return; }

    setSaving(true);
    setErr(null);
    try {
      if (cameraIdForSave) {
        // Camera was created during test — just update it and enable
        await api.updateCamera(cameraIdForSave, {
          name: name.trim(),
          enabled: true,
          rtsp_url: rtspUrl,
          sub_rtsp_url: buildSubUrl(),
        });
      } else {
        await api.createCamera({
          name: name.trim(),
          brand: selectedPreset?.id ?? "generic_rtsp",
          rtsp_url: rtspUrl,
          sub_rtsp_url: buildSubUrl(),
          channel,
          enabled: true,
        });
      }
      setStep("done");
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  // ---- Step: Method selection -------------------------------------------

  if (step === "method") {
    return (
      <ModalShell title="Step 1 of 3 — How do you want to add your camera?" onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          <MethodCard
            icon="🔍"
            title="Auto-discover (ONVIF)"
            description="Scan your network for ONVIF-compatible cameras and DVRs. Supports most modern IP cameras."
            selected={method === "onvif"}
            onClick={() => setMethod("onvif")}
          />
          <MethodCard
            icon="📋"
            title="Brand preset"
            description="Choose your camera brand and enter IP + credentials. The RTSP URL is built automatically."
            selected={method === "preset"}
            onClick={() => setMethod("preset")}
          />
          <MethodCard
            icon="✏️"
            title="Manual RTSP URL"
            description="Enter the full RTSP stream URL directly. Use this if you know your URL or your brand isn't listed."
            selected={method === "manual"}
            onClick={() => setMethod("manual")}
          />
        </div>

        {method === "onvif" && (
          <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--bg-1)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: "0.5rem" }}>
              ONVIF WS-Discovery will multicast to all devices on your LAN. Make sure your gateway server and the cameras are on the same network.
            </div>
            <button className="btn-primary" onClick={handleDiscover} disabled={discovering} style={{ fontSize: 12 }}>
              {discovering ? "⏳ Scanning…" : "🔍 Scan Now"}
            </button>
            {discovered.length > 0 && (
              <div style={{ marginTop: "0.75rem" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "0.3rem" }}>Found {discovered.length} device(s)</div>
                {discovered.map((d) => (
                  <div
                    key={d}
                    onClick={() => {
                      // Extract IP from XAddr URL
                      const m = d.match(/(\d+\.\d+\.\d+\.\d+)/);
                      if (m?.[1]) setIp(m[1]);
                      setMethod("preset");
                      setStep("configure");
                    }}
                    style={{ padding: "0.4rem 0.5rem", background: "var(--bg-2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 12, marginBottom: "0.3rem", fontFamily: "monospace" }}
                  >
                    {d}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {err && <div style={{ color: "var(--error, #f87171)", fontSize: 12, marginTop: "0.5rem" }}>{err}</div>}

        <BtnRow>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => setStep("configure")}
            disabled={!method}
          >
            Next →
          </button>
        </BtnRow>
      </ModalShell>
    );
  }

  // ---- Step: Configure --------------------------------------------------

  if (step === "configure") {
    return (
      <ModalShell
        title={`Step 2 of 3 — ${method === "manual" ? "Enter RTSP URL" : "Configure your camera"}`}
        onClose={onClose}
      >
        {method === "manual" ? (
          <>
            <Inp label="Main stream RTSP URL" value={manualRtsp} onChange={setManualRtsp} placeholder="rtsp://admin:pass@192.168.1.x:554/..." />
            <Inp label="Sub stream RTSP URL (optional)" value={manualSub} onChange={setManualSub} placeholder="rtsp://admin:pass@192.168.1.x:554/..." />
          </>
        ) : (
          <>
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>Brand</div>
              <select
                className="input"
                value={selectedPreset?.id ?? ""}
                onChange={(e) => {
                  const p = BRAND_PRESETS.find((b) => b.id === e.target.value);
                  setSelectedPreset(p ?? null);
                  if (p) setUser(p.defaultUser);
                }}
                style={{ width: "100%", cursor: "pointer" }}
              >
                <option value="">— Select brand —</option>
                {BRAND_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            {selectedPreset?.notes && (
              <div style={{ padding: "0.5rem 0.75rem", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text)", marginBottom: "0.75rem" }}>
                ℹ️ {selectedPreset.notes}
              </div>
            )}
            <Inp label="DVR/NVR/Camera IP address" value={ip} onChange={setIp} placeholder="192.168.1.x" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <Inp label="Username" value={user} onChange={setUser} placeholder="admin" />
              <Inp label="Password" value={pass} onChange={setPass} placeholder="" type="password" />
            </div>
            <Inp label="Channel number" value={String(channel)} onChange={(v) => setChannel(Math.max(1, parseInt(v) || 1))} placeholder="1" type="number" />

            {buildRtspUrl() && (
              <div style={{ marginTop: "0.25rem", padding: "0.5rem 0.75rem", background: "var(--bg-1)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", fontFamily: "monospace", fontSize: 11, color: "var(--text-dim)", wordBreak: "break-all" }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>Preview: </span>{buildRtspUrl()}
              </div>
            )}
          </>
        )}

        <BtnRow>
          <button className="btn-ghost" onClick={() => setStep("method")}>← Back</button>
          <button
            className="btn-primary"
            onClick={() => { setErr(null); setStep("name-test"); }}
            disabled={method === "preset" ? (!selectedPreset || !ip.trim()) : !manualRtsp.trim()}
          >
            Next →
          </button>
        </BtnRow>
      </ModalShell>
    );
  }

  // ---- Step: Name + test -----------------------------------------------

  if (step === "name-test") {
    return (
      <ModalShell title="Step 3 of 3 — Name and test your camera" onClose={onClose}>
        <Inp label="Camera name" value={name} onChange={setName} placeholder="Office camera" />

        <div style={{ marginTop: "0.5rem", marginBottom: "1rem" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>
            Connection test (optional but recommended)
          </div>
          <button className="btn-ghost" onClick={handleTestSnapshot} disabled={testing} style={{ fontSize: 12 }}>
            {testing ? "⏳ Connecting…" : "📷 Test snapshot"}
          </button>
          {snapshotOk === true && snapshotUrl && (
            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ fontSize: 12, color: "#4ade80", marginBottom: "0.3rem" }}>✅ Connection successful!</div>
              <img src={snapshotUrl} alt="Snapshot" style={{ width: "100%", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }} />
            </div>
          )}
          {snapshotOk === false && (
            <div style={{ marginTop: "0.5rem", fontSize: 12, color: "var(--error, #f87171)" }}>
              ❌ Snapshot failed. Check the IP, username, password, and that the DVR's RTSP port is not blocked.
            </div>
          )}
        </div>

        {err && <div style={{ color: "var(--error, #f87171)", fontSize: 12, marginBottom: "0.75rem" }}>{err}</div>}

        <BtnRow>
          <button className="btn-ghost" onClick={() => setStep("configure")}>← Back</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "✅ Add Camera"}
          </button>
        </BtnRow>
      </ModalShell>
    );
  }

  // ---- Step: Done -------------------------------------------------------

  return (
    <ModalShell title="Camera added!" onClose={onAdded}>
      <div style={{ textAlign: "center", padding: "1rem 0" }}>
        <div style={{ fontSize: 44, marginBottom: "0.5rem" }}>🎉</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem" }}>"{name}" has been added</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: "1.5rem" }}>
          Click the camera card to open the live view. To add more cameras, run the wizard again.
        </div>
        <button className="btn-primary" onClick={onAdded}>Open Security Cameras</button>
      </div>
    </ModalShell>
  );
}

// ---- Method card -------------------------------------------------------

function MethodCard({ icon, title, description, selected, onClick }: { icon: string; title: string; description: string; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        gap: "0.85rem",
        padding: "0.85rem 1rem",
        background: selected ? "rgba(var(--accent-rgb, 99,102,241), 0.12)" : "var(--bg-1)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        transition: "all 0.12s",
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1.3, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{description}</div>
      </div>
    </div>
  );
}
