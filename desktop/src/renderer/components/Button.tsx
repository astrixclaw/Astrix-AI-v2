/**
 * Buttons.
 *
 * Two variants — primary (filled, gradient) and ghost (outline-ish). Both use
 * framer-motion for hover/tap micro-interactions so the UI feels alive without
 * a heavy component library.
 */
import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";

interface Props extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

const baseStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  padding: "0.7rem 1.1rem",
  borderRadius: "var(--radius-md)",
  fontWeight: 600,
  fontSize: 14,
  letterSpacing: "0.01em",
  cursor: "pointer",
  border: "1px solid transparent",
  transition: "background 160ms var(--ease-out), border-color 160ms var(--ease-out)",
};

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    background:
      "linear-gradient(135deg, var(--violet), var(--accent), var(--cyan))",
    color: "#0b0d12",
    boxShadow: "var(--shadow-glow)",
  },
  ghost: {
    background: "transparent",
    border: "1px solid var(--border-strong)",
    color: "var(--text)",
  },
  danger: {
    background: "transparent",
    border: "1px solid rgba(255,107,107,0.4)",
    color: "var(--danger)",
  },
};

export function Button({
  variant = "primary",
  loading,
  disabled,
  children,
  style,
  ...rest
}: Props) {
  return (
    <motion.button
      whileHover={!disabled && !loading ? { y: -1, scale: 1.01 } : undefined}
      whileTap={!disabled && !loading ? { scale: 0.98 } : undefined}
      disabled={disabled || loading}
      style={{
        ...baseStyle,
        ...variantStyles[variant],
        opacity: disabled || loading ? 0.55 : 1,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        ...style,
      }}
      {...rest}
    >
      {loading && (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
          style={{
            width: 14,
            height: 14,
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            borderRadius: "50%",
            display: "inline-block",
          }}
        />
      )}
      {children}
    </motion.button>
  );
}
