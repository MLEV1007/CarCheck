import { Mail, Phone, User } from 'lucide-react';
import { SectionHeading } from '@/components/report/SectionHeading';
import type { PublicReportInspection } from '@/lib/reports/types';

interface InspectorClientCardProps {
  inspection: PublicReportInspection;
}

/**
 * Átvizsgáló és Ügyfél adatok + PDF megjelenítési kapcsolók (2026-08-06),
 * PROJEKT_INSTRUKCIOK.md "Publikus Ügyfélriport" (5.C) kiegészítése, a `get_public_report`
 * RPC (`supabase/migrations/20260806_inspector_and_client_fields.sql`) által visszaadott
 * `inspector_name`/`client_*` mezőkből épül fel.
 *
 * **A láthatóság KÉTSZERESEN védett:** a `show_inspector_on_pdf`/`show_client_on_pdf`
 * kapcsolókat MÁR a szerver-oldali RPC is figyelembe veszi, ha egy kapcsoló ki van
 * kapcsolva, a hozzá tartozó mező (`inspector_name`/`client_name`/`client_phone`/
 * `client_email`) a JSON válaszban is `null`, a Megrendelő telefonszáma/e-mail címe
 * tehát a hálózati válaszban SEM szerepel egy kikapcsolt kapcsolónál (lásd a migráció
 * JSDoc-ját). Ez a komponens emellett a boolean-t is ellenőrzi, ez a "második"
 * védelmi vonal redundáns a jelenlegi RPC-vel, de explicit dokumentálja a szándékot,
 * és robusztus marad akkor is, ha a jövőben az RPC mégis mindig visszaadná a nyers
 * mezőket.
 *
 * Ugyanaz a minta, mint a `FinalAssessmentCard`/`ServiceHistoryCard`-nál: ha egyik
 * blokknak sincs megjelenítendő tartalma, a teljes szekció `return null`-t ad, hogy
 * ne maradjon egy üres fejléc a riporton. BMW design: `rounded-none`, hairline
 * szegélyű kártyák.
 */
export function InspectorClientCard({ inspection }: InspectorClientCardProps) {
  const showInspector = inspection.show_inspector_on_pdf && Boolean(inspection.inspector_name?.trim());
  const clientContactLines = [inspection.client_phone, inspection.client_email].filter(
    (value): value is string => Boolean(value?.trim())
  );
  const showClient =
    inspection.show_client_on_pdf && (Boolean(inspection.client_name?.trim()) || clientContactLines.length > 0);

  if (!showInspector && !showClient) return null;

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <SectionHeading eyebrow="Kapcsolat" title="Átvizsgáló és megrendelő" />

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {showInspector && (
          <div className="flex items-start gap-3 border border-bmw-hairline p-5">
            <User className="mt-0.5 h-5 w-5 shrink-0 text-[var(--report-accent)]" />
            <div className="min-w-0">
              <p className="text-[13px] font-bold uppercase tracking-[1px] text-bmw-muted">Átvizsgálást végezte</p>
              <p className="mt-1 truncate text-[16px] font-bold text-bmw-ink">{inspection.inspector_name}</p>
            </div>
          </div>
        )}

        {showClient && (
          <div className="border border-bmw-hairline p-5">
            <p className="text-[13px] font-bold uppercase tracking-[1px] text-bmw-muted">Megrendelő</p>
            {inspection.client_name?.trim() && (
              <p className="mt-1 truncate text-[16px] font-bold text-bmw-ink">{inspection.client_name}</p>
            )}
            {clientContactLines.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {inspection.client_phone?.trim() && (
                  <p className="flex items-center gap-2 truncate text-[14px] font-light text-bmw-body">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-bmw-muted" />
                    {inspection.client_phone}
                  </p>
                )}
                {inspection.client_email?.trim() && (
                  <p className="flex items-center gap-2 truncate text-[14px] font-light text-bmw-body">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-bmw-muted" />
                    {inspection.client_email}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
