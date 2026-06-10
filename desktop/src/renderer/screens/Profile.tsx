/**
 * Profile screen — every signed-in user can edit *their own*:
 *   - Avatar (upload / clear)
 *   - PIN (4–12 digits)
 *
 * This is the "self-serve" entry point. Admins can still edit anyone via the
 * Admin panel, but every member should be able to change their own avatar
 * without needing admin to do it for them.
 */
import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { Avatar as UserAvatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export function Profile() {
  const { user, bumpAvatarVersion, avatarVersion } = useAuth();

  if (!user) return null;

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "2rem 2.5rem",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1
          className="gradient-text"
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "0 0 0.4rem",
          }}
        >
          Your profile
        </h1>
        <p style={{ color: "var(--text-dim)", margin: "0 0 2rem", fontSize: 13 }}>
          Signed in as <strong>{user.username}</strong>
          {user.is_admin ? " (admin)" : ""}
        </p>

        <ProfileCard title="Avatar">
          <AvatarSection
            avatarVersion={avatarVersion}
            userId={user.id}
            username={user.username}
            onChanged={bumpAvatarVersion}
          />
        </ProfileCard>

        <ProfileCard title="PIN">
          <PinSection />
        </ProfileCard>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------

function ProfileCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "1.4rem 1.6rem",
        marginBottom: "1.1rem",
      }}
    >
      <h2
        style={{
          margin: "0 0 1rem",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-dim)",
        }}
      >
        {title}
      </h2>
      {children}
    </motion.div>
  );
}

// ----------------------------------------------------------------------

function AvatarSection({
  avatarVersion,
  userId,
  username,
  onChanged,
}: {
  avatarVersion: number;
  userId: string;
  username: string;
  onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await api.uploadOwnAvatar(file);
      onChanged();
      setStatus("Avatar updated");
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "upload_failed");
    } finally {
      setBusy(false);
      e.target.value = "";
      window.setTimeout(() => setStatus(null), 2500);
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await api.deleteOwnAvatar();
      onChanged();
      setStatus("Avatar removed");
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "delete_failed");
    } finally {
      setBusy(false);
      window.setTimeout(() => setStatus(null), 2500);
    }
  }

  return (
    <div style={{ display: "flex", gap: "1.4rem", alignItems: "center" }}>
      <UserAvatar
        userId={userId}
        username={username}
        size={80}
        version={avatarVersion}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        <div style={{ display: "flex", gap: "0.55rem" }}>
          <Button
            variant="primary"
            onClick={() => fileRef.current?.click()}
            loading={busy}
          >
            Change picture
          </Button>
          <Button variant="ghost" onClick={() => void clear()} disabled={busy}>
            Remove
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => void onPick(e)}
        />
        <p style={{ color: "var(--text-faint)", fontSize: 12, margin: 0 }}>
          JPEG, PNG, or WebP. Resized to 256×256 automatically.
        </p>
        {status && (
          <span style={{ color: "var(--accent)", fontSize: 12 }}>{status}</span>
        )}
        {error && (
          <span style={{ color: "var(--danger)", fontSize: 12 }}>
            {avatarError(error)}
          </span>
        )}
      </div>
    </div>
  );
}

function avatarError(code: string): string {
  switch (code) {
    case "bad_image":
      return "That image couldn't be processed.";
    case "too_large":
      return "File is too big (5 MB max).";
    case "no_file":
      return "Pick a file to upload.";
    default:
      return code.replace(/_/g, " ");
  }
}

// ----------------------------------------------------------------------

function PinSection() {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function pinOk(s: string): boolean {
    return /^\d{4,12}$/.test(s);
  }

  async function save() {
    setError(null);
    setStatus(null);
    if (!pinOk(pin)) {
      setError("PIN must be 4–12 digits.");
      return;
    }
    if (pin !== confirm) {
      setError("PINs don't match.");
      return;
    }
    setBusy(true);
    try {
      await api.setOwnPin(pin);
      setPin("");
      setConfirm("");
      setStatus("PIN updated");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.code.replace(/_/g, " ") : "update_failed",
      );
    } finally {
      setBusy(false);
      window.setTimeout(() => setStatus(null), 2500);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem", maxWidth: 360 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>New PIN</span>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
          placeholder="4–12 digits"
          inputMode="numeric"
          autoComplete="new-password"
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Confirm PIN</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 12))}
          placeholder="Repeat"
          inputMode="numeric"
          autoComplete="new-password"
        />
      </label>
      <div style={{ display: "flex", gap: "0.55rem", alignItems: "center" }}>
        <Button
          variant="primary"
          onClick={() => void save()}
          loading={busy}
          disabled={!pinOk(pin) || pin !== confirm}
        >
          Update PIN
        </Button>
        {status && (
          <span style={{ color: "var(--accent)", fontSize: 12 }}>{status}</span>
        )}
        {error && (
          <span style={{ color: "var(--danger)", fontSize: 12 }}>{error}</span>
        )}
      </div>
    </div>
  );
}
