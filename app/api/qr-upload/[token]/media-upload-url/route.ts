import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  assertVideoUploadAllowed,
  isMediaCategory,
  issueMediaUploadTicket,
  resolveQrUploadSession,
  VideoNotAllowedError,
  type MediaCategory,
} from '@/lib/inspections/mediaUploadServer';

/**
 * Aláírt Storage feltöltési token kiadása a QR-kódos TELEFONOS (anonim, token+claimSecret-tel
 * hitelesített) kliensnek, lásd PLAN_video_qr_upload.md 4. és 6. szakaszát. Ugyanaz a
 * `issueMediaUploadTicket`/`assertVideoUploadAllowed` páros, mint az asztali
 * `/api/inspections/media-upload-url`-nél (lásd annak JSDoc-ját a videó-gate indoklásáért),
 * DE itt admin (service-role) kliensen keresztül fut, mert a hívónak SOSINCS Supabase
 * munkamenete, a jogosultságot a `resolve_qr_upload_session` RPC "claim" ellenőrzése adja
 * (lásd a migráció kommentjét), NEM egy Supabase Auth session.
 */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const body = await request.json().catch(() => null);
  const claimSecret = typeof body?.claimSecret === 'string' ? body.claimSecret : null;
  const contentType = typeof body?.contentType === 'string' ? body.contentType : null;
  const originalFilename = typeof body?.originalFilename === 'string' ? body.originalFilename : 'media';

  if (!claimSecret || !contentType) {
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
    console.error('[qr-upload media-upload-url] resolve_qr_upload_session hiba:', error);
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

  const category: MediaCategory | null = session.target === 'general' ? 'general' : 'defect';
  if (!isMediaCategory(category)) {
    return NextResponse.json({ success: false, error: 'Érvénytelen feltöltési cél.' }, { status: 400 });
  }

  // A Storage-útvonal első szegmensének (`storage.objects` RLS tulajdonlási feltétele) a
  // session-t létrehozó ASZTALI felhasználó `auth.uid()`-ja kell legyen, NEM az anonim
  // telefoné (aminek nincs is `auth.uid()`-ja), lásd `mediaUploadServer.ts`
  // `buildInspectionMediaPath` JSDoc-ját.
  const { data: sessionRow, error: sessionRowError } = await admin
    .from('qr_upload_sessions')
    .select('created_by')
    .eq('token', token)
    .maybeSingle();

  if (sessionRowError || !sessionRow) {
    console.error('[qr-upload media-upload-url] session sor lekérése sikertelen:', sessionRowError);
    return NextResponse.json({ success: false, error: 'Nem sikerült feloldani a feltöltés tulajdonosát.' }, { status: 500 });
  }

  try {
    if (contentType.startsWith('video/')) {
      await assertVideoUploadAllowed(admin, session.organization_id);
    }

    const ticket = await issueMediaUploadTicket({
      userId: sessionRow.created_by,
      inspectionId: session.inspection_id,
      category,
      originalFilename,
    });

    return NextResponse.json({ success: true, ...ticket });
  } catch (error) {
    if (error instanceof VideoNotAllowedError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 403 });
    }
    console.error('[qr-upload media-upload-url] Nem sikerült feltöltési tokent kiadni:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Nem sikerült feltöltési jogosultságot szerezni.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
