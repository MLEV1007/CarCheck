import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
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
    <html lang="hu" className={inter.variable}>
      <body className="font-sohne antialiased">{children}</body>
    </html>
  );
}
