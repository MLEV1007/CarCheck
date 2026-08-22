import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * On-demand ISR revalidáció végpont (2026-08-07, "Teljesítmény-audit és refaktorálás" lépés,
 * D pont: "Publikus Riport Caching"), a `/report/[public_token]` oldal mostantól `export
 * const revalidate = 60`-nal cache-elt (lásd a `page.tsx` JSDoc-ját), ami azt jelenti, hogy
 * egy MÁR publikált riport UTÓLAGOS szerkesztése/újramentése (`InspectionWizard.tsx`
 * `handleSubmit`, piszkozat vagy publikálás UTÁN, ha `status === 'completed'`) a cache
 * lejárta (legfeljebb 60 másodperc) ELŐTT NEM feltétlenül látszana a publikus linken,
 * ez ennek a végpontnak a hívásával azonnal kikényszeríthető (`revalidatePath`), hogy a
 * vizsgáló a mentés/publikálás UTÁN azonnal a friss adatot lássa, ha ő maga (vagy az ügyfél)
 * rögtön megnyitja a linket.
 *
 * Best-effort, NEM blokkoló hívás, az `InspectionWizard.tsx` `handleSubmit`-ból `void`-dal,
 * `await` nélkül indítjuk (ugyanaz az elv, mint a `/api/inspections/consume-quota`-nál), mert
 * egy sikertelen revalidáció legrosszabb esetben is csak azt jelenti, hogy a cache a normál
 * 60 másodperces ablakon belül magától frissül, nem hibázhat el emiatt a MÁR sikeresen
 * elmentett vizsgálat.
 *
 * **Szerveroldali jogosultság-ellenőrzés (2026-08-07, biztonsági audit):** korábban BÁRMELY
 * bejelentkezett user (bármelyik szervezetből) tetszőleges `publicToken`-re rá tudta
 * kényszeríteni az ISR cache invalidálását, ez önmagában NEM szivárogtatott adatot (a
 * `revalidatePath` nem ad vissza semmilyen riport-tartalmat), de a projekt szigorú
 * "minden lekérdezés ellenőrizze a szervezeti hovatartozást" szabálya (PROJEKT_INSTRUKCIOK.md
 * 3. pont) alapján ez a végpont is szigorítva lett: a `publicToken`-hez tartozó vizsgálatot a
 * hívó cookie-alapú (RLS-jogosultsággal futó) kliensével kérdezzük le, ha a sor nem
 * található (nem létezik, VAGY a hívó szervezete/szerepköre alapján az `inspections_select_org`
 * RLS policy nem engedi látni), `404`-et adunk vissza, a revalidáció NEM fut le.
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

  const publicToken = body.publicToken;
  if (!publicToken || typeof publicToken !== 'string') {
    return NextResponse.json({ success: false, error: 'Hiányzó publicToken.' }, { status: 400 });
  }

  // Jogosultság-ellenőrzés, lásd a fenti JSDoc-ot. A cookie-alapú kliens SAJÁT
  // RLS-jogosultságával fut (`inspections_select_org`), tehát ez a lekérdezés kizárólag akkor
  // ad vissza sort, ha a hívó ténylegesen jogosult megtekinteni ezt a vizsgálatot (saját maga
  // rögzítette, VAGY a szervezetéhez tartozik Menedzserként/`can_view_all_reports`-tal).
  const { data: inspection } = await supabase
    .from('inspections')
    .select('id')
    .eq('public_token', publicToken)
    .maybeSingle();

  if (!inspection) {
    return NextResponse.json(
      { success: false, error: 'A vizsgálat nem található, vagy nincs jogosultságod hozzá.' },
      { status: 404 }
    );
  }

  revalidatePath(`/report/${publicToken}`);

  return NextResponse.json({ success: true });
}
