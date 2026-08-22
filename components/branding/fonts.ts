import { Outfit, DM_Mono } from 'next/font/google';

/**
 * A CarPass logó (`CarPassLogo.tsx`) betűtípusai, KIZÁRÓLAG a logóhoz, NEM a
 * globális app-tipográfiához (az `Inter` a Stripe design system "Sohne" helyettesítője,
 * lásd `app/layout.tsx`). A referencia-forrás (`CarPass logo design/src/App.tsx`,
 * felhasználó által mellékelt Figma Make export) az "Outfit" (wordmark, 800-as súly) +
 * "DM Mono" (kisbetűs "JÁRMŰÁTVIZSGÁLÁS" alcím) párost használja, ezt emeljük át
 * `next/font/google`-lel, hogy a build-időben generált, self-hosted fontfájlokkal
 * (nincs kliens-oldali Google Fonts hívás, nincs layout shift) működjön.
 */
export const outfit = Outfit({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700', '800'],
  variable: '--font-outfit',
  display: 'swap',
});

export const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-dm-mono',
  display: 'swap',
});
