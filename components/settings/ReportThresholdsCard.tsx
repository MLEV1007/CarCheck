'use client';

import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SuccessToast } from '@/components/settings/SuccessToast';
import type { ReportThresholds } from '@/lib/inspections/types';

interface ReportThresholdsCardProps {
  userId: string;
  initialThresholds: ReportThresholds;
}

/**
 * "Riport küszöbértékek" kártya (2026-08-07, "Testreszabható festékvastagság/
 * gumiabroncs küszöbértékek" lépés), a `profiles` táblán élő 4 új oszlopot
 * (`supabase/migrations/20260807090000_report_thresholds.sql`) szerkeszti: mikortól
 * "Újrafújt / Javított" ill. "Gittelt / Sérült" egy festékvastagság-mérési pont
 * (`getPaintStatus()`), és mikortól jelezzen "Koros" (életkor) ill. "Kopott"
 * (profilmélység) figyelmeztetést egy gumiabroncs (`decodeDot()`/`isTreadWorn()`,
 * `lib/inspections/tireDot.ts`).
 *
 * UGYANAZ a "kliens-oldali state + explicit Mentés gomb" minta, mint a
 * `SettingsForm.tsx`-nél (NEM az azonnali-mentős `DefaultPreferencesCard.tsx` minta),
 * mert itt 4, EGYMÁSTÓL FÜGGŐ értéket (a "Gyári" határnak KISEBBNEK kell lennie az
 * "Újrafújt" határnál) kell együtt, egy konzisztens állapotban menteni, egy
 * mezőnkénti azonnali mentés átmenetileg érvénytelen (gyári > újrafújt) állapotot
 * engedne a DB-be kerülni a 2. mező módosítása előtt.
 *
 * Stripe design system (stripe.md): fehér `card-feature-light` kártya, `rounded-full`
 * pill primary gomb, hairline elválasztók.
 */
export function ReportThresholdsCard({ userId, initialThresholds }: ReportThresholdsCardProps) {
  const [paintGyariMax, setPaintGyariMax] = useState(String(initialThresholds.paintGyariMaxMicron));
  const [paintUjrafujtMax, setPaintUjrafujtMax] = useState(String(initialThresholds.paintUjrafujtMaxMicron));
  const [tireAgeYears, setTireAgeYears] = useState(String(initialThresholds.tireAgeWarningYears));
  const [tireTreadMm, setTireTreadMm] = useState(String(initialThresholds.tireTreadWarningMm));

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setShowToast(false);

    const gyari = Number(paintGyariMax);
    const ujrafujt = Number(paintUjrafujtMax);
    const ageYears = Number(tireAgeYears);
    const treadMm = Number(tireTreadMm);

    // Kliens-oldali validáció, a DB-oldali CHECK constraint (`profiles_paint_thresholds_
    // positive_check`/`profiles_tire_thresholds_positive_check`) a végső védelmi vonal, de
    // itt egy érthető, magyar hibaüzenettel akarjuk megállítani a mentést a hálózati
    // kör-út ELŐTT, ugyanúgy, ahogy a wizard "Szigorú adatvalidáció" lépése is teszi.
    if (!Number.isFinite(gyari) || !Number.isFinite(ujrafujt) || !Number.isFinite(ageYears) || !Number.isFinite(treadMm)) {
      setError('Minden mező csak számot tartalmazhat.');
      return;
    }
    if (gyari <= 0 || ujrafujt <= 0 || ageYears <= 0 || treadMm < 0) {
      setError('A küszöbértékek nem lehetnek nullánál kisebbek/egyenlők (a profilmélység küszöb nulla lehet).');
      return;
    }
    if (gyari >= ujrafujt) {
      setError('A "Gyári" küszöbnek kisebbnek kell lennie az "Újrafújt / Javított" küszöbnél.');
      return;
    }

    setIsSaving(true);

    const supabase = createClient();
    // FONTOS (2026-08-07-es hibajavítás): SZÁNDÉKOSAN `.update().eq('id', userId)`, NEM
    // `.upsert({ id: userId, ... })`, lásd a részletes indoklást `SettingsForm.tsx`
    // ugyanerről a javításról. Röviden: az `.upsert()` PostgREST alatt egy `INSERT ...
    // ON CONFLICT DO UPDATE`-et generál, ami a payloadban NEM szereplő, de NOT NULL (és
    // default NÉLKÜLI) `organization_id` oszlopra MEGLÉVŐ sor UPDATE-jénél IS lefuttatta a
    // NOT NULL ellenőrzést, emiatt ez a mentés MINDIG hibával elszállt ("A mentés
    // sikertelen volt"), a `profiles` tábla `null value in column "organization_id" ...
    // violates not-null constraint` Postgres-hibájával a háttérben.
    const { error: upsertError } = await supabase
      .from('profiles')
      .update({
        paint_threshold_gyari_max_micron: gyari,
        paint_threshold_ujrafujt_max_micron: ujrafujt,
        tire_age_warning_years: ageYears,
        tire_tread_warning_mm: treadMm,
      })
      .eq('id', userId);

    setIsSaving(false);

    if (upsertError) {
      setError('A mentés sikertelen volt. Ellenőrizd az adataidat, majd próbáld újra.');
      return;
    }

    setShowToast(true);
  }

  return (
    <>
      {showToast && (
        <SuccessToast message="A riport küszöbértékek sikeresen frissültek!" onDismiss={() => setShowToast(false)} />
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-6 rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1 sm:p-8"
      >
        <div>
          <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">Riport küszöbértékek</h2>
          <p className="mt-1 font-sohne text-[13px] font-light text-stripe-ink-mute">
            Mikortól jelezzen "Újrafújt / Gittelt" festékréteget, illetve "Koros / Kopott" gumiabroncsot a riport,
            minden ÚJ vizsgálatra és a publikus ügyfélriportra is érvényes. A már elmentett vizsgálatokon a besorolás
            a MEGTEKINTÉSKOR aktuális küszöbök alapján frissül.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-stripe-sm border border-stripe-ruby/30 bg-stripe-ruby/5 px-3 py-2 font-sohne text-[13px] text-stripe-ruby"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <h3 className="font-sohne text-[13px] font-medium text-stripe-ink-secondary">Festékvastagság-mérés</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Gyári, felső határ (µm)"
              name="paint-gyari-max"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={paintGyariMax}
              onChange={(e) => setPaintGyariMax(e.target.value)}
            />
            <Input
              label="Újrafújt / Javított, felső határ (µm)"
              name="paint-ujrafujt-max"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={paintUjrafujtMax}
              onChange={(e) => setPaintUjrafujtMax(e.target.value)}
            />
          </div>
          <p className="font-sohne text-[12px] font-light text-stripe-ink-mute">
            Ennél nagyobb érték: "Gittelt / Sérült".
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-stripe-hairline pt-6">
          <h3 className="font-sohne text-[13px] font-medium text-stripe-ink-secondary">Gumiabroncsok</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Koros gumiabroncs, kortól (év)"
              name="tire-age-years"
              type="number"
              inputMode="decimal"
              min={0.1}
              step={0.5}
              value={tireAgeYears}
              onChange={(e) => setTireAgeYears(e.target.value)}
            />
            <Input
              label="Kopott gumiabroncs, profilmélységtől (mm)"
              name="tire-tread-mm"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={tireTreadMm}
              onChange={(e) => setTireTreadMm(e.target.value)}
            />
          </div>
          <p className="font-sohne text-[12px] font-light text-stripe-ink-mute">
            A DOT kódból számolt gyártási kor, illetve a rögzített profilmélység ennél a küszöbnél figyelmeztet.
          </p>
        </div>

        <Button type="submit" isLoading={isSaving} className="self-start">
          Küszöbértékek mentése
        </Button>
      </form>
    </>
  );
}
