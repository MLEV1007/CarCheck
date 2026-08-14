'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Loader2, UserPlus, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface TeamMember {
  id: string;
  email: string | null;
  role: 'manager' | 'inspector';
  can_view_all_reports: boolean;
}

interface TeamManagementProps {
  organizationId: string;
  currentUserId: string;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Csapatkezelő felület a Menedzsernek (PROJEKT_INSTRUKCIOK.md "Csapatkezelő Felület a
 * Menedzsernek" lépés) -- a `/settings` oldal "Csapatkezelés" fülében jelenik meg,
 * KIZÁRÓLAG `role === 'manager'`-nek (lásd `app/settings/page.tsx`/`SettingsTabs.tsx`).
 *
 * Stripe design system (stripe.md): fehér `card-feature-light` kártya, `rounded-full`
 * pill gombok, hairline elválasztók -- UGYANAZ a stílus, mint a `SettingsForm.tsx`
 * mellette lévő kártyáknál.
 *
 * A csapattagok listáját ÉS a jogosultság-kapcsolót közvetlenül a böngésző-kliens
 * Supabase-en keresztül kezeli (nincs külön API route rá szükség) -- ezt az
 * `profiles_select_org_manager`/`profiles_update_org_manager` RLS policy-k teszik
 * biztonságossá (lásd `supabase/migrations/20260803_organizations_rbac.sql`): a
 * szerveren, adatbázis-szinten van garantálva, hogy EZT a lekérdezést/módosítást
 * kizárólag egy tényleges Menedzser futtathatja sikeresen, a SAJÁT szervezetére
 * korlátozva -- a `role === 'manager'` kliens-oldali ellenőrzés (a fül elrejtése) csak
 * UX, nem az egyetlen védelmi vonal.
 */
export function TeamManagement({ organizationId, currentUserId }: TeamManagementProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role, can_view_all_reports')
        .eq('organization_id', organizationId)
        .order('role', { ascending: true })
        .order('email', { ascending: true });

      if (cancelled) return;

      if (error) {
        setState('error');
        return;
      }

      setMembers(data ?? []);
      setState('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  async function handleToggleVisibility(memberId: string, nextValue: boolean) {
    setToggleError(null);
    setTogglingId(memberId);

    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ can_view_all_reports: nextValue })
      .eq('id', memberId);

    setTogglingId(null);

    if (error) {
      setToggleError('A jogosultság módosítása sikertelen. Próbáld újra.');
      return;
    }

    setMembers((current) =>
      current.map((member) => (member.id === memberId ? { ...member, can_view_all_reports: nextValue } : member))
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Users className="h-[18px] w-[18px] text-stripe-primary" />
          <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">Csapatkezelés</h2>
        </div>
        <Button type="button" variant="secondary" onClick={() => setIsInviteOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Csapattag meghívása
        </Button>
      </div>

      <p className="font-sohne text-[13px] font-light text-stripe-ink-mute">
        A csapatod tagjai közösen, a te AI kreditkeretedből dolgoznak. Az Átvizsgálóknak
        alapból csak a saját vizsgálataik láthatók -- a kapcsolóval engedélyezheted, hogy
        a cég ÖSSZES riportját lássák.
      </p>

      {state === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-8 font-sohne text-[13px] text-stripe-ink-mute">
          <Loader2 className="h-4 w-4 animate-spin" />
          Csapattagok betöltése…
        </div>
      )}

      {state === 'error' && (
        <p className="rounded-stripe-sm border border-stripe-ruby/30 bg-stripe-ruby/5 px-3 py-2 font-sohne text-[13px] text-stripe-ruby">
          Nem sikerült betölteni a csapattagokat. Próbáld újra később.
        </p>
      )}

      {state === 'ready' && (
        <div className="flex flex-col gap-2">
          {toggleError && (
            <p className="rounded-stripe-sm border border-stripe-ruby/30 bg-stripe-ruby/5 px-3 py-2 font-sohne text-[13px] text-stripe-ruby">
              {toggleError}
            </p>
          )}

          <div className="overflow-hidden rounded-stripe-md border border-stripe-hairline">
            {members.map((member) => (
              <TeamMemberRow
                key={member.id}
                member={member}
                isSelf={member.id === currentUserId}
                isToggling={togglingId === member.id}
                onToggle={(next) => handleToggleVisibility(member.id, next)}
              />
            ))}
          </div>
        </div>
      )}

      {isInviteOpen && (
        <InviteMemberModal
          organizationId={organizationId}
          currentUserId={currentUserId}
          onClose={() => setIsInviteOpen(false)}
        />
      )}
    </div>
  );
}

function TeamMemberRow({
  member,
  isSelf,
  isToggling,
  onToggle,
}: {
  member: TeamMember;
  isSelf: boolean;
  isToggling: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-stripe-hairline px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-sohne text-[14px] font-normal text-stripe-ink">
          {member.email ?? 'Ismeretlen email'}
          {isSelf && <span className="ml-1.5 font-sohne text-[12px] text-stripe-ink-mute">(te)</span>}
        </p>
        <span
          className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 font-sohne text-[11px] font-medium ${
            member.role === 'manager'
              ? 'bg-stripe-primary/10 text-stripe-primary'
              : 'bg-stripe-canvas-soft text-stripe-ink-secondary'
          }`}
        >
          {member.role === 'manager' ? 'Menedzser' : 'Átvizsgáló'}
        </span>
      </div>

      {member.role === 'inspector' && (
        <label className="flex shrink-0 items-center gap-2.5">
          <span className="font-sohne text-[12px] text-stripe-ink-secondary">
            Láthatja az összes céges riportot
          </span>
          {/* Toggle switch geometria javítás (2026-08-06) -- a korábbi verzió a knob-ot
              `position: absolute` + `top-0.5` + feltételes `translate-x` kombinációval
              pozicionálta, DE `left-*` osztály NÉLKÜL -- a knob vízszintes nyugalmi
              pozíciója emiatt a böngésző "abszolút pozicionált elem statikus pozíciója"
              tartalék-számításától függött, ami a gyakorlatban a szülő elem
              megjelenítési kontextusától függően INKONZISZTENSEN renderelt (halvány
              szín + a knob a jobb szélen túlcsordulva/levágva -- lásd a felhasználó
              screenshotjait). Az ÚJ minta (`flex items-center` + `p-0.5` padding a
              "sínen" + a knob NEM abszolút pozicionált, hanem normál flex-gyerek,
              KIZÁRÓLAG `translate-x`-szel tolva) ugyanaz a hivatalos, robusztus
              Tailwind UI switch-minta -- a knob nyugalmi pozícióját a `p-0.5` padding
              garantálja (nem egy ambiguity-re épülő böngésző-fallback), így minden
              böngészőben/kontextusban determinisztikusan ugyanott jelenik meg. */}
          <button
            type="button"
            role="switch"
            aria-checked={member.can_view_all_reports}
            disabled={isToggling}
            onClick={() => onToggle(!member.can_view_all_reports)}
            className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              member.can_view_all_reports ? 'bg-stripe-primary' : 'bg-stripe-hairline-input'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                member.can_view_all_reports ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </label>
      )}
    </div>
  );
}

function InviteMemberModal({
  organizationId,
  currentUserId,
  onClose,
}: {
  organizationId: string;
  currentUserId: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);

  // `invited_by` (2026-08-14, "Meghívás-attribúció" lépés) -- a hívó (jelen komponenst
  // megnyitó) Menedzser saját user id-ja a linkbe ágyazva, hogy a `handle_new_user()`
  // DB trigger rögzíthesse a `profiles.invited_by` mezőbe, KI hívta meg ezt az
  // Átvizsgálót -- ez teszi lehetővé, hogy a Platform Admin (`/admin`) felületen
  // egyértelműen látszódjon, melyik Menedzser hívott meg kit.
  const inviteLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/register?invite=${organizationId}&invited_by=${currentUserId}`
      : '';

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API nem elérhető -- a user kézzel is kijelölheti/másolhatja a mezőből.
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Csapattag meghívása"
        className="w-full max-w-md rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-sohne text-[16px] font-normal text-stripe-ink">Csapattag meghívása</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Bezárás"
            className="rounded-full p-1 text-stripe-ink-mute transition-colors hover:bg-stripe-canvas-soft hover:text-stripe-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 font-sohne text-[13px] font-light text-stripe-ink-mute">
          Küldd el ezt a regisztrációs linket az új Átvizsgálónak -- a linkre kattintva
          automatikusan a csapatod tagjaként (Átvizsgáló szerepkörrel) jön létre a fiókja,
          és a te AI kreditkeretedet fogja használni.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <Input
            label="Átvizsgáló email címe (csak saját feljegyzés)"
            type="email"
            placeholder="nev@ceged.hu"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <div>
            <label className="mb-1.5 block font-sohne text-[13px] font-normal text-stripe-ink">
              Meghívó / regisztrációs link
            </label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                onFocus={(event) => event.currentTarget.select()}
                className="h-10 flex-1 rounded-stripe-sm border border-stripe-hairline-input bg-stripe-canvas-soft px-3 font-mono text-[12px] text-stripe-ink-secondary"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-stripe-primary px-4 font-sohne text-[13px] font-normal text-white transition-colors hover:bg-stripe-primary-deep"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Másolva' : 'Másolás'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Kész
          </Button>
        </div>
      </div>
    </div>
  );
}
