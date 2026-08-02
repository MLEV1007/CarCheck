import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { InsufficientCreditsProvider } from '@/components/credits/InsufficientCreditsProvider';
import './globals.css';

// A Stripe design system (stripe.md) a proprietary "Sohne"-t írja elő, ennek dokumentált
// nyílt forrású helyettesítője az Inter 300-as súllyal, negatív tracking-gel + ss01 feature-rel.
// A 700-as súly a BMW design system (bmw.md) drámai bold/light kontrasztjához kell
// (/report/[public_token] -- Publikus Ügyfélriport).
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Autó Állapotfelmérő',
  description: 'Digitális autóátvizsgálási jelentések független autóvizsgálóknak.',
};

/**
 * "iOS Mobil Zoom hiba javítása" lépés -- Next.js App Router alapból is beszúr egy
 * `width=device-width, initial-scale=1` viewport meta taget, de a `maximumScale`
 * explicit megadásához (a felhasználó kifejezett kérésére, hogy a mezőkre koppintáskor
 * a mezők 16px-es betűmérete MELLETT se maradjon esély a böngésző-oldali zoom-ugrálásra)
 * itt, explicit `viewport` exporttal írjuk felül.
 *
 * **Megjegyzés (a11y trade-off, dokumentálva):** a `maximumScale: 1` a felhasználó
 * SAJÁT (pinch-to-zoom) nagyítását is letiltja, ami önmagában WCAG 1.4.4 (Resize Text)
 * szempontból nem ideális gyengénlátó felhasználóknak -- viszont mivel a mezők
 * betűmérete a `FormControls.tsx`/`globals.css` javítással már eleve garantáltan ≥16px
 * mobilon, az iOS AUTOMATIKUS zoom-beugrása (amit ez a `maximumScale` valójában
 * megakadályozna) enélkül is elmarad -- a `maximumScale: 1` itt tehát egy explicit
 * felhasználói kérésre hozzáadott, de a gyakorlatban nem szigorúan szükséges extra
 * védőháló, nem az elsődleges javítás.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: a next-themes az első kliens-oldali render ELŐTT (inline
    // script) állítja be a `dark`/`light` osztályt a rendszer-témának megfelelően -- ez a
    // szerver által renderelt és a kliensen hidratált <html> osztálylista között szándékos,
    // ártalmatlan eltérést okoz, amit ez a prop néma marad React figyelmeztetés nélkül.
    <html lang="hu" className={inter.variable} suppressHydrationWarning>
      <body className="font-sohne antialiased">
        <ThemeProvider>
          <InsufficientCreditsProvider>{children}</InsufficientCreditsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
