'use client';

import { useState } from 'react';
import { Fingerprint, Loader2, Smartphone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { SuccessToast } from '@/components/settings/SuccessToast';

interface RegisteredPasskey {
  id: string;
  friendlyName: string;
  createdAt: string;
}

/**
 * "Biometrikus azonosítás (Face ID / Touch ID)" kártya a Cégbeállítások oldalon --
 * jelszómentes/Passkey (WebAuthn) hitelesítés bekötése (lásd PROJEKT_INSTRUKCIOK.md
 * "Átállás Jelszómentes hitelesítésre" lépés).
 *
 * `supabase.auth.registerPasskey()` egy MEGLÉVŐ, bejelentkezett munkamenetet igényel
 * (a Supabase dokumentáció szerint anonim/nem-bejelentkezett userhez nem regisztrálható
 * passkey) -- mivel ez a kártya a védett `/settings` oldalon él, ez a feltétel mindig
 * teljesül. A regisztráció a böngésző saját Face ID / Touch ID / biztonsági kulcs
 * felugróját nyitja meg (`navigator.credentials.create()`), NEM egy egyedi UI-t.
 *
 * Stripe design system: fehér `card-feature-light` kártya, ugyanaz a minta, mint a
 * SettingsForm szekciói (hairline elválasztó, `rounded-full` pill gomb).
 */
export function PasskeyCard() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [registeredPasskeys, setRegisteredPasskeys] = useState<RegisteredPasskey[]>([]);

  async function handleRegister() {
    setError(null);
    setShowToast(false);
    setIsRegistering(true);

    const supabase = createClient();

    try {
      const { data, error: registerError } = await supabase.auth.registerPasskey();

      if (registerError) {
        setError(describePasskeyError(registerError));
        setIsRegistering(false);
        return;
      }

      setRegisteredPasskeys((prev) => [
        ...prev,
        {
          id: data.id,
          friendlyName: data.friendly_name ?? 'Ismeretlen eszköz',
          createdAt: data.created_at,
        },
      ]);
      setShowToast(true);
    } catch (err) {
      // Váratlan, nem WebAuthnError/AuthError kivétel (pl. a böngésző egyáltalán nem
      // támogatja a navigator.credentials API-t) -- ugyanazzal a diszkrét hibasávval kezeljük.
      setError(describePasskeyError(err));
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <>
      {showToast && (
        <SuccessToast
          message="Face ID / Touch ID sikeresen rögzítve ehhez a fiókhoz!"
          onDismiss={() => setShowToast(false)}
        />
      )}

      <div className="flex flex-col gap-4 rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stripe-primary/10 text-stripe-primary">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">
              Biometrikus azonosítás (Face ID / Touch ID)
            </h2>
            <p className="font-sohne text-[13px] font-light text-stripe-ink-mute">
              Jelszó nélkül, egy érintéssel jelentkezhetsz be, ha regisztrálsz egy passkey-t ehhez a
              fiókhoz.
            </p>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-stripe-sm border border-stripe-ruby/30 bg-stripe-ruby/5 px-3 py-2 font-sohne text-[13px] text-stripe-ruby"
          >
            {error}
          </p>
        )}

        {registeredPasskeys.length > 0 && (
          <ul className="flex flex-col gap-2">
            {registeredPasskeys.map((passkey) => (
              <li
                key={passkey.id}
                className="flex items-center gap-2.5 rounded-stripe-sm border border-stripe-hairline bg-stripe-canvas-soft px-3 py-2"
              >
                <Smartphone className="h-4 w-4 shrink-0 text-stripe-ink-mute" />
                <span className="font-sohne text-[13px] text-stripe-ink-secondary">
                  {passkey.friendlyName}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div>
          <Button type="button" variant="secondary" onClick={handleRegister} disabled={isRegistering}>
            {isRegistering ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Rögzítés folyamatban…
              </>
            ) : (
              '➕ Új eszköz / Face ID hozzáadása'
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * A `registerPasskey()` hibája vagy `WebAuthnError` (a böngésző WebAuthn ceremónia hibája,
 * pl. megszakítás), vagy `AuthError` (szerver oldali válasz). A `WebAuthnError.code` mezőt
 * duck-typing-gal olvassuk (nem importáljuk az `isWebAuthnError` type guardot közvetlenül
 * az `@supabase/auth-js`-ből, mert az csak tranzitív függőség, nem szerepel a package.json-ban).
 */
function describePasskeyError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;

  if (code === 'ERROR_CEREMONY_ABORTED') {
    return 'Megszakítottad a Face ID / Touch ID beolvasást. Próbáld újra, ha szeretnéd rögzíteni.';
  }

  const message = (error as { message?: string } | null)?.message;
  return message
    ? `Nem sikerült rögzíteni a passkey-t: ${message}`
    : 'Nem sikerült rögzíteni a passkey-t. Ellenőrizd, hogy az eszközöd és böngésződ támogatja-e a Face ID / Touch ID / biztonsági kulcs használatát, majd próbáld újra.';
}
