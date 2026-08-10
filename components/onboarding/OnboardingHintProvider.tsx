'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadDismissedHints, persistDismissedHint } from '@/lib/onboarding/hintStorage';

interface OnboardingHintContextValue {
  isDismissed: (id: string) => boolean;
  dismiss: (id: string) => void;
}

const OnboardingHintContext = createContext<OnboardingHintContextValue | null>(null);

/**
 * A wizard onboarding-tippjeinek ("Tipp" kártyák, `HintCallout.tsx`) MEGOSZTOTT
 * bezárás-állapotát teszi elérhetővé -- `InspectionWizard.tsx` a teljes render-fáját
 * körbeveszi ezzel, ugyanúgy, mint az `InspectionIdProvider`/`InsufficientCreditsProvider`
 * (lásd azok JSDoc-ját a "miért Context, nem props" indoklásért -- itt is számos,
 * mélyen beágyazott `Step*.tsx`/`FormControls.tsx` komponens használja).
 *
 * **Miért KÖZÖS state (nem minden `HintCallout` a saját `localStorage`-olvasásával):**
 * ha egyazon lépésen belül TÖBB azonos `id`-jú tipp is renderelődhetne egyszerre (pl. a
 * "mikrofon" tipp minden `TextareaField`-nél megjelenhetne, ha a lépésen több hiba-/
 * bejegyzés-kártya is nyitva van), egy a `localStorage`-t csak SAJÁT `useState`
 * inicializátorban olvasó komponens nem venné észre, ha egy TESTVÉR példányát időközben
 * bezárták -- a felhasználó ugyanazt a tippet több helyen is látná, és csak oldal-
 * frissítés után tűnne el mindenhonnan. Egy közös, Context-beli `Set<string>`-tel viszont
 * egyetlen bezárás AZONNAL elrejti az összes, ugyanazt az `id`-t használó, éppen
 * látható példányt is.
 */
export function OnboardingHintProvider({ children }: { children: ReactNode }) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => loadDismissedHints());

  const isDismissed = useCallback((id: string) => dismissedIds.has(id), [dismissedIds]);

  const dismiss = useCallback((id: string) => {
    setDismissedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    persistDismissedHint(id);
  }, []);

  const value = useMemo(() => ({ isDismissed, dismiss }), [isDismissed, dismiss]);

  return <OnboardingHintContext.Provider value={value}>{children}</OnboardingHintContext.Provider>;
}

/**
 * Egyetlen tipp látható/bezárt állapotát és bezáró függvényét adja vissza. Szándékosan
 * NEM dob hibát `OnboardingHintProvider` nélkül (ellentétben pl. `useInspectionId()`-vel)
 * -- egy hiányzó Provider itt legfeljebb egy tipp örökre látszik marad, ami sose törik
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
