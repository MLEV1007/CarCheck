/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        // A Supabase Storage-ban tárolt fotók/videók (hibák, borítókép) engedélyezett domain-je.
        // Cseréld le a saját Supabase projekt referenciádra.
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // COOP/COEP fejlécek a kliens-oldali videó-tömörítéshez (ffmpeg.wasm multi-threaded "core-mt"
  // build-je, lásd lib/inspections/videoCompression.ts + PLAN_video_qr_upload.md 3. szakasz) --
  // a `SharedArrayBuffer`-t a böngészők csak "cross-origin isolated" kontextusban engedik
  // használni, ehhez a `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy`
  // fejléc-pár szükséges. `credentialless` módot használunk `require-corp` helyett, mert az
  // utóbbi minden cross-origin erőforrást (pl. a jelentés-oldal Supabase Storage-ból beágyazott
  // <img>/<video> elemeit) explicit CORP fejléchez kötne -- ezt a bucket oldalán nem tudjuk
  // garantálni, `credentialless` esetén a cross-origin kérések hitelesítő adatok NÉLKÜL mennek
  // ki, ami itt elég (nyilvános Storage URL-ek).
  //
  // SZÁNDÉKOSAN csak a `/inspections/*` (a varázsló, ahol a tömörítés fut) és a `/qr-upload/*`
  // (a telefonos feltöltő oldal, szintén tömörít) útvonalakra korlátozzuk -- ha ez a fejléc-pár
  // globálisan (minden route-on) menne, az OKÉ, DE a nyilvános riport-oldal
  // (`/report/[public_token]`) semmiképp nem kaphatja meg, mert ott a böngésző így is
  // meg tudja jeleníteni a cross-origin Supabase Storage média elemeket, és egy esetleges
  // jövőbeli, harmadik féltől származó beágyazás (pl. widget) is eltörhetne tőle -- ezért
  // a hatókört route-szinten, nem globálisan adjuk meg.
  async headers() {
    return [
      {
        source: '/inspections/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
      {
        source: '/qr-upload/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ];
  },
};

export default nextConfig;
