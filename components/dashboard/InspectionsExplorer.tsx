'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Pencil, Plus, Search } from 'lucide-react';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { InspectionActionsMenu } from '@/components/dashboard/InspectionActionsMenu';
import { createClient } from '@/lib/supabase/client';

export interface InspectionRow {
  id: string;
  car_brand: string | null;
  car_model: string | null;
  license_plate: string | null;
  license_plate_country: string | null;
  vin: string | null;
  year: number | null;
  status: string;
  created_at: string;
  public_token: string;
  /** Szervezeti RBAC (PROJEKT_INSTRUKCIOK.md "Riportok Lekérdezési Logikája"), a
   * ténylegesen létrehozó user azonosítója. A dashboard listája mostantól, a hívó
   * szerepkörétől függően, CSAPATTÁRSAK vizsgálatait is tartalmazhatja (lásd
   * `app/dashboard/page.tsx` RLS-alapú, szerepkör-tudatos lekérdezését), ezért a UI-nak
   * el kell tudnia dönteni, melyik sor a "sajátja" a hívónak. */
  created_by: string;
}

interface InspectionsExplorerProps {
  inspections: InspectionRow[];
  /** A bejelentkezett hívó user azonosítója, a "sajátom-e ez a sor" eldöntéséhez. */
  currentUserId: string;
  /** A bejelentkezett hívó szerepköre, Menedzser a TELJES szervezet vizsgálatait
   * kezelheti (szerkesztheti/törölheti), egy csapattárs sorát látó, de nem tulajdonos
   * Átvizsgáló csak MEGTEKINTHETI (a "Riport" linken keresztül), nem szerkesztheti/
   * törölheti, lásd `inspections_update_org`/`inspections_delete_org` RLS policy-kat. */
  role: 'manager' | 'inspector';
}

/**
 * Fix arányú (nem tartalom-alapú `fr`) rács-oszlopok, a "Dashboard táblázat teljes UX/UI
 * újratervezése" lépés kérése szerint AUTÓ&VIN 28% / RENDSZÁM 18% / ÉVJÁRAT 10% / DÁTUM 16% /
 * STÁTUSZ 14% / MŰVELETEK 14%. SZÁNDÉKOSAN `fr` egységekkel (28fr...14fr), NEM literal `%`-kal:
 * a `gap-4` (16px * 5 rés) egy tisztán %-alapú rácsnál a konténer szélessége FÖLÉ adódna hozzá
 * (100% oszlop + rögzített gap-pixelek túlcsordulást okozna), az `fr` egység a rács motorja
 * által a `gap`-ek levonása UTÁN, arányosan osztja szét a maradék helyet, így a kért 28:18:10:
 * 16:14:14 arány garantáltan megmarad, de sosem okoz vízszintes túlcsordulást a gap miatt.
 * Header és sor UGYANEZT a konstanst használja, hogy a két rács sosem csúszhat el egymástól.
 */
const GRID_COLS = 'sm:grid-cols-[28fr_18fr_10fr_16fr_14fr_14fr]';

/**
 * Kereső + akció sáv + vizsgálatok listája, Client Component, mert a keresés
 * kliens-oldali szűrés a már betöltött listán, a "Link másolása" a `navigator.clipboard`-ot
 * használja, a törlés pedig közvetlen Supabase-hívás (RLS `inspections_delete_own`,
 * `auth.uid() = user_id`, védi a bérlők közti izolációt). Linear design system: surface-1
 * lista-konténer, hairline elválasztók a sorok között, mobilon (mobile-first) a sorok egy
 * oszlopba rendeződnek.
 */
export function InspectionsExplorer({ inspections: initialInspections, currentUserId, role }: InspectionsExplorerProps) {
  const router = useRouter();
  const [inspections, setInspections] = useState(initialInspections);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inspections;
    return inspections.filter((inspection) =>
      [inspection.license_plate, inspection.vin, inspection.car_brand, inspection.car_model]
        .filter((field): field is string => Boolean(field))
        .some((field) => field.toLowerCase().includes(q))
    );
  }, [inspections, query]);

  async function handleCopyLink(inspection: InspectionRow) {
    const url = `${window.location.origin}/report/${inspection.public_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(inspection.id);
      setTimeout(() => {
        setCopiedId((current) => (current === inspection.id ? null : current));
      }, 2000);
    } catch {
      // Clipboard API nem elérhető (pl. nem HTTPS kontextus), csendben elnyeljük,
      // a user ilyenkor a riport gombbal tudja megnyitni és onnan másolni a linket.
    }
  }

  async function handleDelete(inspection: InspectionRow) {
    const carLabel = [inspection.car_brand, inspection.car_model].filter(Boolean).join(' ') || 'Ismeretlen autó';
    const confirmed = window.confirm(
      `Biztosan törlöd a(z) "${carLabel}" (${inspection.license_plate ?? 'rendszám nélkül'}) vizsgálatot? Ez a művelet nem vonható vissza, a hozzá tartozó mérések és hibák is törlődnek.`
    );
    if (!confirmed) return;

    setDeleteError(null);
    setDeletingId(inspection.id);
    try {
      const supabase = createClient();
      // Az `.eq('id', ...)` mellett nincs szükség explicit `user_id` szűrésre kliens-oldalon,
      // az `inspections_delete_own` RLS policy (`auth.uid() = user_id`) enélkül is garantálja,
      // hogy csak a saját sorát törölheti a user; a `paint_measurements`/`defects` gyerek-sorok
      // `ON DELETE CASCADE`-del automatikusan törlődnek.
      const { error } = await supabase.from('inspections').delete().eq('id', inspection.id);
      if (error) throw error;

      setInspections((current) => current.filter((item) => item.id !== inspection.id));
      // A `StatsBar`/`DashboardHeader` a Server Component `app/dashboard/page.tsx` saját
      // lekérdezéséből kapja az összesítő számokat, a kliens-oldali listától függetlenül,
      // ezért egy `router.refresh()` szükséges, hogy a számok és (ha ez volt az utolsó
      // vizsgálat) az `EmptyState` is szinkronban maradjon a törlés után.
      router.refresh();
    } catch {
      setDeleteError('A vizsgálat törlése sikertelen. Kérlek, próbáld újra.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative w-full min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-linear-ink-subtle" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Keresés rendszám, alvázszám vagy márka alapján…"
            className="h-10 w-full rounded-md border border-linear-hairline bg-linear-surface-1 pl-9 pr-3 text-[14px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none focus:ring-1 focus:ring-linear-primary/40"
          />
        </div>

        <Link
          href="/inspections/new"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md bg-linear-primary px-4 text-[14px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
        >
          <Plus className="h-4 w-4" />
          Új vizsgálat indítása
        </Link>
      </div>

      {deleteError && (
        <div className="rounded-md border border-linear-danger/30 bg-linear-danger-soft px-4 py-2.5 text-[13px] text-linear-danger">
          {deleteError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 px-6 py-10 text-center text-[14px] text-linear-ink-subtle">
          Nincs a keresésnek megfelelő vizsgálat.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-linear-hairline bg-linear-surface-1 shadow-sm">
          <div className="overflow-x-auto">
            <div className="sm:min-w-[760px]">
              <div
                className={`hidden gap-4 border-b border-linear-hairline px-5 py-3 text-[12px] font-medium uppercase tracking-[0.4px] text-linear-ink-subtle sm:grid ${GRID_COLS}`}
              >
                <span>Autó</span>
                <span>Rendszám</span>
                <span className="text-center">Évjárat</span>
                <span className="text-center">Létrehozva</span>
                <span className="text-center">Státusz</span>
                <span className="text-right">Műveletek</span>
              </div>

              <ul className="divide-y divide-linear-hairline">
                {filtered.map((inspection) => (
                  <InspectionRowItem
                    key={inspection.id}
                    inspection={inspection}
                    canManage={inspection.created_by === currentUserId || role === 'manager'}
                    isCopied={copiedId === inspection.id}
                    isDeleting={deletingId === inspection.id}
                    onCopyLink={() => handleCopyLink(inspection)}
                    onDelete={() => handleDelete(inspection)}
                  />
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InspectionRowItem({
  inspection,
  canManage,
  isCopied,
  isDeleting,
  onCopyLink,
  onDelete,
}: {
  inspection: InspectionRow;
  /** Szervezeti RBAC, igaz, ha a hívó a sor tulajdonosa VAGY Menedzser (lásd
   * `InspectionsExplorerProps.role` JSDoc-ját). Csak ekkor jelenik meg a piszkozat
   * "Folytatás" szerkesztő linkje, illetve a törlés/link-másolás akciómenü, egy
   * `can_view_all_reports` miatt látható, de nem saját csapattárs-sor CSAK
   * megtekinthető (a "Riport" linken keresztül, befejezett vizsgálatnál). */
  canManage: boolean;
  isCopied: boolean;
  isDeleting: boolean;
  onCopyLink: () => void;
  onDelete: () => void;
}) {
  const isDraft = inspection.status === 'draft';
  const carLabel = [inspection.car_brand, inspection.car_model].filter(Boolean).join(' ') || 'Ismeretlen autó';
  const createdAt = new Date(inspection.created_at).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return (
    <li
      className={`grid grid-cols-1 gap-3 px-5 py-3.5 transition-colors hover:bg-linear-surface-2/80 sm:items-center sm:gap-4 ${GRID_COLS} ${
        isDeleting ? 'pointer-events-none opacity-50' : ''
      }`}
    >
      <Link href={`/inspections/${inspection.id}`} className="min-w-0 group">
        <p className="truncate text-[14px] font-semibold text-linear-ink transition-colors group-hover:text-linear-primary-hover group-hover:underline">
          {carLabel}
        </p>
        {/* Mindig renderelődik (VIN hiányában is "VIN: —"), hogy a sormagasság egységes
            maradjon minden sornál, lásd a lépés "SOROK EGYENLETES MAGASSÁGA" kérése. */}
        <p className="mt-0.5 truncate font-mono text-[12px] text-linear-ink-subtle">VIN: {inspection.vin ?? '—'}</p>
      </Link>

      <div className="flex sm:justify-start">
        {/* "Rendszám komponens letisztítása" lépés, a korábbi, felségjelzés-sávos
            `LicensePlateBadge` a Dashboard listájának szűk sorában (fix `h-7` magasság,
            sűrűn egymás mellett futó oszlopok) szétesett/nehezen olvashatóvá vált. A
            listanézetben ennél egy sokkal egyszerűbb, nem túlbonyolított jelvény a cél,
            a `LicensePlateBadge` (felségjelzés-sáv + csillag) TOVÁBBRA IS él a Wizard
            Áttekintésben, a `/inspections/[id]` adatlapon és a publikus BMW riportban,
            csak EBBEN a szűk lista-kontextusban váltottuk le. */}
        {inspection.license_plate ? (
          <span className="inline-flex items-center gap-2 rounded border-2 border-blue-600 px-2 py-1 font-mono text-xs font-bold uppercase tracking-wider text-linear-ink">
            {inspection.license_plate}
          </span>
        ) : (
          <span className="text-[13px] text-linear-ink-subtle">—</span>
        )}
      </div>

      <span className="text-[13px] text-linear-ink-muted sm:text-center">{inspection.year ?? '—'}</span>
      <span className="text-[13px] text-linear-ink-muted sm:text-center">{createdAt}</span>

      <div className="flex sm:justify-center">
        <StatusBadge isDraft={isDraft} />
      </div>

      <div className="flex items-center gap-2 sm:justify-end">
        {isDraft ? (
          canManage ? (
            <Link
              href={`/inspections/${inspection.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-2.5 py-1.5 text-xs font-medium text-linear-ink transition-colors hover:bg-linear-surface-3"
            >
              <Pencil className="h-3.5 w-3.5" />
              Folytatás
            </Link>
          ) : (
            // Szervezeti RBAC: ez a sor egy csapattárs piszkozata, amit a hívó
            // `can_view_all_reports` miatt LÁT a listában, de nem szerkesztheti (nem ő
            // a tulajdonos és nem Menedzser), lásd `inspections_update_org` RLS
            // policy-t. Nincs link, csak egy tájékoztató felirat.
            <span className="text-[12px] italic text-linear-ink-subtle">Csapattárs piszkozata</span>
          )
        ) : (
          <>
            <a
              href={`/report/${inspection.public_token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-2.5 py-1.5 text-xs font-medium text-linear-ink transition-colors hover:bg-linear-surface-3"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Riport
            </a>
            {canManage && (
              <InspectionActionsMenu
                inspectionId={inspection.id}
                isCopied={isCopied}
                onCopyLink={onCopyLink}
                onDelete={onDelete}
              />
            )}
          </>
        )}
      </div>
    </li>
  );
}
