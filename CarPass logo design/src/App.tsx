export default function App() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0d1117 0%, #161d27 50%, #0f1a2e 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "64px",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      {/* Main logo — full colour on dark */}
      <LogoLockup variant="full" />

      {/* Horizontal divider */}
      <div style={{ width: 1, height: 64, background: "rgba(255,255,255,0.08)" }} />

      {/* Monochrome light variant on a card */}
      <div
        style={{
          background: "#f4f6fa",
          borderRadius: 20,
          padding: "40px 56px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
        }}
      >
        <LogoLockup variant="light" />
        <LogoLockup variant="icon-only" />
      </div>

      {/* Label */}
      <p
        style={{
          color: "rgba(255,255,255,0.25)",
          fontSize: 11,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          fontFamily: "'DM Mono', monospace",
        }}
      >
        CarPass — Autóátvizsgáló rendszer
      </p>
    </div>
  )
}

/* ─── CarPass Shield + Wordmark ─────────────────────────────────────── */

type Variant = "full" | "light" | "icon-only"

function LogoLockup({ variant }: { variant: Variant }) {
  const isDark = variant === "full"
  const textColor = isDark ? "#ffffff" : "#0d1117"
  const subColor = isDark ? "#22d3a5" : "#0a9e76"
  const iconOnly = variant === "icon-only"

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: iconOnly ? 0 : 18,
      }}
    >
      <CarPassMark scale={iconOnly ? 1.4 : 1} />

      {!iconOnly && (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span
            style={{
              color: textColor,
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            Car
            <span
              style={{
                color: isDark ? "#22d3a5" : "#0a9e76",
              }}
            >
              Pass
            </span>
          </span>
          <span
            style={{
              color: isDark ? "rgba(255,255,255,0.38)" : "rgba(13,17,23,0.42)",
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              fontFamily: "'DM Mono', monospace",
              marginTop: 5,
            }}
          >
            Járműátvizsgálás
          </span>
        </div>
      )}
    </div>
  )
}

/* ─── Logomark: shield with road + checkmark ─────────────────────────── */

function CarPassMark({ scale = 1 }: { scale?: number }) {
  const W = 52 * scale
  const H = 58 * scale

  return (
    <svg
      width={W}
      height={H}
      viewBox="0 0 52 58"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Shield body — gradient */}
      <defs>
        <linearGradient id="shieldGrad" x1="0" y1="0" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1a7cff" />
          <stop offset="100%" stopColor="#0a4fcc" />
        </linearGradient>
        <linearGradient id="accentGrad" x1="0" y1="0" x2="52" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22d3a5" />
          <stop offset="100%" stopColor="#16b28a" />
        </linearGradient>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Shield outline */}
      <path
        d="M26 1.5L3 10.2v16.5C3 39.3 13.1 51.1 26 54.5 38.9 51.1 49 39.3 49 26.7V10.2L26 1.5Z"
        fill="url(#shieldGrad)"
      />
      {/* Shield inner rim */}
      <path
        d="M26 5.5L6.5 13.2v13.5C6.5 37.5 15.3 48.1 26 51 36.7 48.1 45.5 37.5 45.5 26.7V13.2L26 5.5Z"
        fill="rgba(255,255,255,0.07)"
      />

      {/* Car silhouette — simplified top profile */}
      <g transform="translate(12, 20)">
        {/* Car body */}
        <path
          d="M2 10 L4 6 Q5.5 3.5 9 3 L19 3 Q22.5 3.5 24 6 L26 10 L27 10 Q28.2 10 28.2 11.2 L28.2 14 Q28.2 15 27 15 L1 15 Q0 15 0 14 L0 11.2 Q0 10 1 10 Z"
          fill="rgba(255,255,255,0.9)"
        />
        {/* Windshield */}
        <path
          d="M5.5 9.5 L7.5 5.2 Q8.2 4 9.5 3.8 L18.5 3.8 Q19.8 4 20.5 5.2 L22.5 9.5 Z"
          fill="rgba(34, 211, 165, 0.85)"
        />
        {/* Wheels */}
        <circle cx="6" cy="15" r="3.5" fill="#0d1a35" />
        <circle cx="6" cy="15" r="2" fill="#4a7fff" />
        <circle cx="22" cy="15" r="3.5" fill="#0d1a35" />
        <circle cx="22" cy="15" r="2" fill="#4a7fff" />
        {/* Speed stripes on lower body */}
        <rect x="8" y="11" width="12" height="1.2" rx="0.6" fill="rgba(255,255,255,0.15)" />
      </g>

      {/* Checkmark badge — bottom-right corner */}
      <circle cx="40" cy="44" r="10" fill="#0d1117" />
      <circle cx="40" cy="44" r="8.5" fill="url(#accentGrad)" filter="url(#glow)" />
      <path
        d="M35.5 44 L38.5 47 L44.5 41"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
