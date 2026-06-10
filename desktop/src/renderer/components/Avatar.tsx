/**
 * Avatar: shows the user's uploaded picture (cropped, circular) and falls
 * back to the deterministic gradient + initial when no file exists.
 *
 * We bump a query-string version with the username so the browser cache
 * invalidates whenever the parent passes a new `version` prop (set after a
 * fresh upload).
 */
import { useEffect, useState } from "react";
import { getBaseUrl } from "../lib/api";

interface Props {
  userId: string;
  username: string;
  size?: number;
  /** Optional cache-buster; bump after the user uploads a new avatar. */
  version?: number;
}

/** Deterministic gradient avatar based on the username — same algorithm as GroupChat. */
function gradientFor(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) {
    h = (h * 31 + username.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 70%), hsl(${(hue + 50) % 360} 70% 60%))`;
}

export function Avatar({ userId, username, size = 32, version = 0 }: Props) {
  const [failed, setFailed] = useState(false);

  // Whenever userId or version changes, give the <img> another shot.
  useEffect(() => {
    setFailed(false);
  }, [userId, version]);

  const initial = username.charAt(0).toUpperCase();
  const url = `${getBaseUrl()}/api/users/${userId}/avatar${version ? `?v=${version}` : ""}`;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: gradientFor(username),
        display: "grid",
        placeItems: "center",
        fontWeight: 700,
        color: "#0b0d12",
        fontSize: Math.round(size * 0.42),
        overflow: "hidden",
        flexShrink: 0,
      }}
      aria-label={`${username}'s avatar`}
    >
      {failed ? (
        <span>{initial}</span>
      ) : (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
    </div>
  );
}
