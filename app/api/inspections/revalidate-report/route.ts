import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * On-demand ISR revalidáció végpont (2026-08-07, "Teljesítmény-audit és refaktorálás" lépés,
 * D pont: "Publikus Riport Caching") -- a `/report/[public_token]` oldal mostantól `export
 * const revalidate = 60`-nal cache-elt (lásd a `page.tsx` JSDoc-ját), ami azt jelenti, hogy
 * egy MÁR publikált riport UTÓLAGOS szerkesztése/újramentése (`InspectionWizard.tsx`
 * `handleSubmit`, piszkozat vagy publikálás UTÁN, ha `status === 'completed'`) a cache
 * lejárta (legfeljebb 60 másodperc) ELŐTT NEM feltétlenül látszana a publikus linken --
 * ez ennek a végpontnak a hívásával azonnal kikényszeríthető (`revalidatePath`), hogy a
 * vizsgáló a mentés/publikálás UTÁN azonnal a friss adatot lássa, ha ő maga (vagy az ügyfél)
 * rögtön megnyitja a linket.
 *
 * Best-effort, NEM blokkoló hívás -- az `InspectionWizard.tsx` `handleSubmit`-ból `void`-dal,
 * `await` nélkül indítjuk (ugyanaz az elv, mint a `/api/inspections/consume-quota`-nál), mert
 * egy sikertelen revalidáció legrosszabb esetben is csak azt jelenti, hogy a cache a normál
 * 60 másodperces ablakon belül magától frissül -- nem hibázhat el emiatt a MÁR sikeresen
 * elmentett vizsgálat.
 */
export const runtime = 'nodejs';

interface RevalidateReportBody {
  publicToken?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'A művelethez bejelentkezés szükséges.' }, { status: 401 });
  }

  let body: RevalidateReportBody;
  try {
    body = (await request.json()) as RevalidateReportBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Érvénytelen kérés törzs.' }, { status: 400 });
  }

  if (!body.publicToken || typeof body.publicToken !== 'string') {
    return NextResponse.json({ success: false, error: 'Hiányzó publicToken.' }, { status: 400 });
  }

  revalidatePath(`/report/${body.publicToken}`);

  return NextResponse.json({ success: true });
}
