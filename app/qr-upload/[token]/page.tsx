import type { Metadata } from 'next';
import { QrUploadClient } from '@/components/qr-upload/QrUploadClient';

interface QrUploadPageProps {
  params: Promise<{ token: string }>;
}

export const metadata: Metadata = {
  title: 'Feltöltés telefonról, CarPass',
  // A QR-oldal egy rövid életű, egyszer használatos (session-szintű) linken él, nincs
  // értelme, hogy keresőmotorok indexeljék, vagy hogy a böngésző előzményeiből könnyen
  // visszakereshető legyen.
  robots: { index: false, follow: false },
};

/**
 * QR-kódos telefonos média-feltöltő oldal (PLAN_video_qr_upload.md 5. szakasza),
 * PUBLIKUS, bejelentkezés NÉLKÜLI route, amit az asztali wizard "Feltöltés telefonról"
 * gombja generált QR-kódja nyit meg a szakértő SAJÁT telefonján. Linear Dark Design Style
 * (lásd `linear.md`), NEM a BMW (nyilvános ügyfél-riport) stílus, annak ellenére, hogy
 * bejelentkezés nélkül nyílik meg, TARTALMILAG a Szakértői Munkaterület "fotófeltöltés"
 * funkciójának a meghosszabbítása (lásd PROJEKT_INSTRUKCIOK.md 4.2 pontját), nem egy
 * ügyfélnek szánt riport-felület.
 *
 * A tényleges feloldás/feltöltés logika a `QrUploadClient` kliens-komponensben él (a
 * `resolve_qr_upload_session` RPC hívása, fájlválasztás, tömörítés, feltöltés, megerősítés
 * mind kliens-oldali állapotot igényel), ez a szerver-komponens csak a dinamikus route
 * `token` paraméterét oldja fel (Next.js 15 `params` Promise-konvenció, lásd
 * `app/report/[public_token]/page.tsx` azonos mintáját) és adja tovább.
 */
export default async function QrUploadPage({ params }: QrUploadPageProps) {
  const { token } = await params;
  return <QrUploadClient token={token} />;
}
