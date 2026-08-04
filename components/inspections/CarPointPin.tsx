interface CarPointPinProps {
  /** A pont relatív pozíciója SZÁZALÉKBAN (0-100) a kép bal széle/teteje szerint --
   * UGYANAZ a koordináta-rendszer, mint a `PaintPointState`/`DamagePointState` `x`/`y`
   * mezőinél. A tű HEGYE kerül PONTOSAN erre a koordinátára (lásd lent a `translate`). */
  x: number;
  y: number;
  /** Buborék/fej színe -- festéknél a `getPaintStatus()` zöld/sárga/piros státusz-színe,
   * sérülésnél a `DAMAGE_TYPE_COLOR[type]`. */
  color: string;
  /** Kijelölt (épp szerkesztés/megtekintés alatt álló) pont -- ilyenkor egy vékony
   * kiemelő gyűrű jelenik meg a fej körül, `accentColor` színnel. */
  selected?: boolean;
  /** `dark` = Linear (`#5e6ad2`), `light` = BMW (`#1c69d4`) kiemelő szín a kijelölt
   * gyűrűhöz -- lásd a hívó `ACCENT` konstansát. */
  accentColor: string;
  /** Opcionális rövid felirat a fejben (pl. a mikron-érték, "142") -- a Sérülés-térkép
   * pontjainál nincs (ott a kategória-szín önmagában elég), a Festékvastagság-mérőnél
   * mindig a kerekített µm-érték. */
  label?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel: string;
}

/**
 * "Térkép-tű" stílusú pont-jelölő a `PaintCanvas.tsx`/`DamageCanvas.tsx` autó-
 * referenciaképén (2026-08-04, "a kör alakú pont túl sokat kivesz" UX-egyszerűsítés --
 * a korábbi, a pontra KÖZÉPRE igazított teli kör (`-translate-x-1/2 -translate-y-1/2`,
 * 32-36px) két közeli pontnál egy olvashatatlan foltba olvadt össze, és eltakarta alatta
 * a karosszériát; a felhasználóval egyeztetett, vizuálisan összehasonlított 4 alternatíva
 * közül ("A: jelenlegi kör" / "B: kis pont" / "C: vékony gyűrű" / "D: térkép-tű") a
 * "D" térkép-tű változat lett a végleges választás).
 *
 * A tű HEGYE (nem a feje!) ül PONTOSAN a mért/megjelölt koordinátán -- a színes "fej"
 * a hegy FÖLÖTT lebeg, ezért a tényleges pont alatti karosszéria-részlet nem tűnik el
 * egy nagy teli folt alá, még sűrűn egymás mellé felvett pontoknál sem (a fejek
 * átfedhetnek, de a hegyek -- a tényleges helyek -- mindig jól elkülönülnek).
 *
 * A teljes SVG (28x36 `viewBox`) a konténer `left/top: x%/y%` pozíciójához
 * `-translate-x-1/2 -translate-y-full`-lal van igazítva, hogy a `viewBox` alján, közép-
 * tájt rajzolt hegy (14,35) essen PONTOSAN erre a koordinátára.
 */
export function CarPointPin({ x, y, color, selected, accentColor, label, onClick, ariaLabel }: CarPointPinProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      style={{ left: `${x}%`, top: `${y}%` }}
      className={
        'absolute z-10 -translate-x-1/2 -translate-y-full p-1 outline-none transition-transform ' +
        (selected ? 'scale-110' : 'hover:scale-110')
      }
    >
      <svg width={26} height={34} viewBox="0 0 28 36" className="drop-shadow-md">
        {/* A hegy és a fej UGYANAZZAL a fill-lel, körvonal nélkül a háromszögön --
            így a két alakzat között nem látszik varrat, egyetlen sima "csepp"-sziluettként
            olvad össze. */}
        <polygon points="14,35 8,24 20,24" fill={color} />
        <circle cx={14} cy={13} r={11} fill={color} stroke="#ffffff" strokeWidth={2.5} />
        {selected && <circle cx={14} cy={13} r={14.5} fill="none" stroke={accentColor} strokeWidth={2} />}
        {label && (
          <text x={14} y={17} textAnchor="middle" fontSize={10} fontWeight={700} fill="#ffffff">
            {label}
          </text>
        )}
        {/* Apró, kontrasztos jelölő a TÉNYLEGES koordinátán (a hegy csúcsán), hogy a
            pontos hely akkor is egyértelmű maradjon, ha a fej máshova esik takarásba. */}
        <circle cx={14} cy={35} r={2.2} fill="#ffffff" stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
      </svg>
    </button>
  );
}
