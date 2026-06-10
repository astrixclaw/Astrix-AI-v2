/**
 * Login screen.
 *
 * Username + 4-digit PIN. We never tell the user *which* part is wrong on a
 * 401 — the backend uses one generic error and we surface it as a single
 * "incorrect username or PIN" line.
 */
import { motion } from "framer-motion";
import { useState } from "react";
import { Button } from "../components/Button";
import { CenterCard } from "../components/CenterCard";
import { PinDots } from "../components/PinDots";
import { Wordmark } from "../components/Wordmark";
import { useAuth } from "../lib/auth";

const PIN_LEN = 4;

export function Login() {
  const { signIn, config } = useAuth();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function digitsOnly(s: string) {
    return s.replace(/\D/g, "").slice(0, PIN_LEN);
  }

  async function onSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signIn(username.trim(), pin);
    } catch {
      setError("Incorrect username or PIN.");
      setPin("");
      setBusy(false);
    }
  }

  const canSubmit = username.trim().length > 0 && pin.length === PIN_LEN;

  return (
    <CenterCard>
      <div style={{ marginBottom: "1.6rem", display: "grid", placeItems: "center" }}>
        <Wordmark sigilSize={56} textSize={26} />
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
        Username
      </label>
      <input
        autoFocus
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase())}
        maxLength={32}
        spellCheck={false}
        autoComplete="username"
        onKeyDown={(e) => {
          // Move focus to PIN input on Enter when username is filled
          if (e.key === "Enter" && username.trim()) {
            (document.getElementById("pin-input") as HTMLInputElement | null)?.focus();
          }
        }}
      />

      <label
        htmlFor="pin-input"
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-dim)",
          margin: "1.1rem 0 0.4rem",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        PIN
      </label>
      <input
        id="pin-input"
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={(e) => setPin(digitsOnly(e.target.value))}
        placeholder="••••"
        style={{ textAlign: "center", letterSpacing: "0.5em", fontSize: 18 }}
        maxLength={PIN_LEN}
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit) void onSignIn();
        }}
      />
      <div style={{ margin: "0.6rem 0 0.4rem" }}>
        <PinDots length={PIN_LEN} filled={pin.length} />
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginTop: "0.6rem",
            color: "var(--danger)",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {error}
        </motion.p>
      )}

      <Button
        variant="primary"
        loading={busy}
        disabled={!canSubmit}
        onClick={() => void onSignIn()}
        style={{ width: "100%", marginTop: "1.2rem" }}
      >
        Sign in
      </Button>

      <p
        style={{
          marginTop: "1.2rem",
          fontSize: 11,
          color: "var(--text-faint)",
          textAlign: "center",
        }}
      >
        connected to {config?.backendUrl}
      </p>
    </CenterCard>
  );
}
