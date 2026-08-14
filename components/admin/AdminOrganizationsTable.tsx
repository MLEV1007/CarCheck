'use client';

import { useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PLAN_TIER_LABELS } from '@/components/settings/BillingTab';
import type { QuotaPlanTier } from '@/types/quotas';

/** Egy szervezeti tag sora a "Csapattagok és meghívások" panelhez (2026-08-14,
 * "Meghívás-attribúció" lépés, a felhasználó explicit kérésére: "a /admin oldalon is
 * egyértelműen szeretném látni, hogy melyik menedzseri fiók kit hívott meg"). Lásd
 * `app/admin/page.tsx` `memberRows`-ját. */
export interface AdminOrganizationMemberRow {
  id: string;
  email: string | null;
  role: 'manager' | 'inspector';
  /** A meghívó Menedzser email címe -- `null`, ha ez a tag Menedzser (saját
   * regisztráció, nem meghívás), VAGY ha Átvizsgáló, de a meghívás e funkció
   * BEVEZETÉSE ELŐTT történt (akkor még nem lett rögzítve a `profiles.invited_by`). */
  invitedByEmail: string | null;
}

export interface AdminOrganizationRow {
  id: string;
  name: string;
  createdAt: string;
  teamManagementEnabled: boolean;
  managerEmails: string[];
  memberCount: number;
  /** Soronkénti tagsor -- lásd `AdminOrganizationMemberRow` JSDoc-ját. */
  members: AdminOrganizationMemberRow[];
  /** Az `inspections` táblából, kliens-oldalon összeszámolt, ÖSSZES (nem csak a havi
   * keretbe eső) vizsgálat, amit ez a szervezet valaha indított -- lásd
   * `app/admin/page.tsx` `inspectionCountsByOrg`. Csak megjelenítési statisztika, NEM
   * szerkeszthető innen. */
  totalInspectionsCreated: number;
  planTier: QuotaPlanTier;
  monthlyInspectionsLimit: number;
  monthlyInspectionsRemaining: number;
  purchasedInspectionsRemaining: number;
  monthlyAiLimit: number;
  monthlyAiRemaining: number;
  purchasedAiRemaining: number;
  /** Nyers Stripe `Subscription.status` (active/trialing/past_due/canceled/unpaid stb.)
   * -- `null`, ha a szervezetnek soha nem volt Stripe-előfizetése (pl. mindig `free`
   * maradt, vagy csak egyszeri Top-up-ot vásárolt). Lásd `app/api/stripe/webhook/route.ts`
   * `handleSubscriptionEvent`. */
  subscriptionStatus: string | null;
  /** ISO timestamp -- a Stripe-előfizetés aktuális számlázási ciklusának vége (meddig
   * érvényes/mikor újul meg). `null`, ha nincs Stripe-előfizetés. */
  subscriptionCurrentPeriodEnd: string | null;
}

interface AdminOrganizationsTableProps {
  organizations: AdminOrganizationRow[];
}

/** Csak MEGJELENÍTÉSI célra -- nyers Stripe `Subscription.status` -> magyar címke. Nem
 * teljes lista (a Stripe-nak több státusza is van), a projektben eddig ténylegesen
 * előforduló/releváns értékekre szűkítve, ismeretlen érték esetén a nyers string jelenik
 * meg (defenzív fallback, lásd a `subscriptionStatusLabel` függvényt lent). */
const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: 'Aktív',
  trialing: 'Próbaidőszak',
  past_due: 'Lejárt fizetés',
  canceled: 'Lemondva',
  unpaid: 'Nem fizetett',
  incomplete: 'Függőben',
  incomplete_expired: 'Lejárt (befejezetlen)',
  paused: 'Szüneteltetve',
};

function subscriptionStatusLabel(status: string): string {
  return SUBSCRIPTION_STATUS_LABELS[status] ?? status;
}

/** A `user_credits` szerkeszthető mezői -- a Platform Admin ITT állíthatja át kézzel,
 * belső felülbírálásként (Levi döntése, 2026-08-11: ez NEM hív Stripe API írási
 * műveletet, csak a mi adatbázisunkban élő keretet módosítja, lásd
 * `20260811120000_admin_credits_management.sql` migráció bevezetőjét). */
interface CreditFormState {
  planTier: QuotaPlanTier;
  monthlyInspectionsLimit: number;
  monthlyInspectionsRemaining: number;
  purchasedInspectionsRemaining: number;
  monthlyAiLimit: number;
  monthlyAiRemaining: number;
  purchasedAiRemaining: number;
}

function toFormState(org: AdminOrganizationRow): CreditFormState {
  return {
    planTier: org.planTier,
    monthlyInspectionsLimit: org.monthlyInspectionsLimit,
    monthlyInspectionsRemaining: org.monthlyInspectionsRemaining,
    purchasedInspectionsRemaining: org.purchasedInspectionsRemaining,
    monthlyAiLimit: org.monthlyAiLimit,
    monthlyAiRemaining: org.monthlyAiRemaining,
    purchasedAiRemaining: org.purchasedAiRemaining,
  };
}

/** Egyetlen szám-mező szerkesztő -- a Platform Admin panel 6 azonos felépítésű
 * mezőjéhez (havi/vásárolt vizsgálat + AI keret), hogy az input JSX ne 6x duplikálódjon. */
function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.3px] text-linear-ink-subtle">{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) && next >= 0 ? next : 0);
        }}
        className="h-9 w-full rounded-md border border-linear-hairline bg-linear-canvas px-2.5 text-[13px] tabular-nums text-linear-ink outline-none transition-colors focus:border-linear-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

/**
 * "Csapattagok és meghívások" panel (2026-08-14, "Meghívás-attribúció" lépés) -- a
 * kibontható kredit-panel ALATT, ugyanabban a `bg-linear-canvas` szekcióban jelenik
 * meg: soronként egy tag (email + szerepkör-jelvény), Menedzsernél "Saját
 * regisztráció", Átvizsgálónál "Meghívta: <email>" (vagy "Meghívó nincs rögzítve", ha
 * a meghívás e funkció bevezetése ELŐTT történt). Csak MEGJELENÍTÉS, nem
 * szerkeszthető innen.
 */
function MembersPanel({ members }: { members: AdminOrganizationMemberRow[] }) {
  if (members.length === 0) return null;

  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-linear-hairline pt-5">
      <p className="text-[12px] font-medium uppercase tracking-[0.3px] text-linear-ink-subtle">
        Csapattagok és meghívások
      </p>
      <div className="overflow-hidden rounded-md border border-linear-hairline">
        <ul className="divide-y divide-linear-hairline">
          {members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] text-linear-ink">{member.email ?? 'Ismeretlen email'}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    member.role === 'manager'
                      ? 'bg-linear-primary/10 text-linear-primary'
                      : 'bg-linear-surface-2 text-linear-ink-subtle'
                  }`}
                >
                  {member.role === 'manager' ? 'Menedzser' : 'Átvizsgáló'}
                </span>
              </div>
              <span className="shrink-0 text-[12px] text-linear-ink-subtle">
                {member.role === 'manager'
                  ? 'Saját regisztráció'
                  : member.invitedByEmail
                    ? `Meghívta: ${member.invitedByEmail}`
                    : 'Meghívó nincs rögzítve'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Platform Admin felület -- szervezetek listája + `team_management_enabled` kapcsoló +
 * (2026-08-11, "Platform Admin kredit/előfizetés-kezelés" lépés) kibontható,
 * szerkeszthető kredit/kvóta/csomag panel soronként. Kizárólag `app/admin/page.tsx`-ből
 * érhető el, ami már Server Component-szinten ellenőrizte a `platform_admins` tagságot --
 * ez a kliens-komponens a tényleges kapcsolgatást/szerkesztést végzi.
 *
 * A `team_management_enabled` kapcsoló logikája VÁLTOZATLAN (lásd az eredeti JSDoc-ot a
 * git történetben) -- az ÚJ rész a kibontható panel: soronként egy chevron-gomb
 * (`expandedId`) nyitja/zárja, a szerkesztő űrlap helyi állapotát (`formStateByOrgId`)
 * csak KIBONTÁSKOR inicializáljuk az aktuális sorból (lusta, hogy egy még nem megnyitott
 * sor módosítása más admin-fülön/frissítés után ne írja felül csendben a felhasználó még
 * el nem mentett szerkesztését -- bár ez az admin felület egyszerre jellemzően egy
 * személy kezében van, ez a védekező minta olcsó és konzisztens a projekt többi
 * optimista-UI mintájával).
 *
 * Mentéskor `user_credits` UPSERT `onConflict: 'organization_id'` -- lásd a mező-szintű
 * JSDoc-ot `AdminOrganizationRow.planTier`-nél: a szervezetnek lehet, hogy MÉG NINCS
 * `user_credits` sora (lazy-create, csak az első tényleges használatkor jönne létre), az
 * UPSERT ilyenkor létrehozza, a `plan_tier`/kvóta mezőket a most beírt értékekre állítva.
 * Az `user_credits_update_platform_admin`/`user_credits_select_platform_admin` RLS
 * policy-k (lásd `20260811120000_admin_credits_management.sql`) teszik ezt biztonságossá,
 * UGYANÚGY, mint a `team_management_enabled` kapcsolónál az `organizations_update_
 * platform_admin` policy.
 *
 * Linear Dark Design Style -- ez egy belső, kizárólag az üzemeltetőnek szánt felület, nem
 * ügyfél-arcú, ezért a "Szakértői Munkaterület" stílusát követi (linear.md).
 */
export function AdminOrganizationsTable({ organizations: initial }: AdminOrganizationsTableProps) {
  const [organizations, setOrganizations] = useState(initial);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formStateByOrgId, setFormStateByOrgId] = useState<Record<string, CreditFormState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveErrorByOrgId, setSaveErrorByOrgId] = useState<Record<string, string | null>>({});
  const [saveSuccessId, setSaveSuccessId] = useState<string | null>(null);

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

  function handleExpand(org: AdminOrganizationRow) {
    if (expandedId === org.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(org.id);
    setSaveSuccessId(null);
    // Lásd a komponens JSDoc-ját -- csak akkor inicializáljuk az űrlapot, ha ehhez a
    // szervezethez MÉG NINCS helyi (esetleg félbehagyott) szerkesztési állapot.
    setFormStateByOrgId((current) =>
      current[org.id] ? current : { ...current, [org.id]: toFormState(org) }
    );
  }

  function updateForm(orgId: string, patch: Partial<CreditFormState>) {
    setFormStateByOrgId((current) => ({
      ...current,
      [orgId]: { ...(current[orgId] as CreditFormState), ...patch },
    }));
  }

  async function handleSaveCredits(orgId: string) {
    const form = formStateByOrgId[orgId];
    if (!form) return;

    setSavingId(orgId);
    setSaveErrorByOrgId((current) => ({ ...current, [orgId]: null }));
    setSaveSuccessId(null);

    const supabase = createClient();
    const { error: upsertError } = await supabase.from('user_credits').upsert(
      {
        organization_id: orgId,
        plan_tier: form.planTier,
        monthly_inspections_limit: form.monthlyInspectionsLimit,
        monthly_inspections_remaining: form.monthlyInspectionsRemaining,
        purchased_inspections_remaining: form.purchasedInspectionsRemaining,
        monthly_ai_limit: form.monthlyAiLimit,
        monthly_ai_remaining: form.monthlyAiRemaining,
        purchased_ai_remaining: form.purchasedAiRemaining,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    );

    setSavingId(null);

    if (upsertError) {
      setSaveErrorByOrgId((current) => ({
        ...current,
        [orgId]: 'A mentés sikertelen. Próbáld újra.',
      }));
      return;
    }

    setOrganizations((current) =>
      current.map((org) =>
        org.id === orgId
          ? {
              ...org,
              planTier: form.planTier,
              monthlyInspectionsLimit: form.monthlyInspectionsLimit,
              monthlyInspectionsRemaining: form.monthlyInspectionsRemaining,
              purchasedInspectionsRemaining: form.purchasedInspectionsRemaining,
              monthlyAiLimit: form.monthlyAiLimit,
              monthlyAiRemaining: form.monthlyAiRemaining,
              purchasedAiRemaining: form.purchasedAiRemaining,
            }
          : org
      )
    );
    setSaveSuccessId(orgId);
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
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[22fr_18fr_10fr_14fr_22fr_14fr] gap-4 border-b border-linear-hairline px-5 py-3 text-[12px] font-medium uppercase tracking-[0.4px] text-linear-ink-subtle">
              <span>Szervezet</span>
              <span>Menedzser</span>
              <span className="text-center">Tagok</span>
              <span className="text-center">Regisztrált</span>
              <span className="text-right">Csapatkezelés</span>
              <span className="text-right">Kredit / csomag</span>
            </div>

            <ul className="divide-y divide-linear-hairline">
              {organizations.map((org) => {
                const isExpanded = expandedId === org.id;
                const form = formStateByOrgId[org.id];

                return (
                  <li key={org.id}>
                    <div className="grid grid-cols-[22fr_18fr_10fr_14fr_22fr_14fr] items-center gap-4 px-5 py-3.5">
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
                          className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            org.teamManagementEnabled ? 'bg-linear-primary' : 'bg-linear-hairline-strong'
                          }`}
                        >
                          <span
                            className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              org.teamManagementEnabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => handleExpand(org)}
                          aria-expanded={isExpanded}
                          className="flex h-8 items-center gap-1.5 rounded-md border border-linear-hairline px-2.5 text-[12px] font-medium text-linear-ink-muted transition-colors hover:bg-linear-canvas hover:text-linear-ink"
                        >
                          {PLAN_TIER_LABELS[org.planTier]}
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>
                      </div>
                    </div>

                    {isExpanded && form && (
                      <div className="border-t border-linear-hairline bg-linear-canvas px-5 py-5">
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1fr_auto]">
                          <div className="flex flex-col gap-3">
                            <p className="text-[12px] font-medium uppercase tracking-[0.3px] text-linear-ink-subtle">
                              Vizsgálati keret
                            </p>
                            <label className="flex flex-col gap-1">
                              <span className="text-[11px] font-medium uppercase tracking-[0.3px] text-linear-ink-subtle">
                                Csomag
                              </span>
                              <select
                                value={form.planTier}
                                onChange={(event) =>
                                  updateForm(org.id, { planTier: event.target.value as QuotaPlanTier })
                                }
                                className="h-9 w-full rounded-md border border-linear-hairline bg-linear-canvas px-2.5 text-[13px] text-linear-ink outline-none transition-colors focus:border-linear-primary"
                              >
                                {(Object.keys(PLAN_TIER_LABELS) as QuotaPlanTier[]).map((tier) => (
                                  <option key={tier} value={tier}>
                                    {PLAN_TIER_LABELS[tier]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <NumberField
                              label="Havi keret (limit)"
                              value={form.monthlyInspectionsLimit}
                              onChange={(next) => updateForm(org.id, { monthlyInspectionsLimit: next })}
                              disabled={savingId === org.id}
                            />
                            <NumberField
                              label="Havi keretből hátralévő"
                              value={form.monthlyInspectionsRemaining}
                              onChange={(next) => updateForm(org.id, { monthlyInspectionsRemaining: next })}
                              disabled={savingId === org.id}
                            />
                            <NumberField
                              label="Vásárolt (Top-up) hátralévő"
                              value={form.purchasedInspectionsRemaining}
                              onChange={(next) => updateForm(org.id, { purchasedInspectionsRemaining: next })}
                              disabled={savingId === org.id}
                            />
                          </div>

                          <div className="flex flex-col gap-3">
                            <p className="text-[12px] font-medium uppercase tracking-[0.3px] text-linear-ink-subtle">
                              AI kredit keret
                            </p>
                            <NumberField
                              label="Havi keret (limit)"
                              value={form.monthlyAiLimit}
                              onChange={(next) => updateForm(org.id, { monthlyAiLimit: next })}
                              disabled={savingId === org.id}
                            />
                            <NumberField
                              label="Havi keretből hátralévő"
                              value={form.monthlyAiRemaining}
                              onChange={(next) => updateForm(org.id, { monthlyAiRemaining: next })}
                              disabled={savingId === org.id}
                            />
                            <NumberField
                              label="Vásárolt hátralévő"
                              value={form.purchasedAiRemaining}
                              onChange={(next) => updateForm(org.id, { purchasedAiRemaining: next })}
                              disabled={savingId === org.id}
                            />
                          </div>

                          <div className="flex flex-col gap-3">
                            <p className="text-[12px] font-medium uppercase tracking-[0.3px] text-linear-ink-subtle">
                              Áttekintés
                            </p>
                            <div className="flex flex-col gap-2 rounded-md border border-linear-hairline bg-linear-surface-1 px-3 py-2.5 text-[13px] text-linear-ink-muted">
                              <div className="flex items-center justify-between gap-3">
                                <span>Összes vizsgálat eddig</span>
                                <span className="tabular-nums text-linear-ink">{org.totalInspectionsCreated}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>Stripe-előfizetés</span>
                                <span className="text-linear-ink">
                                  {org.subscriptionStatus ? subscriptionStatusLabel(org.subscriptionStatus) : 'Nincs'}
                                </span>
                              </div>
                              {org.subscriptionCurrentPeriodEnd && (
                                <div className="flex items-center justify-between gap-3">
                                  <span>Érvényes eddig</span>
                                  <span className="tabular-nums text-linear-ink">
                                    {new Date(org.subscriptionCurrentPeriodEnd).toLocaleDateString('hu-HU', {
                                      year: 'numeric',
                                      month: '2-digit',
                                      day: '2-digit',
                                    })}
                                  </span>
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSaveCredits(org.id)}
                              disabled={savingId === org.id}
                              className="mt-1 flex h-9 items-center justify-center gap-1.5 rounded-md bg-linear-primary px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-linear-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingId === org.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                              Mentés
                            </button>
                            {saveErrorByOrgId[org.id] && (
                              <p className="text-[12px] text-linear-danger">{saveErrorByOrgId[org.id]}</p>
                            )}
                            {saveSuccessId === org.id && !saveErrorByOrgId[org.id] && (
                              <p className="text-[12px] text-linear-primary">Mentve.</p>
                            )}
                          </div>
                        </div>

                        <MembersPanel members={org.members} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
