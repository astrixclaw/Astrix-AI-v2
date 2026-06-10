/**
 * The Astrix sigil — an animated SVG mark.
 *
 * Why SVG instead of the icon-1024.png?
 *  - infinitely scalable, no aliasing on hi-DPI
 *  - we can animate the rays
 *  - tiny payload
 *
 * Shape: an eight-pointed star (the asterisk that Astrix's name comes from)
 * with a soft glow. On hover or while loading we slow-rotate.
 */
import { motion } from "framer-motion";

interface Props {
  size?: number;
  /** When true, the sigil slowly rotates. Used for the splash screen. */
  spinning?: boolean;
  className?: string;
}

export function Sigil({ size = 56, spinning = false, className }: Props) {
  return (
    <motion.svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-label="Astrix sigil"
      animate={spinning ? { rotate: 360 } : { rotate: 0 }}
      transition={
        spinning
          ? { repeat: Infinity, duration: 18, ease: "linear" }
          : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
      }
      style={{
        filter: "drop-shadow(0 0 16px rgba(122,167,255,0.55))",
      }}
    >
      <defs>
        <linearGradient id="sigil-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a48bff" />
          <stop offset="55%" stopColor="#7aa7ff" />
          <stop offset="100%" stopColor="#7df0e0" />
        </linearGradient>
        <radialGradient id="sigil-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#a48bff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#7df0e0" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* glow halo */}
      <circle cx="50" cy="50" r="36" fill="url(#sigil-core)" />

      {/* primary asterisk: 4 rays */}
      <g stroke="url(#sigil-grad)" strokeWidth="6" strokeLinecap="round">
        <line x1="50" y1="10" x2="50" y2="90" />
        <line x1="10" y1="50" x2="90" y2="50" />
        <line x1="20" y1="20" x2="80" y2="80" />
        <line x1="80" y1="20" x2="20" y2="80" />
      </g>

      {/* small inner sparkle */}
      <circle cx="50" cy="50" r="5" fill="#ffffff" />
    </motion.svg>
  );
}
