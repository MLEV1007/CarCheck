import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 60 napos automatikus videó-megőrzési politika -- napi Vercel Cron végpont (lásd
 * `vercel.json` `crons` bejegyzését). 2026-08-21-i felhasználói kérés: "egy olyan fontos
 * beállítást szeretnék, hogy a videókat 60 napig tárolja csak a rendszer, utána
 * automatikusan törli. A képek minden más megmarad, viszont a videót törölni kell."
 *
 * **Miért `video_assets` tábla, nem közvetlen `storage.objects` lekérdezés:** a
 * `storage.objects` séma NINCS kitéve a PostgREST/Supabase JS API-n keresztül alapból,
 * tehát a kliens nem tud rá `.from('storage.objects')`-öt hívni -- a `video_assets` tábla
 * (lásd `supabase/migrations/20260821_video_retention_cleanup.sql`) egy KÖNNYŰ,
 * feltöltéskor (asztali `InspectionWizard.tsx`/QR `.../confirm/route.ts`) írt nyilvántartás
 * a `public` sémában, ami a Storage-objektum útvonalát/URL-jét/létrehozási idejét tárolja.
 *
 * **Miért Storage API `.remove()`, nem SQL `DELETE FROM storage.objects`:** a
 * `storage.objects` tábla KIZÁRÓLAG a Storage METAADATAIT tárolja -- egy közvetlen SQL
 * törlés a sort eltávolítaná, DE a tényleges fájlbájtokat NEM törölné a mögöttes tároló-
 * backendből, örökre árva objektumokat hagyva. A Storage API `.remove()` hívása a
 * HELYES, teljes törlést végző út.
 *
 * **A törlés 3 lépése minden lejárt videónál:**
 *   1. Storage-objektum tényleges törlése (`.storage.from('inspection-media').remove()`).
 *   2. A dangling hivatkozás megtisztítása -- `general` kategóriánál az
 *      `inspections.general_photos` tömbből (`remove_general_photo_url` RPC, mert a
 *      Supabase JS `.update()` nem tud `array_remove` SQL-kifejezést küldeni), `defect`
 *      kategóriánál a `defects.media_url` mező `null`-ra állítása (pontos `media_url`
 *      egyezés alapján -- a `defects` sorok a wizard minden mentésekor törlésre/újra-
 *      beszúrásra kerülnek, lásd `InspectionWizard.tsx` `persistDefects`-jét, a sor
 *      esetleg MÁR nem is létezik, ilyenkor a frissítés egyszerűen 0 sort érint, nem hiba).
 *   3. A `video_assets` sor `deleted_at`-jének beállítása -- MEGTARTJUK a sort (nem
 *      töröljük), hogy auditnaplója legyen, mikor lett egy videó automatikusan eltávolítva.
 *
 * A `photos`/egyéb mezők SOSE érintettek -- ez a végpont KIZÁRÓLAG a `video_assets`
 * táblában szereplő (tehát garantáltan videó típusú) sorokkal dolgozik.
 *
 * **Hitelesítés:** Vercel Cron a kérést a saját belső hálózatáról indítja, az
 * `authorization` fejlécbe a `CRON_SECRET` env változó értékét téve (Vercel Dashboard ->
 * Project -> Settings -> Environment Variables, ÉS a Cron Jobs UI automatikusan hozzáadja
 * a fejlécet, ha a `CRON_SECRET` be van állítva) -- lásd a Vercel "Securing cron jobs"
 * dokumentációját. Enélkül BÁRKI meghívhatná ezt a végpontot, és tömegesen törölhetne
 * videókat a 60 napos határidő figyelmen kívül hagyásával.
 */

const RETENTION_DAYS = 60;

interface VideoAssetRow {
  id: string;
  inspection_id: string;
  category: 'general' | 'defect';
  storage_path: string;
  media_url: string;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: expired, error: selectError } = await admin
    .from('video_assets')
    .select('id, inspection_id, category, storage_path, media_url')
    .is('deleted_at', null)
    .lt('created_at', cutoffIso);

  if (selectError) {
    console.error('[cron cleanup-expired-videos] Nem sikerült lekérdezni a lejárt videókat:', selectError);
    return NextResponse.json({ success: false, error: selectError.message }, { status: 500 });
  }

  const expiredRows = (expired ?? []) as VideoAssetRow[];
  let deletedCount = 0;
  const failures: Array<{ storagePath: string; error: string }> = [];

  // Szándékosan SZEKVENCIÁLIS (nem `Promise.all`) -- ez egy háttér-cron, nincs
  // felhasználó, aki várakozik rá, és így egyértelműbb/olvashatóbb a hibalogolás
  // (melyik konkrét videónál akadt el a folyamat), mint egy párhuzamos futás összefésült
  // hibaüzeneteinél.
  for (const asset of expiredRows) {
    try {
      const { error: removeError } = await admin.storage.from('inspection-media').remove([asset.storage_path]);
      if (removeError) {
        throw new Error(`Storage-törlés sikertelen: ${removeError.message}`);
      }

      if (asset.category === 'general') {
        const { error: cleanupError } = await admin.rpc('remove_general_photo_url', {
          p_inspection_id: asset.inspection_id,
          p_url: asset.media_url,
        });
        if (cleanupError) {
          throw new Error(`general_photos megtisztítása sikertelen: ${cleanupError.message}`);
        }
      } else {
        const { error: cleanupError } = await admin
          .from('defects')
          .update({ media_url: null })
          .eq('inspection_id', asset.inspection_id)
          .eq('media_url', asset.media_url);
        if (cleanupError) {
          throw new Error(`defects.media_url megtisztítása sikertelen: ${cleanupError.message}`);
        }
      }

      const { error: markError } = await admin
        .from('video_assets')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', asset.id);
      if (markError) {
        throw new Error(`video_assets megjelölése sikertelen: ${markError.message}`);
      }

      deletedCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron cleanup-expired-videos] Hiba a(z) "${asset.storage_path}" videó törlésénél:`, message);
      failures.push({ storagePath: asset.storage_path, error: message });
    }
  }

  return NextResponse.json({
    success: true,
    totalExpired: expiredRows.length,
    deletedCount,
    failures,
  });
}
