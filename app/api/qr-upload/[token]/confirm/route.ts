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
  const expectedPrefix = sessionRow ? `${sessionRow.created_by}/${session.inspection_id}/` : null;
  if (!expectedPrefix || !path.startsWith(expectedPrefix)) {
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

  return NextResponse.json({ success: true, mediaUrl: publicUrlData.publicUrl });
}
