import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveQrUploadSession } from '@/lib/inspections/mediaUploadServer';

/**
 * Egy sikeresen feltöltött telefonos médiaelem megerősítése -- a QR-kódos telefonos
 * feltöltő oldal (`app/qr-upload/[token]/page.tsx`) A TÉNYLEGES Storage-feltöltés (lásd
 * `lib/inspections/mediaUpload.ts` `uploadWithTicket`) SIKERES BEFEJEZÉSE UTÁN hívja ezt a
 * végpontot. Ez szúrja be a `qr_uploads` sort (KIZÁRÓLAG admin/service-role kliens írhatja,
 * lásd a migráció policy-kommentjét) -- EZ a beszúrás triggereli a Supabase Realtime
 * broadcastot, amit az asztali wizard `QrUploadPanel.tsx`-e figyel, és amitől a fotó/videó
 * ÉLŐBEN megjelenik a wizard képernyőjén (PLAN_video_qr_upload.md 5.4 pontja).
 */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const body = await request.json().catch(() => null);
  const claimSecret = typeof body?.claimSecret === 'string' ? body.claimSecret : null;
  const path = typeof body?.path === 'string' ? body.path : null;
  const mediaType = body?.mediaType === 'video' ? 'video' : body?.mediaType === 'photo' ? 'photo' : null;

  if (!claimSecret || !path || !mediaType) {
    return NextResponse.json(
      { success: false, error: 'Hiányzó vagy hibás kérés-paraméterek.', code: 'INVALID_REQUEST' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  let session;
  try {
    session = await resolveQrUploadSession(admin, token, claimSecret);
  } catch (error) {
    console.error('[qr-upload confirm] resolve_qr_upload_session hiba:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Nem sikerült ellenőrizni a feltöltési linket.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'A link lejárt, vagy már egy másik eszközön van megnyitva.', code: 'EXPIRED_OR_CLAIMED' },
      { status: 403 }
    );
  }

  const { data: sessionRow } = await admin
    .from('qr_upload_sessions')
    .select('created_by')
    .eq('token', token)
    .maybeSingle();

  // Alapvető józanság-ellenőrzés (nem kriptográfiai határvédelem -- a tényleges Storage-írás
  // már csak az ÁLTALUNK kiadott jelölt tokennel volt lehetséges egyáltalán, lásd
  // `media-upload-url/route.ts`): a megerősítésben kapott útvonalnak a session tulajdonosa +
  // vizsgálat alá kell tartoznia.
  if (!sessionRow) {
    return NextResponse.json({ success: false, error: 'Érvénytelen feltöltési útvonal.' }, { status: 400 });
  }
  // Külön (nem inline ternary) `if` a fenti -- így a TypeScript control-flow szűkítése
  // `sessionRow`-t innentől nem-nullázhatóra szűkíti, amit a videó-megőrzési nyilvántartás
  // (`video_assets`) `created_by` mezőjének beszúrásakor lentebb is felhasználunk.
  const expectedPrefix = `${sessionRow.created_by}/${session.inspection_id}/`;
  if (!path.startsWith(expectedPrefix)) {
    return NextResponse.json({ success: false, error: 'Érvénytelen feltöltési útvonal.' }, { status: 400 });
  }

  const { data: publicUrlData } = admin.storage.from('inspection-media').getPublicUrl(path);

  const { error: insertError } = await admin.from('qr_uploads').insert({
    session_token: token,
    organization_id: session.organization_id,
    media_url: publicUrlData.publicUrl,
    media_type: mediaType,
  });

  if (insertError) {
    console.error('[qr-upload confirm] qr_uploads beszúrás sikertelen:', insertError);
    return NextResponse.json(
      { success: false, error: 'Nem sikerült megerősíteni a feltöltést.', details: insertError.message },
      { status: 500 }
    );
  }

  // 60 napos automatikus videó-megőrzési politika (2026-08-21-i felhasználói kérés, lásd
  // `supabase/migrations/20260821_video_retention_cleanup.sql`) -- KIZÁRÓLAG videónál
  // rögzítünk `video_assets` sort, a fotókra a megőrzési politika nem vonatkozik ("A képek
  // minden más megmarad, viszont a videót törölni kell"). A `session.target` 'general'
  // VAGY 'defect:<clientId>' alakú (lásd `qr_upload_sessions.target` oszlop kommentjét) --
  // a nyilvántartási táblában a `category` csak a KÉT lehetséges cél-oszlopot (general_photos
  // vs. defects.media_url) különbözteti meg, a konkrét hiba-kártya-azonosító itt nem
  // releváns (a cron végpont a defektek közül `media_url` egyezés alapján tisztít). Admin
  // (service-role) kliensen keresztül írunk, tehát a `video_assets` RLS ezt nem érinti --
  // best-effort, ugyanaz az elv, mint az asztali `InspectionWizard.tsx` `uploadMediaSmart`-jánál.
  if (mediaType === 'video') {
    const { error: trackError } = await admin.from('video_assets').insert({
      inspection_id: session.inspection_id,
      organization_id: session.organization_id,
      created_by: sessionRow.created_by,
      category: session.target === 'general' ? 'general' : 'defect',
      storage_path: path,
      media_url: publicUrlData.publicUrl,
    });
    if (trackError) {
      console.error('[qr-upload confirm] Nem sikerült rögzíteni a videót a megőrzési nyilvántartásba:', trackError);
    }
  }

  return NextResponse.json({ success: true, mediaUrl: publicUrlData.publicUrl });
}
