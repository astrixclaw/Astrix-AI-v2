/**
 * First-launch setup wizard.
 *
 * Two steps:
 *   1. Pick the admin username.
 *   2. Choose a PIN (entered twice).
 *
 * On submit we hit /api/setup which creates the admin user, returns a
 * session token, and the auth context drops us into the main UI.
 */
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Button } from "../components/Button";
import { CenterCard } from "../components/CenterCard";
import { PinDots } from "../components/PinDots";
import { Wordmark } from "../components/Wordmark";
import { useAuth } from "../lib/auth";

// Variable-length PINs: 4 to 12 digits, matching the backend validator.
const PIN_MIN = 4;
const PIN_MAX = 12;

export function Setup() {
  const { runSetup } = useAuth();
  const [step, setStep] = useState<0 | 1>(0);
  const [username, setUsername] = useState("si");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function digitsOnly(s: string) {
    return s.replace(/\D/g, "").slice(0, PIN_MAX);
  }

  async function onCreate() {
    setError(null);
    if (pin.length < PIN_MIN) {
      setError(`PIN must be at least ${PIN_MIN} digits.`);
      return;
    }
    if (pin !== confirm) {
      setError("PINs don't match.");
      return;
    }
    setBusy(true);
    try {
      await runSetup(username.trim(), pin);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed.");
      setBusy(false);
    }
  }

  return (
    <CenterCard maxWidth={420}>
      <div style={{ marginBottom: "1.4rem", display: "grid", placeItems: "center" }}>
        <Wordmark sigilSize={56} textSize={26} />
      </div>

      <h2 style={{ margin: "0 0 0.4rem", fontSize: 19, fontWeight: 600 }}>
        Welcome
      </h2>
      <p
        style={{
          margin: "0 0 1.4rem",
          color: "var(--text-dim)",
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        Let's set up the admin account. You'll be able to add other household
        members later.
      </p>

      <AnimatePresence mode="wait">
        {step === 0 ? (
          <motion.div
            key="step-username"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22 }}
          >
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-dim)",
                marginBottom: "0.4rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Admin username
            </label>
            <input
              autoFocus
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              maxLength={32}
              spellCheck={false}
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter" && username.trim()) setStep(1);
              }}
            />
            <Button
              onClick={() => username.trim() && setStep(1)}
              disabled={!username.trim()}
              style={{ width: "100%", marginTop: "1.2rem" }}
            >
              Next
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="step-pin"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22 }}
          >
            <p
              style={{
                margin: "0 0 0.6rem",
                fontSize: 13,
                color: "var(--text-dim)",
              }}
            >
              Choose a {PIN_MIN}–{PIN_MAX} digit PIN for{" "}
              <strong style={{ color: "var(--text)" }}>{username}</strong>.
            </p>

            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(digitsOnly(e.target.value))}
              placeholder="••••"
              style={{ textAlign: "center", letterSpacing: "0.5em", fontSize: 18 }}
              maxLength={PIN_MAX}
            />
            <div style={{ margin: "0.6rem 0 1rem" }}>
              <PinDots
                length={Math.max(PIN_MIN, pin.length || PIN_MIN)}
                filled={pin.length}
              />
            </div>

            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-dim)",
                marginBottom: "0.4rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Confirm PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              value={confirm}
              onChange={(e) => setConfirm(digitsOnly(e.target.value))}
              placeholder="••••"
              style={{ textAlign: "center", letterSpacing: "0.5em", fontSize: 18 }}
              maxLength={PIN_MAX}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onCreate();
              }}
            />

            {error && (
              <p style={{ marginTop: "0.75rem", color: "var(--danger)", fontSize: 12 }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.6rem", marginTop: "1.2rem" }}>
              <Button
                variant="ghost"
                onClick={() => setStep(0)}
                style={{ flex: 1 }}
              >
                Back
              </Button>
              <Button
                onClick={() => void onCreate()}
                loading={busy}
                style={{ flex: 2 }}
              >
                Create account
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </CenterCard>
  );
}
