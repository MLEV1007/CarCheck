'use client';

import type { ReactNode } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnboardingHint } from '@/components/onboarding/OnboardingHintProvider';

interface HintCalloutProps {
  /** Egyedi, STABIL azonosító -- ez kerül `localStorage`-ba bezáráskor
   * (`lib/onboarding/hintStorage.ts`), tehát értéke SOSE változzon utólag (egy átnevezés
   * a korábban bezárt tippet újra megjelenítené mindenkinek). Konvenció: rövid,
   * kötőjeles kulcs, pl. `"car-info"`, `"equipment-ai-dictation"`. */
  id: string;
  title?: string;
  children: ReactNode;
  /**
   * `"banner"` (alapértelmezett) -- teljes szélességű, kiemelt kártya a lépés tetején,
   * a lépés CÉLJÁT magyarázza el. `"inline"` -- kompakt, egy adott vezérlő (pl. AI-gomb,
   * mikrofon) MELLÉ/ALÁ szánt, kisebb súlyú tipp.
   */
  variant?: 'banner' | 'inline';
  className?: string;
}

/**
 * Onboarding "Tipp" kártya -- dizájn-elve MEGEGYEZIK a wizard meglévő kártyanyelvével
 * (`rounded-lg`/`rounded-md`, `border-linear-hairline`, `bg-linear-surface-*`), csak egy
 * halvány lila (`linear-primary`) tónussal és egy `Lightbulb` ikonnal különül el a
 * ténylegesen adatot rögzítő kártyáktól -- SZÁNDÉKOSAN NEM `Sparkles`/villámikon, mert a
 * projekt korábban (`StepCarInfo.tsx`/`StepEquipment.tsx` kommentjei) TUDATOSAN eltávolította
 * az "AI tech-demó" hatású ikonográfiát a tényleges AI-funkciók gombjairól -- ez a
 * `Lightbulb` itt egy más szemantikájú elem (UI-útmutatás, nem az AI-funkció márkajelzése),
 * ezért nem ütközik ezzel az elvvel.
 *
 * Első látogatáskor jelenik meg, a `×` gombbal ÖRÖKRE bezárható (lásd
 * `OnboardingHintProvider.tsx`/`hintStorage.ts`) -- ha a felhasználó már bezárta, a
 * komponens `null`-t rendel, UGYANAZ a "return null, ha nincs releváns tartalom" minta,
 * mint a publikus riport kártyáinál (`components/report/*.tsx`).
 */
export function HintCallout({ id, title, children, variant = 'banner', className }: HintCalloutProps) {
  const { visible, dismiss } = useOnboardingHint(id);
  if (!visible) return null;

  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-start gap-2 rounded-md border border-linear-hairline bg-linear-surface-2 px-3 py-2',
          className
        )}
      >
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-linear-primary" />
        <p className="flex-1 text-[12px] leading-relaxed text-linear-ink-subtle">
          {title && <span className="font-medium text-linear-ink">{title}: </span>}
          {children}
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Tipp bezárása"
          className="shrink-0 rounded p-0.5 text-linear-ink-subtle transition-colors hover:bg-linear-surface-3 hover:text-linear-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 rounded-lg border border-linear-primary/25 bg-linear-primary/[0.06] p-4',
        className
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-primary/15 text-linear-primary">
        <Lightbulb className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 pr-6">
        {title && <p className="text-[13px] font-semibold text-linear-ink">{title}</p>}
        <p className={cn('text-[12.5px] leading-relaxed text-linear-ink-subtle', title && 'mt-0.5')}>{children}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Tipp bezárása"
        className="absolute right-3 top-3 shrink-0 rounded-md p-1 text-linear-ink-subtle transition-colors hover:bg-linear-surface-2 hover:text-linear-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
