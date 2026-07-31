'use client';

import { FormEvent, useState } from 'react';
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
}

/**
 * Cégbeállítások form (PROJEKT_INSTRUKCIOK.md 5.A + a "Cégbeállítások oldal" lépés):
 * a bejelentkezett user `profiles` sorát frissíti `auth.uid()` alapján. Minden mező
 * kliens-oldali state-ben él, a tényleges Supabase írás csak a "Módosítások mentése"
 * gombra történik (a logó KIVÉTEL: az azonnal, fájlválasztáskor feltöltődik a Storage-ba,
 * lásd LogoUploader.tsx -- csak a `profiles.logo_url` mezőbe kerülés vár a mentésre).
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
    setError(null);
    setShowToast(false);
    setIsSaving(true);

    const supabase = createClient();
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: userId,
      company_name: companyName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      logo_url: logoUrl,
      primary_color: primaryColor.trim() || null,
    });

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

        <div className="flex flex-col gap-5">
          <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">Cégadatok</h2>

          <Input
            label="Cég neve"
            name="company_name"
            placeholder="Pl. Prémium Autóvizsgáló Kft."
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />
          <Input
            label="Céges telefonszám"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+36 20 123 4567"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <Input
            label="Céges email cím"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="info@ceged.hu"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-stripe-hairline pt-6">
          <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">Céglogó</h2>
          <p className="font-sohne text-[13px] font-light text-stripe-ink-mute">
            Ez a logó jelenik meg a Dashboardon és az ügyfeleidnek küldött publikus riport fejlécében.
          </p>
          <LogoUploader userId={userId} logoUrl={logoUrl} onUploaded={setLogoUrl} />
        </div>

        <div className="flex flex-col gap-3 border-t border-stripe-hairline pt-6">
          <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">Elsődleges márkaszín</h2>
          <p className="font-sohne text-[13px] font-light text-stripe-ink-mute">
            Ez a szín jelenik meg az ügyfeleidnek küldött publikus riport gombjain és kiemelt elemein.
            Ha üresen hagyod, a BMW kék (#1c69d4) lesz az alapértelmezett.
          </p>
          <BrandColorPicker value={primaryColor} onChange={setPrimaryColor} />
        </div>

        <div className="border-t border-stripe-hairline pt-6">
          <Button type="submit" isLoading={isSaving}>
            Módosítások mentése
          </Button>
        </div>
      </form>
    </>
  );
}
