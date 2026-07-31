import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: a next-themes az első kliens-oldali render ELŐTT (inline
    // script) állítja be a `dark`/`light` osztályt a rendszer-témának megfelelően -- ez a
    // szerver által renderelt és a kliensen hidratált <html> osztálylista között szándékos,
    // ártalmatlan eltérést okoz, amit ez a prop néma marad React figyelmeztetés nélkül.
    <html lang="hu" className={inter.variable} suppressHydrationWarning>
      <body className="font-sohne antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
