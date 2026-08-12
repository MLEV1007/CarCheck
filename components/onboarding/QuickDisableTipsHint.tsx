'use client';

import { useEffect, useState } from 'react';
import { BellOff } from 'lucide-react';
import { useOnboardingHint, useOnboardingHintControls } from '@/components/onboarding/OnboardingHintProvider';

/** Pár másodpercig marad látható, mielőtt magától eltűnik (2026-08-12, felhasználói
 * kérés: "legyen pár másodpercig egy gomb"). Ugyanabban a nagyságrendben, mint a
 * `VinScanToast.tsx` (5000ms) -- itt kicsit hosszabb, hogy a wizard ELSŐ megnyitásakor,
 * mire a user egyáltalán észreveszi a bal felső sarkot, még ott legyen. */
const AUTO_HIDE_MS = 7000;

/**
 * Gyors, felfedezhető "tippek kikapcsolása" gomb -- a bal felső sarokban jelenik meg,
 * KIZÁRÓLAG akkor, amikor a wizard ELSŐ tippje (`car-info`, `StepCarInfo.tsx` 1. lépés)
 * ténylegesen látható (tehát a tippek be vannak kapcsolva ÉS a user még sosem zárta be
 * ezt a konkrét tippet) -- ha bármelyik feltétel hamis, ennek a gombnak nincs értelme,
 * nem is renderelődik.
 *
 * **Miért `car-info` a "trigger", nem egy általános "wizard most nyílt meg" jelzés:** ez
 * pontosan lefedi a felhasználói kérést ("amikor... megjelenik az első tipp") anélkül,
 * hogy külön állapotot kellene tartani arról, hogy ez az ELSŐ vizsgálat-megnyitás -- a
 * `car-info` hint láthatósága (`OnboardingHintProvider` megosztott state-je) MÁR pontosan
 * ezt fejezi ki.
 *
 * **A wizard TELJES élettartama alatt egyetlen példány él** (az `InspectionWizard.tsx` a
 * `OnboardingHintProvider`-en belül, a lépés-váltástól függetlenül rendereli) -- az
 * `AUTO_HIDE_MS`-es időzítő emiatt csak EGYSZER, a wizard megnyitásakor indul el, nem
 * lépésenként újra.
 *
 * Kattintásra `disableAll()`-t hív (`OnboardingHintProvider.tsx`) -- ez (1) AZONNAL elrejt
 * minden tippet a jelenlegi fülben, (2) a `InspectionWizard.tsx`-ben átadott
 * `onDisableAll` callback-en keresztül elmenti a `user_metadata.
 * tutorial_hints_enabled = false` értéket, UGYANAZT a mezőt, amit a Settings oldal
 * "Tutorial tippek megjelenítése" kapcsolója (`DefaultPreferencesCard.tsx`) is ír --
 * tehát a KÖVETKEZŐ vizsgálat-megnyitáskor (és a Settings oldalon is) már kikapcsolt
 * állapot látszik, nem kell sem a tippet, sem ezt a gombot újra megmutatni.
 */
export function QuickDisableTipsHint() {
  const { visible: firstHintVisible } = useOnboardingHint('car-info');
  const { disableAll } = useOnboardingHintControls();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!firstHintVisible) return;
    const timer = setTimeout(() => setDismissed(true), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- szándékosan csak EGYSZER, a
    // gomb elsőként láthatóvá válásakor indítjuk el az időzítőt (lásd a komponens JSDoc-ját).
  }, []);

  if (!firstHintVisible || dismissed) return null;

  return (
    <button
      type="button"
      onClick={() => {
        disableAll();
        setDismissed(true);
      }}
      className="fixed left-3 z-[60] flex items-center gap-1.5 rounded-md border border-linear-hairline bg-linear-surface-2/95 px-3 py-1.5 text-[12px] font-medium text-linear-ink-subtle shadow-lg backdrop-blur transition-colors hover:bg-linear-surface-3 hover:text-linear-ink"
      style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <BellOff className="h-3.5 w-3.5 shrink-0" />
      Tippek kikapcsolása
    </button>
  );
}
