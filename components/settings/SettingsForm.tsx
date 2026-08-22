'use client';

import { FormEvent, ReactNode, useState } from 'react';
import { Ban } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LogoUploader } from '@/components/settings/LogoUploader';
import { BrandColorPicker } from '@/components/settings/BrandColorPicker';
import { SuccessToast } from '@/components/settings/SuccessToast';

interface SettingsFormProps {
  userId: string;
  initialCompanyName: string;
  initialPhone: string;
  initialEmail: string;
  initialLogoUrl: string | null;
  initialPrimaryColor: string;
  /** Igaz Átvizsgálóknál (2026-08-14, "Öröklött cégadatok" lépés, a felhasználó explicit
   * kérésére): a fenti `initial*` értékek ilyenkor NEM a saját, hanem a szervezet
   * Menedzserének `profiles` sorából származnak (lásd `get_organization_branding()` RPC
   * / `SettingsPageContent.tsx`), az Átvizsgáló ezeket LÁTJA, de nem szerkesztheti:
   * minden mező `disabled`, a "Módosítások mentése" gomb nem jelenik meg, és minden
   * mező címkéje mellett egy piros, áthúzott körös "tiltás" ikon (`Ban`, lucide-react)
   * jelzi, hogy ez a mező innen nem módosítható. */
  readOnly?: boolean;
}

/** Zárolt mező címkéje, a szöveg mellé piros "tiltás" ikont (lucide `Ban`, áthúzott
 * kör) fűz, hogy egyértelmű legyen: a mező innen nem szerkeszthető (2026-08-14,
 * "Öröklött cégadatok" lépés). Csak `readOnly` módban használt, lásd a lenti mezőket. */
function LockedFieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <Ban className="h-3.5 w-3.5 shrink-0 text-stripe-ruby" aria-label="Nem módosítható" />
    </span>
  );
}

/**
 * Cégbeállítások form (PROJEKT_INSTRUKCIOK.md 5.A + a "Cégbeállítások oldal" lépés):
 * a bejelentkezett user `profiles` sorát frissíti `auth.uid()` alapján. Minden mező
 * kliens-oldali state-ben él, a tényleges Supabase írás csak a "Módosítások mentése"
 * gombra történik (a logó KIVÉTEL: az azonnal, fájlválasztáskor feltöltődik a Storage-ba,
 * lásd LogoUploader.tsx, csak a `profiles.logo_url` mezőbe kerülés vár a mentésre).
 *
 * Stripe design system (stripe.md): fehér `card-feature-light` kártya, `rounded-full`
 * pill primary gomb, hairline elválasztók a szekciók között.
 */
export function SettingsForm({
  userId,
  initialCompanyName,
  initialPhone,
  initialEmail,
  initialLogoUrl,
  initialPrimaryColor,
  readOnly = false,
}: SettingsFormProps) {
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [primaryColor, setPrimaryColor] = useState(initialPrimaryColor);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Védekező, `readOnly` módban a "Módosítások mentése" gomb amúgy sem jelenik
    // meg, ez csak biztosíték arra az esetre, ha a form mégis submit-olódna (pl.
    // Enter billentyűvel egy input mezőben).
    if (readOnly) return;

    setError(null);
    setShowToast(false);
    setIsSaving(true);

    const supabase = createClient();
    // FONTOS (2026-08-07-es hibajavítás): SZÁNDÉKOSAN `.update().eq('id', userId)`, NEM
    // `.upsert({ id: userId, ... })`, a `profiles` sor mindig LÉTEZIK egy bejelentkezett
    // userhez (regisztrációkor jön létre), tehát itt sosem szükséges INSERT ág. Az
    // `.upsert()` viszont PostgREST alatt `INSERT ... ON CONFLICT (id) DO UPDATE`-et
    // generál, ami a JELEN payloadban NEM szereplő, de NOT NULL (és default NÉLKÜLI)
    // oszlopokra (pl. `organization_id`) MÉG EGY MEGLÉVŐ sor UPDATE-jénél IS lefuttatja a
    // NOT NULL ellenőrzést a beszúrandó tuple megkonstruálásakor, ez a valódi ok
    // ("null value in column \"organization_id\" ... violates not-null constraint"), amiért
    // ez a mentés korábban MINDIG hibával elszállt, "A mentés sikertelen volt" üzenettel.
    // Egy sima `.update()` csak a megadott oszlopokat módosítja a MEGLÉVŐ soron, nem épít
    // fel új tuple-t, ezért ez a probléma nála fel sem merül. Lásd `ReportThresholdsCard.tsx`
    // ugyanerről a javításról.
    const { error: upsertError } = await supabase
      .from('profiles')
      .update({
        company_name: companyName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        logo_url: logoUrl,
        primary_color: primaryColor.trim() || null,
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
        <SuccessToast
          message="A cégbeállítások sikeresen frissültek!"
          onDismiss={() => setShowToast(false)}
        />
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-8 rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1 sm:p-8"
      >
        {error && (
          <p
            role="alert"
            className="rounded-stripe-sm border border-stripe-ruby/30 bg-stripe-ruby/5 px-3 py-2 font-sohne text-[13px] text-stripe-ruby"
          >
            {error}
          </p>
        )}

        {readOnly && (
          <p className="flex items-start gap-2.5 rounded-stripe-sm border border-stripe-hairline bg-stripe-canvas-soft px-3 py-2.5 font-sohne text-[13px] text-stripe-ink-secondary">
            <Ban className="mt-0.5 h-4 w-4 shrink-0 text-stripe-ruby" aria-hidden />
            Ezeket a cégadatokat a szervezeted Menedzsere állította be, Átvizsgálóként
            itt megtekintheted, de nem módosíthatod őket.
          </p>
        )}

        <div className="flex flex-col gap-5">
          <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">Cégadatok</h2>

          <Input
            label={readOnly ? <LockedFieldLabel>Cég neve</LockedFieldLabel> : 'Cég neve'}
            name="company_name"
            placeholder="Pl. Prémium Autóvizsgáló Kft."
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            disabled={readOnly}
          />
          <Input
            label={readOnly ? <LockedFieldLabel>Céges telefonszám</LockedFieldLabel> : 'Céges telefonszám'}
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+36 20 123 4567"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            disabled={readOnly}
          />
          <Input
            label={readOnly ? <LockedFieldLabel>Céges email cím</LockedFieldLabel> : 'Céges email cím'}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="info@ceged.hu"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-stripe-hairline pt-6">
          <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">
            {readOnly ? <LockedFieldLabel>Céglogó</LockedFieldLabel> : 'Céglogó'}
          </h2>
          <p className="font-sohne text-[13px] font-light text-stripe-ink-mute">
            Ez a logó jelenik meg a Dashboardon és az ügyfeleidnek küldött publikus riport fejlécében.
          </p>
          <LogoUploader userId={userId} logoUrl={logoUrl} onUploaded={setLogoUrl} disabled={readOnly} />
        </div>

        <div className="flex flex-col gap-3 border-t border-stripe-hairline pt-6">
          <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">
            {readOnly ? <LockedFieldLabel>Elsődleges márkaszín</LockedFieldLabel> : 'Elsődleges márkaszín'}
          </h2>
          <p className="font-sohne text-[13px] font-light text-stripe-ink-mute">
            Ez a szín jelenik meg az ügyfeleidnek küldött publikus riport gombjain és kiemelt elemein.
            Ha üresen hagyod, a BMW kék (#1c69d4) lesz az alapértelmezett.
          </p>
          <BrandColorPicker value={primaryColor} onChange={setPrimaryColor} disabled={readOnly} />
        </div>

        {!readOnly && (
          <div className="border-t border-stripe-hairline pt-6">
            <Button type="submit" isLoading={isSaving}>
              Módosítások mentése
            </Button>
          </div>
        )}
      </form>
    </>
  );
}
