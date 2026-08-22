import type { ReactNode } from 'react';
import { formatKg, formatKm, formatKw } from '@/lib/format';
import { FUEL_TYPE_LABEL } from '@/lib/inspections/constants';
import { LicensePlateBadge } from '@/components/ui/LicensePlateBadge';
import type { PublicReportInspection } from '@/lib/reports/types';

interface ReportHeroProps {
  inspection: PublicReportInspection;
}

interface SpecItem {
  label: string;
  value: string;
  /** 17 karakteres VIN-hez: mobilon (`grid-cols-2`) teljes szélességű sort kap és
   * `break-all`/monospace stílust, hogy ne csússzon bele a szomszédos mezőbe. */
  fullWidth?: boolean;
  /** Ha meg van adva, ez jelenik meg a `value` sima szövege HELYETT (Rendszám mezőnél a
   * `LicensePlateBadge`, lásd "Rendszám felségjelzés" lépés). */
  valueNode?: ReactNode;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });
}

function buildSpecs(inspection: PublicReportInspection): SpecItem[] {
  return [
    { label: 'Évjárat', value: inspection.year ? String(inspection.year) : '—' },
    {
      label: 'Rendszám',
      value: inspection.license_plate || '—',
      valueNode: inspection.license_plate ? (
        <LicensePlateBadge
          value={inspection.license_plate}
          countryCode={inspection.license_plate_country}
          showStar={false}
        />
      ) : undefined,
    },
    {
      label: 'Km óra állás',
      value: typeof inspection.odometer === 'number' ? formatKm(inspection.odometer) : '—',
    },
    { label: 'Motor típusa', value: inspection.engine_type || '—' },
    { label: 'Üzemanyag', value: inspection.fuel_type ? FUEL_TYPE_LABEL[inspection.fuel_type] : '—' },
    {
      label: 'Teljesítmény',
      value: typeof inspection.power_kw === 'number' ? formatKw(inspection.power_kw) : '—',
    },
    {
      label: 'Megengedett össztömeg',
      value: typeof inspection.gross_weight_kg === 'number' ? formatKg(inspection.gross_weight_kg) : '—',
    },
    { label: 'Alvázszám (VIN)', value: inspection.vin || '—', fullWidth: true },
  ];
}

/**
 * BMW design system (bmw.md) `hero-band-dark`: sötétkék (#1a2129) sáv, fehér szöveg,
 * drámai 700/300 tipográfiai kontraszt. Ez az egyetlen sötét sáv az oldalon,
 * a canvas máshol mindenütt fehér, ahogy a design rendszer előírja.
 */
export function ReportHero({ inspection }: ReportHeroProps) {
  const title = [inspection.car_brand, inspection.car_model].filter(Boolean).join(' ') || 'Autó Állapotfelmérés';
  const specs = buildSpecs(inspection);

  return (
    <section className="bg-bmw-surface-dark px-4 py-16 text-bmw-on-dark sm:px-8 sm:py-20 lg:px-12">
      <div className="mx-auto max-w-[1200px]">
        <p className="text-[13px] font-bold uppercase tracking-[1.5px] text-bmw-on-dark-soft">
          Állapotfelmérési riport
        </p>
        <h1 className="mt-3 text-[36px] font-bold leading-[1.1] sm:text-[48px] lg:text-[56px]">{title}</h1>
        <p className="mt-3 text-[16px] font-light text-bmw-on-dark-soft">
          Vizsgálat dátuma: {formatDate(inspection.created_at)}
        </p>

        <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-white/15 pt-10 sm:grid-cols-4">
          {specs.map((spec) => (
            <div key={spec.label} className={spec.fullWidth ? 'col-span-2 sm:col-span-1' : undefined}>
              <dt className="text-[12px] font-bold uppercase tracking-[1.5px] text-bmw-on-dark-soft">
                {spec.label}
              </dt>
              <dd
                className={
                  'mt-2 text-[20px] font-bold tabular-nums sm:text-[22px] ' +
                  (spec.fullWidth ? 'break-all font-mono text-[17px] sm:text-[20px]' : '')
                }
              >
                {spec.valueNode ?? spec.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
