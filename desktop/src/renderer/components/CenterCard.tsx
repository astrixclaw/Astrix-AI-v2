/**
 * Centered glassmorphism card used by pre-auth screens (splash, login, setup,
 * "fix the backend URL"). Subtle entrance animation; otherwise out of the way.
 */
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  maxWidth?: number;
}

export function CenterCard({ children, maxWidth = 380 }: Props) {
  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: "100%",
          maxWidth,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
          border: "1px solid var(--border)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderRadius: "var(--radius-xl)",
          padding: "2.25rem 2rem",
          boxShadow: "var(--shadow-2)",
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
