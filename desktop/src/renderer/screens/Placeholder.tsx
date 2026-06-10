/**
 * Generic "this view will arrive in a later phase" placeholder.
 * Used by lighting / group / admin / settings until their real screens land.
 */
import { motion } from "framer-motion";
import { Sigil } from "../components/Sigil";

interface Props {
  title: string;
  message: string;
}

export function Placeholder({ title, message }: Props) {
  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ textAlign: "center", maxWidth: 360 }}
      >
        <Sigil size={56} />
        <h1
          className="gradient-text"
          style={{
            margin: "0.8rem 0 0.4rem",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.55 }}>
          {message}
        </p>
      </motion.div>
    </div>
  );
}
