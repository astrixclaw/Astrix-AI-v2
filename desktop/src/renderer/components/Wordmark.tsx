/**
 * Wordmark: sigil + the "Astrix Home" lockup.
 *
 * Used on the splash screen and the login screen. Top bar uses just the
 * Sigil at small size to save horizontal space.
 */
import { Sigil } from "./Sigil";

interface Props {
  sigilSize?: number;
  textSize?: number;
  spinning?: boolean;
}

export function Wordmark({
  sigilSize = 56,
  textSize = 26,
  spinning = false,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.85rem",
      }}
    >
      <Sigil size={sigilSize} spinning={spinning} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          lineHeight: 1,
        }}
      >
        <span
          className="gradient-text"
          style={{
            fontSize: textSize,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Astrix
        </span>
        <span
          style={{
            fontSize: Math.round(textSize * 0.42),
            fontWeight: 500,
            color: "var(--text-dim)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginTop: "0.3rem",
          }}
        >
          Home
        </span>
      </div>
    </div>
  );
}
