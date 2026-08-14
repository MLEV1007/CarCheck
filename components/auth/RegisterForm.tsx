'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PasskeyButton } from '@/components/auth/PasskeyButton';
import { MagicLinkForm } from '@/components/auth/MagicLinkForm';
import { AuthDivider } from '@/components/auth/AuthDivider';

/**
 * Jelszómentes regisztráció (PROJEKT_INSTRUKCIOK.md "Átállás Jelszómentes hitelesítésre"
 * lépés): NINCS jelszó mező és NINCS Google OAuth gomb.
 *
 * FONTOS ELTÉRÉS a Login oldalhoz képest: itt a Magic Link az ELSŐDLEGES (és egyetlen ténylegesen
 * működő) akció, NEM a Passkey gomb. Indoklás: egy vadonatúj felhasználónak per definíció még
 * nincs regisztrált passkey-je, ezért a `signInWithPasskey()` MINDIG hibával tér vissza neki --
 * ha ez lenne a legfeltűnőbb gomb a regisztrációs oldalon, az minden új usernek úgy tűnne, mintha
 * "a regisztráció nem működne". A tényleges fiók-létrehozás a Magic Linken keresztül történik (a
 * Supabase alapértelmezetten létrehozza a fiókot az e-mail linkre kattintáskor -- `signInWithOtp`
 * `shouldCreateUser` alapértéke `true`); a Passkey gomb itt csak másodlagos, halkabb link marad
 * azoknak, akik tévedésből a Regisztráció oldalra jöttek, pedig már van fiókjuk és passkey-jük.
 *
 * **Csapattag-meghívás (2026-08-03, "Szervezeti szerepkezelés" lépés):** ha a user egy
 * `/register?invite=<organization_id>` linkről érkezett (lásd `TeamManagement.tsx`
 * "Csapattag meghívása" modaljának generált linkjét), a `?invite=` query paramétert a
 * `MagicLinkForm`-nak adjuk tovább `signUpData`-ként -- a `handle_new_user()` DB trigger
 * ez alapján a MEGLÉVŐ szervezethez, 'inspector' szerepkörrel csatlakoztatja, a "sima"
 * (nem meghívott) regisztráció helyett, ami mindig új, önálló szervezetet hoz létre.
 * **2026-08-14, "Meghívás-attribúció" lépés:** ugyanígy a `?invited_by=<manager_id>`
 * paramétert is továbbadjuk (ha jelen van) -- ez kerül a `profiles.invited_by` mezőbe,
 * hogy a Platform Admin (`/admin`) felületen látszódjon, MELYIK Menedzser hívta meg ezt
 * az Átvizsgálót (lásd `TeamManagement.tsx` meghívó-link generálását).
 *
 * **Meghívás-ellenőrzés hibaüzenete (2026-08-04, hibajavítás -- lásd status.md):** az
 * `/auth/callback` `?error=invite_not_applied` paraméterrel irányít ide vissza, ha a
 * meghívó link NEM érvényesült ténylegesen (leggyakoribb ok: a meghívott email címhez
 * már létezett fiók a rendszerben, ezért a `handle_new_user()` trigger nem futott le
 * rá -- lásd `MagicLinkForm.tsx` és `app/auth/callback/route.ts` JSDoc-ját).
 */
const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  invite_not_applied:
    'A meghívás nem érvényesült ennél a fióknál. Ha ezzel az email címmel már korábban ' +
    'regisztráltál, jelentkezz be a meglévő fiókoddal -- a csapattagsághoz kérd meg azt, ' +
    'aki meghívott, hogy vegye fel veled külön a kapcsolatot. Ha ez az első fiókod, kérd ' +
    'meg a meghívó Managert, hogy ellenőrizze, engedélyezve van-e a csapatkezelés a cégéhez.',
};

export function RegisterForm() {
  const searchParams = useSearchParams();
  const callbackError = searchParams.get('error');
  const [error, setError] = useState<string | null>(
    callbackError ? CALLBACK_ERROR_MESSAGES[callbackError] ?? 'Váratlan hiba történt. Próbáld újra.' : null
  );
  const [magicLinkSentTo, setMagicLinkSentTo] = useState<string | null>(null);
  const inviteOrgId = searchParams.get('invite');
  // `invited_by` (2026-08-14, "Meghívás-attribúció" lépés) -- a meghívó Menedzser user
  // id-ja, amit a `TeamManagement.tsx` "Csapattag meghívása" modalja éget bele a linkbe
  // -- lásd a `signUpData` JSDoc-ját lent.
  const invitedBy = searchParams.get('invited_by');

  if (magicLinkSentTo) {
    return (
      <div className="flex flex-col gap-4 rounded-stripe-md border border-stripe-hairline bg-white p-6 text-center">
        <p className="font-sohne text-[16px] font-normal text-stripe-ink">
          ✉️ Ellenőrizd a postaládádat!
        </p>
        <p className="font-sohne text-[15px] font-light text-stripe-ink">
          Elküldtük a biztonsági belépési linket a(z) <span className="font-normal">{magicLinkSentTo}</span>{' '}
          címre. A linkre kattintva jön létre / aktiválódik a fiókod -- utána a Beállítások oldalon
          rögzítheted a Face ID / Touch ID-t a jövőbeli gyors belépéshez.
        </p>
        <button
          type="button"
          onClick={() => setMagicLinkSentTo(null)}
          className="font-sohne text-[14px] font-normal text-stripe-primary hover:underline"
        >
          Vissza
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p
          role="alert"
          className="rounded-stripe-sm border border-stripe-ruby/30 bg-stripe-ruby/5 px-3 py-2 font-sohne text-[13px] text-stripe-ruby"
        >
          {error}
        </p>
      )}

      {inviteOrgId && (
        <p className="rounded-stripe-sm border border-stripe-primary/30 bg-stripe-primary/5 px-3 py-2 font-sohne text-[13px] text-stripe-primary">
          👥 Csapatba lettél meghívva -- a regisztráció után Átvizsgálóként csatlakozol a meghívó cégéhez.
        </p>
      )}

      <MagicLinkForm
        redirectTo="/dashboard"
        onSent={setMagicLinkSentTo}
        onError={setError}
        variant="primary"
        signUpData={
          inviteOrgId
            ? { invite_org_id: inviteOrgId, ...(invitedBy ? { invited_by: invitedBy } : {}) }
            : undefined
        }
      />

      <AuthDivider label="már van fiókod és passkey-d?" />

      <PasskeyButton redirectTo="/dashboard" onError={setError} variant="secondary" />

      <p className="text-center font-sohne text-[14px] font-light text-stripe-ink-mute">
        Már van fiókod?{' '}
        <Link href="/login" className="font-normal text-stripe-primary hover:underline">
          Jelentkezz be
        </Link>
      </p>
    </div>
  );
}
