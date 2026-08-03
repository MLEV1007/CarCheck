'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface AdminOrganizationRow {
  id: string;
  name: string;
  createdAt: string;
  teamManagementEnabled: boolean;
  managerEmails: string[];
  memberCount: number;
}

interface AdminOrganizationsTableProps {
  organizations: AdminOrganizationRow[];
}

/**
 * Platform Admin felület -- szervezetek listája + `team_management_enabled`
 * kapcsoló (PROJEKT_INSTRUKCIOK.md-n TÚLI, a felhasználó explicit kérésére épített
 * lépés: "szeretném úgy, hogy én a jövőben tudjam állítani, hogy melyik ügyfélnek
 * járhat manageri fiók és csapattagok hozzáadása"). Kizárólag `app/admin/page.tsx`-ből
 * érhető el, ami már Server Component-szinten ellenőrizte a `platform_admins`
 * tagságot -- ez a kliens-komponens a tényleges kapcsolgatást végzi.
 *
 * A módosítás közvetlenül a böngésző-kliens Supabase-en keresztül történik (nincs
 * külön API route rá szükség) -- ezt az `organizations_update_platform_admin` RLS
 * policy teszi biztonságossá (lásd `supabase/migrations/
 * 20260803_platform_admin_entitlements.sql`): az adatbázis-szinten van garantálva,
 * hogy EZT a módosítást kizárólag a `platform_admins` táblában szereplő user
 * futtathatja sikeresen, BÁRMELYIK szervezetre -- a Server Component-es guard csak
 * UX, nem az egyetlen védelmi vonal.
 *
 * Linear Dark Design Style -- ez egy belső, kizárólag az üzemeltetőnek szánt
 * felület, nem ügyfél-arcú, ezért a "Szakértői Munkaterület" stílusát követi
 * (linear.md), nem a Stripe/BMW rendszereket.
 */
export function AdminOrganizationsTable({ organizations: initial }: AdminOrganizationsTableProps) {
  const [organizations, setOrganizations] = useState(initial);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(orgId: string, nextValue: boolean) {
    setError(null);
    setTogglingId(orgId);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('organizations')
      .update({ team_management_enabled: nextValue })
      .eq('id', orgId);

    setTogglingId(null);

    if (updateError) {
      setError('A módosítás sikertelen. Próbáld újra.');
      return;
    }

    setOrganizations((current) =>
      current.map((org) => (org.id === orgId ? { ...org, teamManagementEnabled: nextValue } : org))
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-md border border-linear-danger/30 bg-linear-danger-soft px-4 py-2.5 text-[13px] text-linear-danger">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-linear-hairline bg-linear-surface-1 shadow-sm">
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[26fr_20fr_14fr_16fr_24fr] gap-4 border-b border-linear-hairline px-5 py-3 text-[12px] font-medium uppercase tracking-[0.4px] text-linear-ink-subtle">
              <span>Szervezet</span>
              <span>Menedzser</span>
              <span className="text-center">Tagok</span>
              <span className="text-center">Regisztrált</span>
              <span className="text-right">Csapatkezelés</span>
            </div>

            <ul className="divide-y divide-linear-hairline">
              {organizations.map((org) => (
                <li
                  key={org.id}
                  className="grid grid-cols-[26fr_20fr_14fr_16fr_24fr] items-center gap-4 px-5 py-3.5"
                >
                  <span className="truncate text-[14px] font-medium text-linear-ink">{org.name}</span>
                  <span className="truncate text-[13px] text-linear-ink-muted">
                    {org.managerEmails.join(', ') || '—'}
                  </span>
                  <span className="text-center text-[13px] text-linear-ink-muted">{org.memberCount}</span>
                  <span className="text-center text-[13px] text-linear-ink-muted">
                    {new Date(org.createdAt).toLocaleDateString('hu-HU', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                    })}
                  </span>
                  <div className="flex items-center justify-end gap-2.5">
                    <span className="text-[12px] text-linear-ink-subtle">
                      {org.teamManagementEnabled ? 'Engedélyezve' : 'Letiltva'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={org.teamManagementEnabled}
                      disabled={togglingId === org.id}
                      onClick={() => handleToggle(org.id, !org.teamManagementEnabled)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                        org.teamManagementEnabled ? 'bg-linear-primary' : 'bg-linear-hairline-strong'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          org.teamManagementEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
