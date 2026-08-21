import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveQrUploadSession } from '@/lib/inspections/mediaUploadServer';

/**
 * QR-kódos telefonos feltöltési session feloldása -- a `app/qr-upload/[token]/page.tsx`
 * publikus, bejelentkezés NÉLKÜLI oldala hívja megnyitáskor (és a "claim" után minden
 * további saját frissítésnél a kapott `claimSecret`-tel). Lásd a
 * `resolve_qr_upload_session` RPC "Claim logika" kommentjét
 * (`supabase/migrations/20260821_video_qr_upload.sql`) a pontos szemantikáért -- ez a route
 * csupán egy vékony HTTP-burok az RPC köré, admin (service-role) kliensen keresztül hívva
 * (a függvény maga SECURITY DEFINER és `anon`-nak grant-olva, tehát egy sima anon kliens is
 * hívhatná, de az admin kliens itt egyszerűbb: nincs cookie/munkamenet-kezelési kérdés egy
 * teljesen névtelen kérésnél).
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const claimSecret = new URL(request.url).searchParams.get('claimSecret');

  const admin = createAdminClient();
  let data;
  try {
    data = await resolveQrUploadSession(admin, token, claimSecret);
  } catch (error) {
    console.error('[qr-upload/[token]] resolve_qr_upload_session hiba:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Nem sikerült feloldani a feltöltési linket.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { success: false, error: 'A link lejárt, vagy már egy másik eszközön van megnyitva.', code: 'EXPIRED_OR_CLAIMED' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    inspectionId: data.inspection_id,
    target: data.target,
    videoAllowed: data.video_allowed,
    // `claim_secret` KIZÁRÓLAG az ELSŐ (claim-elő) hívás válaszában NEM null -- a kliens
    // (`QrUploadClient.tsx`) ezt tárolja el (a `sessionStorage`-ban, tokenenként kulcsolva,
    // hogy egy véletlen oldal-frissítés a MÁR claim-elt telefonon ne fusson bele hamisan az
    // "más eszköz claim-elte" hibaágba) és adja tovább minden saját további kérésnél.
    claimSecret: data.claim_secret,
    expiresAt: data.expires_at,
  });
}
