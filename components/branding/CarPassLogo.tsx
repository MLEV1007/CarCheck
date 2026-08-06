import { outfit, dmMono } from './fonts';

interface CarPassMarkProps {
  /** Az ikon MAGASSÁGA px-ben -- a szélesség a natív 52:58 arányból számolódik. */
  size?: number;
  className?: string;
}

/**
 * CarPass logómárka -- pajzs + autó-sziluett + zöld pipa-jelvény.
 *
 * Forrás: a felhasználó által mellékelt referencia-design (Figma Make export,
 * `CarPass logo design/src/App.tsx`, `CarPassMark` komponens) -- az SVG-jelölés
 * 1:1 átemelve onnan, csak a gradiens/szűrő `id`-k lettek `carpass-`-előtaggal
 * névtér-ütközés ellen védve (több `<svg>` egy DOM-on belüli előfordulása esetén
 * a duplikált `id` némely böngészőben rossz renderelést okozna).
 *
 * Önálló, fix színvilágú (kék pajzs-gradiens + zöld pipa-gradiens) -- ezért
 * VILÁGOS és SÖTÉT háttéren egyaránt jól látható, nincs külön "light"/"dark"
 * verziója (ellentétben a `CarPassLogo` szöveges wordmark-jával, ahol a szöveg
 * színe a háttértől függően vált).
 */
export function CarPassMark({ size = 32, className }: CarPassMarkProps) {
  const width = (size * 52) / 58;
  const height = size;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 52 58"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="carpass-shield-grad" x1="0" y1="0" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1a7cff" />
          <stop offset="100%" stopColor="#0a4fcc" />
        </linearGradient>
        <linearGradient id="carpass-accent-grad" x1="0" y1="0" x2="52" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22d3a5" />
          <stop offset="100%" stopColor="#16b28a" />
        </linearGradient>
        <filter id="carpass-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Pajzs kontúr */}
      <path
        d="M26 1.5L3 10.2v16.5C3 39.3 13.1 51.1 26 54.5 38.9 51.1 49 39.3 49 26.7V10.2L26 1.5Z"
        fill="url(#carpass-shield-grad)"
      />
      {/* Pajzs belső perem */}
      <path
        d="M26 5.5L6.5 13.2v13.5C6.5 37.5 15.3 48.1 26 51 36.7 48.1 45.5 37.5 45.5 26.7V13.2L26 5.5Z"
        fill="rgba(255,255,255,0.07)"
      />

      {/* Autó-sziluett -- egyszerűsített felülnézeti profil */}
      <g transform="translate(12, 20)">
        <path
          d="M2 10 L4 6 Q5.5 3.5 9 3 L19 3 Q22.5 3.5 24 6 L26 10 L27 10 Q28.2 10 28.2 11.2 L28.2 14 Q28.2 15 27 15 L1 15 Q0 15 0 14 L0 11.2 Q0 10 1 10 Z"
          fill="rgba(255,255,255,0.9)"
        />
        <path
          d="M5.5 9.5 L7.5 5.2 Q8.2 4 9.5 3.8 L18.5 3.8 Q19.8 4 20.5 5.2 L22.5 9.5 Z"
          fill="rgba(34, 211, 165, 0.85)"
        />
        <circle cx="6" cy="15" r="3.5" fill="#0d1a35" />
        <circle cx="6" cy="15" r="2" fill="#4a7fff" />
        <circle cx="22" cy="15" r="3.5" fill="#0d1a35" />
        <circle cx="22" cy="15" r="2" fill="#4a7fff" />
        <rect x="8" y="11" width="12" height="1.2" rx="0.6" fill="rgba(255,255,255,0.15)" />
      </g>

      {/* Pipa-jelvény -- jobb alsó sarok */}
      <circle cx="40" cy="44" r="10" fill="#0d1117" />
      <circle cx="40" cy="44" r="8.5" fill="url(#carpass-accent-grad)" filter="url(#carpass-glow)" />
      <path
        d="M35.5 44 L38.5 47 L44.5 41"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

interface CarPassLogoProps {
  /**
   * `dark` -- sötét háttérre (fehér "Car" + zöld "Pass"), pl. Linear Dark navbar.
   * `light` -- világos háttérre (sötét tintakék "Car" + zöld "Pass"), pl. Stripe auth-oldalak.
   */
  variant?: 'dark' | 'light';
  /** "JÁRMŰÁTVIZSGÁLÁS" alcím megjelenítése a wordmark alatt. Alapértelmezetten látszik. */
  withSubtitle?: boolean;
  /** Az ikon magassága px-ben -- a wordmark betűmérete ehhez arányosan skálázódik. */
  size?: number;
  className?: string;
}

/**
 * Teljes CarPass logó-lockup (ikon + "CarPass" wordmark + opcionális alcím) --
 * a felhasználó által mellékelt referencia-kép ("Main logo — full colour on dark"
 * variánsa) alapján. Lásd `CarPassMark` a forrás/névtér-megjegyzésekért.
 */
export function CarPassLogo({ variant = 'dark', withSubtitle = true, size = 40, className }: CarPassLogoProps) {
  const isDark = variant === 'dark';
  const textColor = isDark ? '#ffffff' : '#0d1117';
  const subtitleColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(13,17,23,0.45)';
  const wordmarkFontSize = Math.round(size * 0.55);

  return (
    <div className={`flex items-center ${className ?? ''}`} style={{ gap: size * 0.35 }}>
      <CarPassMark size={size} />
      <div className="flex flex-col leading-none">
        <span
          className={outfit.className}
          style={{
            color: textColor,
            fontSize: wordmarkFontSize,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
          }}
        >
          Car<span style={{ color: '#22d3a5' }}>Pass</span>
        </span>
        {withSubtitle && (
          <span
            className={dmMono.className}
            style={{
              color: subtitleColor,
              fontSize: Math.max(8, Math.round(wordmarkFontSize * 0.28)),
              fontWeight: 500,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginTop: 4,
            }}
          >
            Járműátvizsgálás
          </span>
        )}
      </div>
    </div>
  );
}
