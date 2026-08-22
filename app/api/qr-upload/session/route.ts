import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserRoleContext } from '@/lib/auth/roles';
import { isMediaCategory } from '@/lib/inspections/mediaUploadServer';

/** A session érvényességi ideje, a felhasználóval egyeztetett "session-szintű" claim-elv
 * (PLAN_video_qr_upload.md "Nyitott döntések" 1. pontja) mellett ez az az időablak, amíg a
 * telefon a linket egyáltalán megnyithatja/lefoglalhatja. Lásd
 * `resolve_qr_upload_session` RPC-t (`supabase/migrations/20260821_video_qr_upload.sql`) az
 * ezt követő, magát a claim-et kezelő logikáért. */
const SESSION_TTL_MS = 20 * 60 * 1000;

/**
 * QR-kódos telefonos feltöltési session létrehozása, az asztali wizard "Feltöltés
 * telefonról" gombjára kattintva hívja (`QrUploadPanel.tsx`). Hitelesített, RLS-védett
 * INSERT a `qr_upload_sessions` táblába (lásd a migráció `qr_upload_sessions_insert_org`
 * policy-ját), NEM igényel admin klienst, mert a hívó a SAJÁT szervezetéhez hoz létre egy
 * sort, a normál RLS ezt már engedi.
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
  // `target`, 'general' VAGY 'defect:<clientId>', lásd a `qr_upload_sessions.target` oszlop
  // JSDoc-ját a migrációban. Itt csak a kategória-előtagot ellenőrizzük (a `defect:` utáni
  // rész a wizard SAJÁT, kliens-oldali `clientId`-ja, amit a szerver átlátszóan tárol).
  const target = typeof body?.target === 'string' ? body.target : null;
  const targetCategory = target === 'general' ? 'general' : target?.startsWith('defect:') ? 'defect' : null;

  if (!inspectionId || !target || !isMediaCategory(targetCategory)) {
    return NextResponse.json(
      { success: false, error: 'Hiányzó vagy hibás kérés-paraméterek.', code: 'INVALID_REQUEST' },
      { status: 400 }
    );
  }

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const { data, error } = await supabase
    .from('qr_upload_sessions')
    .insert({
      inspection_id: inspectionId,
      organization_id: roleContext.organizationId,
      created_by: user.id,
      target,
      expires_at: expiresAt,
    })
    .select('token, expires_at')
    .single();

  if (error || !data) {
    console.error('[qr-upload/session] Nem sikerült session-t létrehozni:', error);
    return NextResponse.json(
      { success: false, error: 'Nem sikerült QR-feltöltési session-t létrehozni.', details: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, token: data.token, expiresAt: data.expires_at });
}
