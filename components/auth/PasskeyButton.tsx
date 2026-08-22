'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Fingerprint } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

interface PasskeyButtonProps {
  /** Hova irányítson sikeres bejelentkezés után. */
  redirectTo?: string;
  /** A szülő form ide kapja meg a hibaüzenetet (diszkrét, nem dobja el a saját state-jét). */
  onError: (message: string | null) => void;
  /** 'secondary', pl. a Regisztráció oldalon, ahol ez CSAK a már meglévő fiókkal
   * rendelkezőknek releváns, ezért vizuálisan alárendelt a Magic Linkhez képest. */
  variant?: 'primary' | 'secondary';
}

/**
 * Elsődleges, jelszómentes belépési akció (PROJEKT_INSTRUKCIOK.md "Átállás Jelszómentes
 * hitelesítésre" lépés): `supabase.auth.signInWithPasskey()`, discoverable credential
 * ceremónia, NEM kér előre email címet, a böngésző saját Face ID / Touch ID / biztonsági
 * kulcs UI-ja jelenik meg, ami a regisztrált passkey-k közül old fel egyet.
 *
 * Csak akkor működik, ha a usernek MÁR van regisztrált passkey-je (lásd /settings
 * PasskeyCard.tsx), új usernél ez a gomb "nincs ilyen credential" jellegű hibát ad,
 * ezért a form másodlagos, mindig működő fallbackja a Magic Link (lásd MagicLinkForm.tsx).
 */
export function PasskeyButton({
  redirectTo = '/dashboard',
  onError,
  variant = 'primary',
}: PasskeyButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleClick() {
    onError(null);
    setIsLoading(true);

    const supabase = createClient();

    try {
      const { data, error } = await supabase.auth.signInWithPasskey();

      if (error || !data?.session) {
        onError(describeSignInError(error));
        setIsLoading(false);
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      onError(describeSignInError(err));
      setIsLoading(false);
    }
  }

  return (
    <Button type="button" variant={variant} onClick={handleClick} isLoading={isLoading} fullWidth>
      {!isLoading && <Fingerprint className="h-[18px] w-[18px]" />}
      👆 Belépés Face ID / Touch ID-val
    </Button>
  );
}

function describeSignInError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;

  if (code === 'ERROR_CEREMONY_ABORTED') {
    return 'Megszakítottad a Face ID / Touch ID azonosítást. Próbáld újra, vagy használd az e-mailes belépést.';
  }

  // "The RP ID '...' is invalid for this domain.", 2026-08-04, hibajavítás (lásd
  // status.md, `lib/supabase/client.ts` JSDoc-ja): ez a Supabase Dashboard
  // Authentication -> Passkeys beállításánál rögzített Relying Party ID és a TÉNYLEGES
  // domain eltérése (pl. custom domain bekötése után a Dashboardon elfelejtett
  // frissítés), ADMINISZTRÁTORI konfigurációs hiba, NEM a felhasználó eszközének
  // problémája, ezért itt külön, félreérthetetlen üzenettel jelezzük, ahelyett hogy a
  // generikus "nem sikerült ezen az eszközön" szöveg tévesen a saját gépükre terelné a
  // gyanút.
  const message = (error as { message?: string } | null)?.message ?? '';
  if (/rp id/i.test(message) && /invalid/i.test(message)) {
    return 'A Face ID / Touch ID belépés jelenleg nincs beállítva erre a domainre (adminisztrátori beállítás, nem a te eszközöd hibája), addig kérj belépési linket e-mailben.';
  }

  return 'Nem sikerült a Face ID / Touch ID azonosítás ezen az eszközön. Ha még nincs regisztrált passkey-d, kérj belépési linket e-mailben.';
}
