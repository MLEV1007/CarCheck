'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface DeleteAccountCardProps {
  email: string;
  role: 'manager' | 'inspector';
  /** Csak Menedzsernek releváns -- a szervezet TÖBBI (rajta kívüli) tagjának száma, a
   * figyelmeztető szöveg testreszabásához (lásd `SettingsPage` `teamMemberCount`
   * lekérdezését). */
  otherTeamMemberCount: number;
}

/**
 * "Fiók törlése" -- Veszélyzóna kártya a Cégbeállítások oldal alján (Stripe design
 * system, `stripe-ruby` akcentussal a többi kártya semleges stílusa helyett, hogy
 * vizuálisan is elkülönüljön mint destruktív művelet).
 *
 * **A felhasználó KIFEJEZETT feltétele (2026-08-04): a korábban rögzített vizsgálatok
 * (autók, fotók, riportok) adatai a fióktörléssel NE vesszenek el.** Ez adatbázis-szinten
 * garantált (lásd `supabase/migrations/20260804_account_deletion_safe_fks.sql` -- az
 * `inspections`/`paint_measurements`/`defects` sorok `organization_id`-je érintetlen
 * marad, csak a törölt userre mutató `user_id`/`created_by` válik NULL-lá), NEM a
 * kliens-oldali kódon -- ez a komponens csak a felhasználói folyamatot (megerősítés,
 * kijelentkezés) kezeli.
 *
 * **Megerősítés:** a user begépeli a SAJÁT email címét egy modalban, mielőtt a végleges
 * törlés gomb aktívvá válna -- ugyanaz a mintázat, mint egy natív `window.confirm()`
 * helyett a Dashboard vizsgálat-törlésénél (lásd 18. szakasz, status.md), csak itt egy
 * ENNÉL komolyabb, VISSZAVONHATATLAN műveletről van szó (a teljes fiók, bejelentkezés,
 * beállítások eltűnnek), ezért az egyszerű OK/Mégse dialógusnál szigorúbb megerősítés
 * indokolt.
 */
export function DeleteAccountCard({ email, role, otherTeamMemberCount }: DeleteAccountCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4 rounded-stripe-lg border border-stripe-ruby/30 bg-stripe-ruby/5 p-6 shadow-stripe-1 sm:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stripe-ruby/10 text-stripe-ruby">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">Veszélyzóna</h2>
          <p className="font-sohne text-[13px] font-light text-stripe-ink-mute">Fiók törlése</p>
        </div>
      </div>

      <p className="font-sohne text-[13px] font-light leading-relaxed text-stripe-ink-secondary">
        A fiókod törlése után nem tudsz többé bejelentkezni ezzel az email címmel, és a
        személyes beállításaid (Face ID / Touch ID passkey-k stb.) elvesznek.{' '}
        <span className="font-normal text-stripe-ink">
          A korábban rögzített vizsgálatok, fotók és riportok adatai a törléssel NEM
          vesznek el
        </span>{' '}
        -- ezek a cégedhez tartoznak, nem a személyes fiókodhoz.
      </p>

      {role === 'manager' &&
        (otherTeamMemberCount > 0 ? (
          <p className="rounded-stripe-sm border border-stripe-ruby/20 bg-white px-3 py-2 font-sohne text-[13px] font-light text-stripe-ink-secondary">
            {otherTeamMemberCount} másik csapattagod is van -- a törlés után nem marad
            Menedzser a cégnél (senki nem tudja majd meghívni/kezelni a csapatot), de a
            csapattagjaid a jelenlegi jogosultságukkal továbbra is hozzáférnek a
            vizsgálatokhoz.
          </p>
        ) : (
          <p className="rounded-stripe-sm border border-stripe-ruby/20 bg-white px-3 py-2 font-sohne text-[13px] font-light text-stripe-ink-secondary">
            Te vagy az egyetlen felhasználó a cégednél -- a törlés után senki nem fog
            tudni bejelentkezni, hogy megtekintse a korábbi vizsgálatokat (bár azok az
            adatbázisban megmaradnak).
          </p>
        ))}

      {role === 'inspector' && (
        <p className="rounded-stripe-sm border border-stripe-ruby/20 bg-white px-3 py-2 font-sohne text-[13px] font-light text-stripe-ink-secondary">
          A Menedzsered és a csapatod továbbra is hozzáfér a korábban rögzített
          vizsgálataidhoz.
        </p>
      )}

      <div>
        <Button type="button" variant="danger" onClick={() => setIsModalOpen(true)}>
          Fiók törlése
        </Button>
      </div>

      {isModalOpen && <DeleteAccountModal email={email} onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}

function DeleteAccountModal({ email, onClose }: { email: string; onClose: () => void }) {
  const router = useRouter();
  const [confirmEmail, setConfirmEmail] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmed = confirmEmail.trim().toLowerCase() === email.trim().toLowerCase();

  async function handleDelete() {
    if (!isConfirmed || isDeleting) return;

    setError(null);
    setIsDeleting(true);

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        setError(result?.error ?? 'Nem sikerült törölni a fiókot. Próbáld újra.');
        setIsDeleting(false);
        return;
      }

      // A szerveren a user már törölve van az `auth.users`-ből -- a helyi böngésző-
      // session cookie-i emiatt érvénytelenné váltak, de ezt explicit `signOut()`-tal
      // is töröljük, hogy a middleware/kliens azonnal, biztosan kijelentkezett
      // állapotot lásson (ne egy már nem létező userre mutató, elavult cookie-t).
      const supabase = createClient();
      await supabase.auth.signOut();

      router.push('/login?accountDeleted=1');
      router.refresh();
    } catch {
      setError('Váratlan hiba történt a fiók törlése közben. Próbáld újra.');
      setIsDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={isDeleting ? undefined : onClose}
      role="presentation"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Fiók törlésének megerősítése"
        className="w-full max-w-md rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-sohne text-[16px] font-normal text-stripe-ink">
            Biztosan törlöd a fiókodat?
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Bezárás"
            className="rounded-full p-1 text-stripe-ink-mute transition-colors hover:bg-stripe-canvas-soft hover:text-stripe-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 font-sohne text-[13px] font-light text-stripe-ink-mute">
          Ez a művelet nem vonható vissza. A megerősítéshez írd be a saját email
          címedet (<span className="font-normal text-stripe-ink">{email}</span>).
        </p>

        <div className="mt-4">
          <Input
            label="Email cím"
            type="email"
            placeholder={email}
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            disabled={isDeleting}
            autoFocus
          />
        </div>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-stripe-sm border border-stripe-ruby/30 bg-stripe-ruby/5 px-3 py-2 font-sohne text-[13px] text-stripe-ruby"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isDeleting}>
            Mégse
          </Button>
          <Button type="button" variant="danger" onClick={handleDelete} disabled={!isConfirmed || isDeleting}>
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Törlés folyamatban…
              </>
            ) : (
              'Fiók végleges törlése'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
