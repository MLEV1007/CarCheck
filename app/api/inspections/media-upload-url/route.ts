import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserRoleContext } from '@/lib/auth/roles';
import {
  assertVideoUploadAllowed,
  isMediaCategory,
  issueMediaUploadTicket,
  VideoNotAllowedError,
} from '@/lib/inspections/mediaUploadServer';

/**
 * Aláírt (signed) Storage feltöltési token kiadása az ASZTALI, hitelesített wizardhoz
 * (`lib/inspections/mediaUpload.ts` `uploadInspectionMediaViaServer`) -- lásd
 * PLAN_video_qr_upload.md 4. és 6. szakaszát. `InspectionWizard.tsx` `handleSubmit`-je
 * KIZÁRÓLAG videó ÉS 6 MB feletti fájloknál hívja ezt a végpontot -- kis képeknél a
 * meglévő, sima `supabase.storage.from(...).upload()` út VÁLTOZATLAN marad.
 *
 * **Ez a "természetes hely" a videó-csomag-jogosultság kikényszerítésére** (a felhasználó
 * saját megfogalmazása szerint): mivel a videó feltöltéséhez ÚGYIS szerver-oldali jelölt
 * URL kell (a TUS resumable protokoll miatt), a gate itt, a token kiadása ELŐTT fut le --
 * ha a hívó szervezet `user_credits.plan_tier`-je nem `pro`/`business`, a válasz `403`
 * (`code: 'VIDEO_NOT_ALLOWED'`), és SOSE kap jelölt URL-t, tehát a feltöltés technikailag
 * sem tud megtörténni -- ez a kliens-oldali `videoAllowed` prop általi UI-elrejtés MÖGÖTTI,
 * kikényszerítő védelmi vonal (lásd a `lib/inspections/mediaUploadServer.ts` JSDoc-ját).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: 'A művelethez bejelentkezés szükséges.', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const roleContext = await getUserRoleContext(user.id);
  if (!roleContext) {
    return NextResponse.json(
      { success: false, error: 'Nem sikerült feloldani a szervezetedet.', code: 'NO_ORGANIZATION' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const inspectionId = typeof body?.inspectionId === 'string' ? body.inspectionId : null;
  const category = body?.category;
  const contentType = typeof body?.contentType === 'string' ? body.contentType : null;
  const originalFilename = typeof body?.originalFilename === 'string' ? body.originalFilename : 'media';

  if (!inspectionId || !isMediaCategory(category) || !contentType) {
    return NextResponse.json(
      { success: false, error: 'Hiányzó vagy hibás kérés-paraméterek.', code: 'INVALID_REQUEST' },
      { status: 400 }
    );
  }

  try {
    if (contentType.startsWith('video/')) {
      await assertVideoUploadAllowed(supabase, roleContext.organizationId);
    }

    const ticket = await issueMediaUploadTicket({
      userId: user.id,
      inspectionId,
      category,
      originalFilename,
    });

    return NextResponse.json({ success: true, ...ticket });
  } catch (error) {
    if (error instanceof VideoNotAllowedError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 403 });
    }
    console.error('[media-upload-url] Nem sikerült feltöltési tokent kiadni:', error);
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
