import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, MissingServiceRoleKeyError } from '@/lib/supabase/admin';

function toErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * "Fiók törlése" végpont (Beállítások -- Veszélyzóna, lásd `DeleteAccountCard.tsx`).
 *
 * **A felhasználó KIFEJEZETT feltétele: a korábban rögzített vizsgálatok (autók,
 * fotók, riportok) adatai a fióktörléssel NE vesszenek el.** Ehhez ELŐFELTÉTEL volt
 * a `supabase/migrations/20260804_account_deletion_safe_fks.sql` migráció -- élesben
 * (`execute_sql`-lel) megerősítve, hogy az `inspections`/`paint_measurements`/`defects`
 * táblák legacy `user_id` oszlopa (a 2026-08-03 előtti, "1 user = 1 cég" korszakból)
 * `ON DELETE CASCADE`-del mutatott `auth.users(id)`-re -- eme migráció NÉLKÜL egy
 * `auth.admin.deleteUser()` hívás VISSZAVONHATATLANUL törölte volna a user MINDEN
 * vizsgálatát. A migráció ezt (és az `inspections.created_by` `NO ACTION`-jét, ami
 * egyszerűen MEGHIÚSÍTOTTA volna a törlést) `ON DELETE SET NULL`-ra cserélte -- a
 * sorok megmaradnak, `organization_id`-juk érintetlen, csak a törölt userre mutató
 * referencia válik NULL-lá.
 *
 * **Miért kell service-role admin kliens:** a Supabase Auth nyilvános API-ja NEM
 * biztosít self-service fiók-törlést -- kizárólag `auth.admin.deleteUser()`, ami
 * service-role kulcsot igényel (lásd `lib/supabase/admin.ts` JSDoc-ját). Ezért ez a
 * route KÉT klienst használ: a sima, cookie-alapú szerver klienst (`lib/supabase/
 * server.ts`) az AKTUÁLIS user azonosítására (`auth.getUser()` -- soha nem bízunk a
 * kliensből küldött user id-ban), és az admin klienst KIZÁRÓLAG a tényleges törlő
 * hívásra, miután a user személyazonossága már megerősítve.
 *
 * **Megerősítés:** a kliens (`DeleteAccountCard.tsx`) egy modalban begépeltet a userrel
 * a SAJÁT email címét -- ez a szerveren újra ellenőrzésre kerül (`confirmEmail`), hogy
 * egy véletlen/script-szerű hívás ne törölhessen fiókot félrekattintással. Ez UX-szintű
 * védelem, NEM biztonsági határ -- a tényleges biztonsági határ az, hogy a route csak a
 * BEJELENTKEZETT SAJÁT user id-ját törli, semmi mást (nincs paraméterben átadott user id).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: 'A művelethez bejelentkezés szükséges.' },
      { status: 401 }
    );
  }

  let confirmEmail: unknown;
  try {
    const body = await request.json();
    confirmEmail = body?.confirmEmail;
  } catch {
    return NextResponse.json({ success: false, error: 'Hibás kérés.' }, { status: 400 });
  }

  const userEmail = user.email?.trim().toLowerCase();
  const typedEmail = typeof confirmEmail === 'string' ? confirmEmail.trim().toLowerCase() : '';

  if (!userEmail || typedEmail !== userEmail) {
    return NextResponse.json(
      { success: false, error: 'A megadott email cím nem egyezik a fiókod email címével.' },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('[account/delete] Nem sikerült törölni a fiókot:', deleteError);
      return NextResponse.json(
        {
          success: false,
          error: 'Nem sikerült törölni a fiókot. Próbáld újra, vagy jelezd nekünk.',
          details: deleteError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    // A `SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL` hiánya (lásd
    // `lib/supabase/admin.ts` JSDoc-ját) KONFIGURÁCIÓS hiba, nem egy váratlan
    // futásidejű bug -- a felhasználó ELSŐ körben a generikus "Váratlan hiba
    // történt..." szöveget kapta (lásd 47/48. szakasz, status.md), MÁSODIK körben
    // (a kulcsot már beállítva Vercelen, push+redeploy után is) UGYANEZT a konkrét
    // "hiányzik a SUPABASE_SERVICE_ROLE_KEY" üzenetet -- ami azt bizonyítja, hogy a
    // process.env-ben TÉNYLEGESEN nem érhető el a változó a futó Route Handlerben
    // (leggyakoribb ok: a Vercel env változó nincs bepipálva "Production"-re, vagy
    // elgépelt a neve) -- ez már NEM kód-oldali probléma, lásd 49. szakasz. Az
    // `error.message` (lásd `MissingServiceRoleKeyError`) MOST MÁR konkrétan
    // megnevezi, melyik változó hiányzik, és mit kell a Vercel Dashboardon
    // ellenőrizni -- ezt adjuk tovább a UI-nak, a korábbi, kevésbé konkrét szöveg
    // helyett.
    if (error instanceof MissingServiceRoleKeyError) {
      console.error('[account/delete]', error.message);
      return NextResponse.json(
        {
          success: false,
          error: `A fiók törlés funkció jelenleg nincs helyesen beállítva a szerveren. ${error.message}`,
        },
        { status: 500 }
      );
    }

    console.error('[account/delete] Váratlan hiba a fiók törlése közben:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Váratlan hiba történt a fiók törlése közben.',
        details: toErrorDetails(error),
      },
      { status: 500 }
    );
  }
}
