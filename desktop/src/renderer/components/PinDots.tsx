/**
 * PinDots: visual indicator of how many digits the user has entered.
 *
 * Pure display — typing is handled by the parent's <input>. Dots fill from
 * left to right with a subtle pop animation so each keystroke feels confirmed.
 */
import { motion } from "framer-motion";

export function PinDots({
  length,
  filled,
}: {
  length: number;
  filled: number;
}) {
  return (
    <div style={{ display: "flex", gap: "0.55rem", justifyContent: "center" }}>
      {Array.from({ length }).map((_, i) => {
        const isFilled = i < filled;
        return (
          <motion.span
            key={i}
            animate={{
              scale: isFilled ? 1 : 0.65,
              backgroundColor: isFilled ? "var(--accent)" : "rgba(255,255,255,0.08)",
              boxShadow: isFilled
                ? "0 0 12px var(--accent-glow)"
                : "0 0 0 transparent",
            }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              display: "inline-block",
            }}
          />
        );
      })}
    </div>
  );
}
