/**
 * "Where is the backend?" screen.
 *
 * Shown when the initial probe fails. The user enters / fixes the URL and
 * we retry. Defaults to whatever is currently in config so re-opening it on
 * a working install just shows the current value.
 */
import { useState } from "react";
import { CenterCard } from "../components/CenterCard";
import { Button } from "../components/Button";
import { Wordmark } from "../components/Wordmark";
import { useAuth } from "../lib/auth";

export function ConfigBackend() {
  const { config, error, setConfig } = useAuth();
  const [url, setUrl] = useState(config?.backendUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(error);

  async function onSave() {
    setBusy(true);
    setHint(null);
    try {
      await setConfig({ backendUrl: url.trim() });
    } catch (e) {
      setHint(e instanceof Error ? e.message : "Could not reach backend");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenterCard>
      <div style={{ marginBottom: "1.5rem", display: "grid", placeItems: "center" }}>
        <Wordmark sigilSize={56} textSize={26} />
      </div>
      <h2 style={{ margin: "0 0 0.4rem", fontSize: 18, fontWeight: 600 }}>
        Connect to your hub
      </h2>
      <p style={{ margin: "0 0 1.4rem", color: "var(--text-dim)", fontSize: 13 }}>
        Enter the address of the Astrix Home backend on your LAN. You can change
        this any time in Settings.
      </p>

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
        Backend URL
      </label>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="http://192.168.1.74:18800"
        spellCheck={false}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") void onSave();
        }}
      />

      {hint && (
        <p style={{ marginTop: "0.75rem", color: "var(--danger)", fontSize: 12 }}>
          {hint}
        </p>
      )}

      <Button
        variant="primary"
        loading={busy}
        onClick={() => void onSave()}
        style={{ width: "100%", marginTop: "1.4rem" }}
      >
        Connect
      </Button>
    </CenterCard>
  );
}
