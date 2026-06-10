/**
 * Hue Pairing Wizard
 *
 * Multi-step flow: Discover → Press link button (30s countdown + 2s polling)
 * → Success.
 *
 * Reached from Settings → Hue card → "Re-pair bridge" button.
 * Admin-only (enforced server-side too, but we only render this for admins).
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { api } from "../lib/api";
import type { HueBridgeCandidate } from "@shared/types";

type Step = "discover" | "pick" | "linking" | "success" | "error";

interface HueWizardProps {
  onDone: () => void;
}

export function HuePairingWizard({ onDone }: HueWizardProps) {
  const [step, setStep] = useState<Step>("discover");
  const [candidates, setCandidates] = useState<HueBridgeCandidate[]>([]);
  const [manualIp, setManualIp] = useState("");
  const [selectedIp, setSelectedIp] = useState("");
  const [countdown, setCountdown] = useState(30);
  const [errorMsg, setErrorMsg] = useState("");
  const [discovering, setDiscovering] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTimers() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    pollRef.current = null;
    timerRef.current = null;
  }

  // Cleanup on unmount
  useEffect(() => () => stopTimers(), []);

  async function discover() {
    setDiscovering(true);
    setErrorMsg("");
    try {
      const result = await api.discoverHue();
      setCandidates(result.candidates);
      setStep("pick");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Discovery failed");
      setStep("error");
    } finally {
      setDiscovering(false);
    }
  }

  function startLinking(ip: string) {
    setSelectedIp(ip);
    setCountdown(30);
    setStep("linking");

    // 30-second countdown
    let remaining = 30;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        stopTimers();
        setErrorMsg("Timed out — link button was not pressed within 30 seconds.");
        setStep("error");
      }
    }, 1000);

    // Poll every 2 seconds
    pollRef.current = setInterval(() => {
      void attemptPair(ip);
    }, 2000);
  }

  async function attemptPair(ip: string) {
    try {
      const result = await api.pairHue(ip);
      if (result.applicationKey) {
        stopTimers();
        setStep("success");
      }
      // If pending: true, keep polling
    } catch {
      // Don't abort on transient errors — bridge might be briefly unavailable
    }
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <AnimatePresence mode="wait">
        {step === "discover" && (
          <WizardCard key="discover" title="Find your Hue bridge" subtitle="We'll scan your local network for Philips Hue bridges.">
            <Button onClick={() => void discover()} loading={discovering} style={{ width: "100%" }}>
              {discovering ? "Scanning…" : "Discover bridge"}
            </Button>
            <div style={{ height: "0.75rem" }} />
            <p style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", margin: 0 }}>
              Or enter the bridge IP manually below.
            </p>
          </WizardCard>
        )}

        {step === "pick" && (
          <WizardCard key="pick" title="Choose your bridge" subtitle={candidates.length === 0 ? "No bridges found automatically — enter the IP manually." : "Select the bridge to pair with."}>
            {candidates.map((c) => (
              <motion.button
                key={c.ip}
                whileHover={{ scale: 1.01 }}
                onClick={() => startLinking(c.ip)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.85rem 1rem",
                  marginBottom: "0.5rem",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                <span style={{ fontWeight: 600 }}>{c.ip}</span>
                <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: "0.5rem" }}>
                  {c.id}
                </span>
              </motion.button>
            ))}

            <div style={{ marginTop: candidates.length ? "1rem" : 0 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: "0.35rem" }}>
                Manual IP
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  placeholder="192.168.1.x"
                  spellCheck={false}
                  style={{ flex: 1 }}
                />
                <Button
                  onClick={() => { if (manualIp.trim()) startLinking(manualIp.trim()); }}
                  disabled={!manualIp.trim()}
                >
                  Connect
                </Button>
              </div>
            </div>

            <div style={{ height: "0.75rem" }} />
            <Button variant="ghost" onClick={() => setStep("discover")} style={{ width: "100%" }}>
              ← Back
            </Button>
          </WizardCard>
        )}

        {step === "linking" && (
          <WizardCard
            key="linking"
            title="Press the link button"
            subtitle={`Press the button on the top of your Hue bridge now. Pairing with ${selectedIp}.`}
          >
            <CountdownRing seconds={countdown} total={30} />
            <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-dim)", margin: "1rem 0 0" }}>
              Waiting for confirmation…
            </p>
          </WizardCard>
        )}

        {step === "success" && (
          <WizardCard key="success" title="Bridge paired! 🎉" subtitle={`Successfully connected to ${selectedIp}. Your lights are ready.`}>
            <Button onClick={onDone} style={{ width: "100%" }}>
              Done
            </Button>
          </WizardCard>
        )}

        {step === "error" && (
          <WizardCard key="error" title="Something went wrong" subtitle={errorMsg || "An unknown error occurred."}>
            <Button onClick={() => { setStep("discover"); setErrorMsg(""); }} style={{ width: "100%" }}>
              Try again
            </Button>
          </WizardCard>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Sub-components --------------------------------------------------------

function WizardCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      style={{
        width: "100%",
        maxWidth: 420,
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "2rem",
      }}
    >
      {/* Hue icon */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "linear-gradient(135deg, var(--violet), var(--cyan))",
          display: "grid",
          placeItems: "center",
          fontSize: 24,
          marginBottom: "1.2rem",
        }}
      >
        💡
      </div>
      <h2
        className="gradient-text"
        style={{ margin: "0 0 0.4rem", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}
      >
        {title}
      </h2>
      <p style={{ margin: "0 0 1.4rem", color: "var(--text-dim)", fontSize: 13, lineHeight: 1.55 }}>
        {subtitle}
      </p>
      {children}
    </motion.div>
  );
}

function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const r = 38;
  const circumference = 2 * Math.PI * r;
  const progress = (seconds / total) * circumference;
  const colour = seconds > 10 ? "var(--cyan)" : seconds > 5 ? "var(--violet)" : "var(--danger)";

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <svg width={100} height={100} style={{ transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle cx={50} cy={50} r={r} fill="none" stroke="var(--border-strong)" strokeWidth={5} />
        {/* Progress */}
        <motion.circle
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          animate={{ strokeDashoffset: circumference - progress, stroke: colour }}
          transition={{ duration: 0.8, ease: "linear" }}
        />
      </svg>
      {/* Label in centre */}
      <div
        style={{
          position: "absolute",
          fontSize: 20,
          fontWeight: 700,
          color: "var(--text)",
          marginTop: 38,
          lineHeight: 1,
        }}
      >
        {seconds}
      </div>
    </div>
  );
}
