'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { LICENSE_PLATE_COUNTRIES } from '@/lib/inspections/constants';

interface DefaultPreferencesCardProps {
  initialDefaultLicenseCountry: string;
  /** Tutorial "Tipp" buborékok be/kikapcsolása (2026-08-10, felhasználói kérés: "szeretném
   * ha be és kikapcsolható lenne") -- lásd a `tutorialHintsEnabled` blokk JSDoc-ját lent. */
  initialTutorialHintsEnabled: boolean;
}

/**
 * "Alapértelmezett értékek" kártya (PROJEKT_INSTRUKCIOK.md, "Rendszám felségjelzés
 * dropdown és profilhoz kötött alapértelmezés" lépés) -- két, egymástól FÜGGETLEN
 * beállítás: (1) az Új vizsgálat wizard Rendszám felségjelzés dropdown-jának kezdeti
 * értéke, (2) a wizard "Tipp" buborékjainak (`components/onboarding/HintCallout.tsx`)
 * be/kikapcsolása.
 *
 * FONTOS ELTÉRÉS a `SettingsForm.tsx` többi mezőjétől: EGYIK mező sem a `profiles`
 * táblába, hanem a Supabase AUTH `user_metadata`-jába kerül (`supabase.auth.updateUser({
 * data: {...} })`), ezért NEM a fő "Módosítások mentése" gombra várnak -- mindkettő
 * módosításkor AZONNAL mentődik, önálló hívással (ugyanaz az UX-elv, mint a
 * `LogoUploader.tsx`-nél: egy külön API-útvonalon élő, kis hatókörű beállítás ne kösse
 * magát a `profiles.upsert()` mentési ciklusához).
 */
export function DefaultPreferencesCard({
  initialDefaultLicenseCountry,
  initialTutorialHintsEnabled,
}: DefaultPreferencesCardProps) {
  const [value, setValue] = useState(initialDefaultLicenseCountry);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Tutorial "Tipp" buborékok be/kikapcsolása -- SZÁNDÉKOSAN KÜLÖN state/mentési ciklus a
  // fenti rendszám-mezőtől (két, egymástól teljesen független beállítás, ugyanabban a
  // kártyában), hogy egyik mentése/hibaüzenete se zavarja a másikat.
  const [tutorialHintsEnabled, setTutorialHintsEnabled] = useState(initialTutorialHintsEnabled);
  const [isSavingTutorial, setIsSavingTutorial] = useState(false);
  const [tutorialError, setTutorialError] = useState<string | null>(null);

  async function handleChange(nextValue: string) {
    const previousValue = value;
    setValue(nextValue);
    setError(null);
    setJustSaved(false);
    setIsSaving(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      data: { default_license_country: nextValue },
    });

    setIsSaving(false);

    if (updateError) {
      setValue(previousValue);
      setError('A mentés sikertelen volt. Próbáld újra.');
      return;
    }

    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  }

  /** A `profiles.upsert()`/Auth `user_metadata` mintát követi, mint a fenti `handleChange`
   * -- optimista UI-frissítés, hiba esetén visszaállítás. A wizard (`InspectionWizard.tsx`
   * -> `OnboardingHintProvider`) a KÖVETKEZŐ oldal-betöltéskor olvassa ki ezt az értéket
   * (`app/inspections/new/page.tsx`/`app/inspections/[id]/page.tsx`), tehát egy ÉPPEN
   * NYITVA lévő wizard-fülben a tippek csak frissítés/újranyitás után tűnnek el/jelennek
   * meg újra -- ez a jelenlegi kérésre elegendő, nem igényel élő, fülek közötti szinkront. */
  async function handleToggleTutorialHints(nextValue: boolean) {
    setTutorialHintsEnabled(nextValue);
    setTutorialError(null);
    setIsSavingTutorial(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      data: { tutorial_hints_enabled: nextValue },
    });

    setIsSavingTutorial(false);

    if (updateError) {
      setTutorialHintsEnabled(!nextValue);
      setTutorialError('A mentés sikertelen volt. Próbáld újra.');
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1 sm:p-8">
      <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">Alapértelmezett értékek</h2>
      <p className="font-sohne text-[13px] font-light text-stripe-ink-mute">
        Ez az érték tölti elő automatikusan az Új vizsgálat űrlap Rendszám felségjelzés mezőjét -- vizsgálatonként
        felülírható marad.
      </p>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="default_license_country"
          className="font-sohne text-[13px] font-normal text-stripe-ink-secondary"
        >
          Alapértelmezett rendszám felségjelzés
        </label>
        <div className="flex items-center gap-3">
          <select
            id="default_license_country"
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            className="h-11 w-full max-w-[300px] rounded-stripe-sm border border-stripe-hairline-input bg-white px-3 font-sohne text-[15px] text-stripe-ink transition-colors duration-150 focus:border-stripe-primary focus:outline-none focus:ring-2 focus:ring-stripe-primary/30"
          >
            {LICENSE_PLATE_COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.code} — {country.label}
              </option>
            ))}
          </select>
          {isSaving && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-stripe-ink-mute" />}
          {!isSaving && justSaved && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
        </div>
        {error && (
          <span role="alert" className="font-sohne text-[13px] text-stripe-ruby">
            {error}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-stripe-hairline pt-5">
        <label htmlFor="tutorial_hints_enabled" className="flex cursor-pointer items-center justify-between gap-4">
          <span className="min-w-0">
            <span className="block font-sohne text-[13px] font-normal text-stripe-ink-secondary">
              Tutorial tippek megjelenítése
            </span>
            <span className="mt-0.5 block font-sohne text-[12px] font-light text-stripe-ink-mute">
              A vizsgálati űrlap lépésein megjelenő, bezárható "Tipp" buborékok (pl. az AI funkcióknál).
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {isSavingTutorial && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-stripe-ink-mute" />}
            <button
              id="tutorial_hints_enabled"
              type="button"
              role="switch"
              aria-checked={tutorialHintsEnabled}
              disabled={isSavingTutorial}
              onClick={() => handleToggleTutorialHints(!tutorialHintsEnabled)}
              className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                tutorialHintsEnabled ? 'bg-stripe-primary' : 'bg-stripe-hairline-input'
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  tutorialHintsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </label>
        {tutorialError && (
          <span role="alert" className="font-sohne text-[13px] text-stripe-ruby">
            {tutorialError}
          </span>
        )}
      </div>
    </div>
  );
}
