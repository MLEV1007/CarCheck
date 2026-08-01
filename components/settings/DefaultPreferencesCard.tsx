'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { LICENSE_PLATE_COUNTRIES } from '@/lib/inspections/constants';

interface DefaultPreferencesCardProps {
  initialDefaultLicenseCountry: string;
}

/**
 * "Alapértelmezett értékek" kártya (PROJEKT_INSTRUKCIOK.md, "Rendszám felségjelzés
 * dropdown és profilhoz kötött alapértelmezés" lépés) -- jelenleg egyetlen beállítás:
 * az Új vizsgálat wizard Rendszám felségjelzés dropdown-jának kezdeti értéke.
 *
 * FONTOS ELTÉRÉS a `SettingsForm.tsx` többi mezőjétől: ez NEM a `profiles` táblába,
 * hanem a Supabase AUTH `user_metadata`-jába kerül (`supabase.auth.updateUser({ data:
 * { default_license_country } })`), ezért NEM a fő "Módosítások mentése" gombra vár --
 * a dropdown módosításakor AZONNAL mentődik, önálló hívással (ugyanaz az UX-elv, mint a
 * `LogoUploader.tsx`-nél: egy külön API-útvonalon élő, kis hatókörű beállítás ne kösse
 * magát a `profiles.upsert()` mentési ciklusához).
 */
export function DefaultPreferencesCard({ initialDefaultLicenseCountry }: DefaultPreferencesCardProps) {
  const [value, setValue] = useState(initialDefaultLicenseCountry);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

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
    </div>
  );
}
