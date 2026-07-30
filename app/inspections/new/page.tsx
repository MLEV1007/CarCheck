import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { InspectionWizard } from '@/components/inspections/wizard/InspectionWizard';

export const metadata: Metadata = {
  title: 'Új vizsgálat | Autó Állapotfelmérő',
};

// Linear design system (linear.md) -- sötét canvas, tömör fejléc, a wizard maga
// Client Component (InspectionWizard.tsx), mert a lépésváltás és a Supabase
// insert/upload logika kliens-oldali állapotot és böngésző-kliens hívásokat igényel.
// A middleware.ts (PROTECTED_PREFIXES) már véd minden /inspections route-ot.
export default function NewInspectionPage() {
  return (
    <div className="min-h-screen bg-linear-canvas">
      <header className="flex h-16 items-center gap-3 border-b border-linear-hairline px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-linear-ink-subtle transition-colors hover:bg-linear-surface-1 hover:text-linear-ink"
          aria-label="Vissza a dashboardra"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-[14px] font-medium text-linear-ink">Új vizsgálat indítása</span>
      </header>

      <InspectionWizard />
    </div>
  );
}
