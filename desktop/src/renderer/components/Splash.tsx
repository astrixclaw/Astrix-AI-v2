/**
 * Splash screen.
 *
 * Visible for the brief window between app launch and the first real screen
 * (login, setup wizard, or main UI). Slow-spinning sigil + fade.
 */
import { motion } from "framer-motion";
import { Wordmark } from "./Wordmark";

export function Splash({ status }: { status?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "var(--bg-1)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.5rem",
        }}
      >
        <Wordmark spinning sigilSize={72} textSize={34} />
        {status && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            style={{
              color: "var(--text-dim)",
              fontSize: 13,
              letterSpacing: "0.04em",
            }}
          >
            {status}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
