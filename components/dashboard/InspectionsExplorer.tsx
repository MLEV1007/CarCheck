'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink, Eye, Pencil, Plus, Search } from 'lucide-react';
import { StatusBadge } from '@/components/dashboard/StatusBadge';

export interface InspectionRow {
  id: string;
  car_brand: string | null;
  car_model: string | null;
  license_plate: string | null;
  vin: string | null;
  year: number | null;
  status: string;
  created_at: string;
  public_token: string;
}

interface InspectionsExplorerProps {
  inspections: InspectionRow[];
}

/**
 * Kereső + akció sáv + vizsgálatok listája -- Client Component, mert a keresés
 * kliens-oldali szűrés a már betöltött listán, és a "Link másolása" a `navigator.clipboard`-ot
 * használja. Linear design system: surface-1 lista-konténer, hairline elválasztók a sorok között,
 * mobilon (mobile-first) a sorok egy oszlopba rendeződnek.
 */
export function InspectionsExplorer({ inspections }: InspectionsExplorerProps) {
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      // Clipboard API nem elérhető (pl. nem HTTPS kontextus) -- csendben elnyeljük,
      // a user ilyenkor a riport gombbal tudja megnyitni és onnan másolni a linket.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
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

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 px-6 py-10 text-center text-[14px] text-linear-ink-subtle">
          Nincs a keresésnek megfelelő vizsgálat.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1">
          <div className="hidden grid-cols-[1.6fr_1fr_0.7fr_1fr_0.9fr_auto] gap-4 border-b border-linear-hairline px-5 py-3 text-[12px] font-medium uppercase tracking-[0.4px] text-linear-ink-subtle sm:grid">
            <span>Autó</span>
            <span>Rendszám</span>
            <span>Évjárat</span>
            <span>Létrehozva</span>
            <span>Státusz</span>
            <span className="text-right">Műveletek</span>
          </div>

          <ul className="divide-y divide-linear-hairline">
            {filtered.map((inspection) => (
              <InspectionRowItem
                key={inspection.id}
                inspection={inspection}
                isCopied={copiedId === inspection.id}
                onCopyLink={() => handleCopyLink(inspection)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InspectionRowItem({
  inspection,
  isCopied,
  onCopyLink,
}: {
  inspection: InspectionRow;
  isCopied: boolean;
  onCopyLink: () => void;
}) {
  const isDraft = inspection.status === 'draft';
  const carLabel = [inspection.car_brand, inspection.car_model].filter(Boolean).join(' ') || 'Ismeretlen autó';
  const createdAt = new Date(inspection.created_at).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return (
    <li className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[1.6fr_1fr_0.7fr_1fr_0.9fr_auto] sm:items-center sm:gap-4">
      <Link href={`/inspections/${inspection.id}`} className="min-w-0 group">
        <p className="truncate text-[14px] font-medium text-linear-ink transition-colors group-hover:text-linear-primary-hover group-hover:underline">
          {carLabel}
        </p>
        {inspection.vin && <p className="truncate font-mono text-[12px] text-linear-ink-subtle">{inspection.vin}</p>}
      </Link>

      <span className="font-mono text-[13px] text-linear-ink-muted">{inspection.license_plate ?? '—'}</span>
      <span className="text-[13px] text-linear-ink-muted">{inspection.year ?? '—'}</span>
      <span className="text-[13px] text-linear-ink-muted">{createdAt}</span>

      <div>
        <StatusBadge isDraft={isDraft} />
      </div>

      <div className="flex items-center gap-2 sm:justify-end">
        {isDraft ? (
          <Link
            href={`/inspections/${inspection.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-3 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3"
          >
            <Pencil className="h-3.5 w-3.5" />
            Folytatás
          </Link>
        ) : (
          <>
            <Link
              href={`/inspections/${inspection.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-3 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3"
            >
              <Eye className="h-3.5 w-3.5" />
              Megtekintés
            </Link>
            <a
              href={`/report/${inspection.public_token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-3 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Riport
            </a>
            <button
              type="button"
              onClick={onCopyLink}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-3 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3"
            >
              {isCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-linear-success" />
                  Másolva
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Link másolása
                </>
              )}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
