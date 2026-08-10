'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
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
   * A nyílhegy vízszintes igazítása a buborék TETEJÉN -- azt jelöli, melyik (a hívó fél
   * által KÖZVETLENÜL FÖLÉ renderelt) elemre vonatkozik a tipp: `"left"` (alapértelmezett)
   * a bal szélhez igazítja (pl. egy balra igazított cím/gomb fölött), `"right"` a jobb
   * szélhez (pl. a `TextareaField` jobb felső sarkában ülő mikrofon gomb fölött),
   * `"center"` középre. A hívó fél felelőssége, hogy a `HintCallout`-ot KÖZVETLENÜL a
   * hivatkozott elem UTÁN, a dokumentum-folyamban (nem absztrakt overlay-ként)
   * helyezze el -- lásd a komponens JSDoc-ját lent, miért ez a megbízható mobil-megoldás.
   */
  pointerAlign?: 'left' | 'center' | 'right';
  className?: string;
}

/**
 * Onboarding "Tipp" buborék -- coachmark-stílus: egy kitöltött, lekerekített dobozka +
 * egy kis háromszög-nyílhegy a tetején, ami arra az elemre mutat, ami KÖZVETLENÜL fölötte
 * áll a JSX-ben (2026-08-10, felhasználói kérés: "kiemeli azt az adott funkciót... egy
 * nyíl mutatja, hogy arra vonatkozik a tipp", "mintha egy modern app lenne").
 *
 * **Miért a dokumentum-folyamban (NEM `position: absolute`/portál-alapú lebegő tooltip):**
 * egy klasszikus, abszolút pozicionált popover (pl. a felhasználó által hivatkozott
 * `@ark-ui/react` `Popover` + `Portal`) helyes elhelyezése a célelemhez képest (fent/lent/
 * balra/jobbra, ütközés-észleléssel a képernyő szélén) mobilon, sok különböző, görgethető
 * form-mezőn/gombon -- ahogy ez a wizard mind a 11 lépésén, változó elrendezésekben él --
 * jelentős extra komplexitást és törékenységet (viewport-túlcsordulás, `z-index`-harc,
 * scroll-követés) hozna be. Mivel a tippnek ITT NEM kell a célelem FÖLÉ/ELÉ úsznia --
 * elég, ha közvetlenül ALATTA jelenik meg, nyílheggyel felfelé --, egyszerű, normál
 * `flow`-beli blokk-elemként FIX, MEGBÍZHATÓ pozíciót ad, portál/overlay-kezelés,
 * abszolút-pozicionálási szélső esetek nélkül, és garantáltan jól néz ki bármilyen
 * képernyőméreten (a doboz egyszerűen a szülő szélességéhez igazodik).
 *
 * **Miért NEM `Lightbulb`/kör-ikon, mint korábban:** a tömör (nem halványított) `linear-
 * primary` háttér + fehér szöveg önmagában elég kontrasztos/"kiemelt" ahhoz, hogy modern
 * app-os coachmark-hatást keltsen, egy plusz ikon-jelvény itt már túlzsúfolt lenne egy
 * ilyen kompakt buborékban.
 *
 * Első látogatáskor jelenik meg -- automatikusan, KATTINTÁS NÉLKÜL (nem `Popover.Trigger`-
 * hez kötött, mindig renderelődik, amíg `id` nincs bezárva) -- a `×` gombbal ÖRÖKRE
 * bezárható (lásd `OnboardingHintProvider.tsx`/`hintStorage.ts`).
 */
export function HintCallout({ id, title, children, pointerAlign = 'left', className }: HintCalloutProps) {
  const { visible, dismiss } = useOnboardingHint(id);
  if (!visible) return null;

  return (
    <div className={cn('relative w-full pt-2 sm:w-fit sm:max-w-sm', className)}>
      {/* Nyílhegy -- egy 45°-kal elforgatott négyzet sarka, ugyanolyan háttérszínnel, mint
          a buborék, hogy folytonosnak tűnjön (klasszikus CSS "speech bubble" trükk). */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-0.5 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-linear-primary',
          pointerAlign === 'left' && 'left-4',
          pointerAlign === 'center' && 'left-1/2 -translate-x-1/2',
          pointerAlign === 'right' && 'right-4'
        )}
      />
      <div className="relative flex items-start gap-2 rounded-xl bg-linear-primary px-3.5 py-2.5 shadow-lg shadow-black/25">
        <div className="min-w-0 flex-1">
          {title && <p className="text-[12.5px] font-semibold leading-snug text-white">{title}</p>}
          <p className={cn('text-[12.5px] leading-snug text-white/90', title && 'mt-0.5')}>{children}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Tipp bezárása"
          className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
