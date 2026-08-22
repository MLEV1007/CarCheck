'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadDismissedHints, persistDismissedHint } from '@/lib/onboarding/hintStorage';

interface OnboardingHintContextValue {
  isDismissed: (id: string) => boolean;
  dismiss: (id: string) => void;
  /** Aktuális (futásidejű) globális be/kikapcsolt állapot, lásd `disableAll` JSDoc-ját
   * lent. A `QuickDisableTipsHint.tsx` ezzel dönti el, hogy egyáltalán érdemes-e
   * megjelennie (ha a tippek már amúgy is ki vannak kapcsolva, a gyors-kikapcsoló gombnak
   * sincs értelme). */
  enabled: boolean;
  /** Azonnali, TELJES kikapcsolás (2026-08-12, felhasználói kérés: "a bal felső sarokban
   * legyen pár másodpercig egy gomb amivel ki lehet kapcsolni a tippeket"), lásd
   * `QuickDisableTipsHint.tsx`. Két dolgot csinál: (1) AZONNAL elrejt minden tippet ebben a
   * már nyitva lévő wizard-fülben (`enabled` -> `false`, ugyanúgy, mint a `Settings`
   * kapcsoló `enabled` propja), (2) meghívja a hívó fél által átadott callback-et, ami a
   * `InspectionWizard.tsx`-ben a Settings oldallal MEGEGYEZŐ `user_metadata.
   * tutorial_hints_enabled` mezőt írja `false`-ra, tehát ez ugyanaz a beállítás, csak egy
   * MÁSODIK belépési ponttal, nem egy külön, párhuzamos kapcsoló. */
  disableAll: () => void;
}

const OnboardingHintContext = createContext<OnboardingHintContextValue | null>(null);

/**
 * A wizard onboarding-tippjeinek ("Tipp" kártyák, `HintCallout.tsx`) MEGOSZTOTT
 * bezárás-állapotát teszi elérhetővé, `InspectionWizard.tsx` a teljes render-fáját
 * körbeveszi ezzel, ugyanúgy, mint az `InspectionIdProvider`/`InsufficientCreditsProvider`
 * (lásd azok JSDoc-ját a "miért Context, nem props" indoklásért, itt is számos,
 * mélyen beágyazott `Step*.tsx`/`FormControls.tsx` komponens használja).
 *
 * **Miért KÖZÖS state (nem minden `HintCallout` a saját `localStorage`-olvasásával):**
 * ha egyazon lépésen belül TÖBB azonos `id`-jú tipp is renderelődhetne egyszerre (pl. a
 * "mikrofon" tipp minden `TextareaField`-nél megjelenhetne, ha a lépésen több hiba-/
 * bejegyzés-kártya is nyitva van), egy a `localStorage`-t csak SAJÁT `useState`
 * inicializátorban olvasó komponens nem venné észre, ha egy TESTVÉR példányát időközben
 * bezárták, a felhasználó ugyanazt a tippet több helyen is látná, és csak oldal-
 * frissítés után tűnne el mindenhonnan. Egy közös, Context-beli `Set<string>`-tel viszont
 * egyetlen bezárás AZONNAL elrejti az összes, ugyanazt az `id`-t használó, éppen
 * látható példányt is.
 */
interface OnboardingHintProviderProps {
  children: ReactNode;
  /**
   * Globális be/kikapcsoló KEZDETI értéke (2026-08-10, Settings "Tutorial tippek
   * megjelenítése" kapcsoló, lásd `DefaultPreferencesCard.tsx`), `false` esetén MINDEN
   * tipp rejtve marad, FÜGGETLENÜL az egyedi (`localStorage`-beli) bezárás-állapottól.
   * Alapértéke `true` (a korábbi, kapcsoló bevezetése előtti viselkedés). Szándékosan NEM
   * írja felül a `dismissedIds`-t, ha a user később újra bekapcsolja, a MÁR egyenként
   * bezárt tippek nem térnek vissza, csak a még soha be nem zártak.
   *
   * **Csak KEZDETI érték, nem élő prop** (2026-08-12, "gyors tipp-kikapcsoló gomb" lépés):
   * a Provider ezt egy SAJÁT `useState`-be másolja (lásd lent), hogy a `disableAll()`
   * futásidőben is tudja `false`-ra állítani, a wizard EGYETLEN élettartama alatt ez a
   * prop utólag úgysem változna (a szülő Server Component csak első betöltéskor adja át).
   */
  enabled?: boolean;
  /** A `disableAll()` hívásakor futtatott, hívó fél által megadott mellékhatás (2026-08-12),
   * a `InspectionWizard.tsx`-ben ez perzisztálja a `user_metadata.
   * tutorial_hints_enabled = false` értéket, UGYANÚGY, mint a Settings oldal
   * `DefaultPreferencesCard.tsx` kapcsolója, hogy a KÖVETKEZŐ vizsgálat-megnyitáskor (és a
   * Settings oldalon) is már kikapcsolt állapot látszódjon. Opcionális, ha nincs megadva,
   * `disableAll()` csak a jelenlegi wizard-fülben rejt el mindent. */
  onDisableAll?: () => void;
}

export function OnboardingHintProvider({ children, enabled: initialEnabled = true, onDisableAll }: OnboardingHintProviderProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => loadDismissedHints());
  const [enabled, setEnabled] = useState(initialEnabled);

  const isDismissed = useCallback((id: string) => !enabled || dismissedIds.has(id), [enabled, dismissedIds]);

  const dismiss = useCallback((id: string) => {
    setDismissedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    persistDismissedHint(id);
  }, []);

  const disableAll = useCallback(() => {
    setEnabled(false);
    onDisableAll?.();
  }, [onDisableAll]);

  const value = useMemo(
    () => ({ isDismissed, dismiss, enabled, disableAll }),
    [isDismissed, dismiss, enabled, disableAll]
  );

  return <OnboardingHintContext.Provider value={value}>{children}</OnboardingHintContext.Provider>;
}

/**
 * Egyetlen tipp látható/bezárt állapotát és bezáró függvényét adja vissza. Szándékosan
 * NEM dob hibát `OnboardingHintProvider` nélkül (ellentétben pl. `useInspectionId()`-vel),
 * egy hiányzó Provider itt legfeljebb egy tipp örökre látszik marad, ami sose törik
 * el semmit, ezért egy defenzív "mindig látható, bezárás no-op" fallback biztonságosabb,
 * mint egy kemény hiba egy pusztán díszítő UI-elemért.
 */
export function useOnboardingHint(id: string): { visible: boolean; dismiss: () => void } {
  const ctx = useContext(OnboardingHintContext);
  if (!ctx) {
    return { visible: true, dismiss: () => {} };
  }
  return { visible: !ctx.isDismissed(id), dismiss: () => ctx.dismiss(id) };
}

/**
 * A globális "tippek" be/kikapcsolt állapotát és a `disableAll()` mellékhatását adja
 * vissza, `QuickDisableTipsHint.tsx` használja (2026-08-12, "bal felső sarokban egy
 * gomb amivel ki lehet kapcsolni a tippeket" kérés). Ugyanazt a defenzív, Provider-mentes
 * fallback-elvet követi, mint `useOnboardingHint` fent (lásd annak JSDoc-ját), Provider
 * nélkül `enabled: true`/`disableAll: no-op`, hogy egy hiányzó Provider itt se törjön el
 * semmit, csak a gomb kattintása maradna hatástalan.
 */
export function useOnboardingHintControls(): { enabled: boolean; disableAll: () => void } {
  const ctx = useContext(OnboardingHintContext);
  if (!ctx) {
    return { enabled: true, disableAll: () => {} };
  }
  return { enabled: ctx.enabled, disableAll: ctx.disableAll };
}
