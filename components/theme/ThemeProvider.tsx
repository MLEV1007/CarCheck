'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/**
 * Rendszer-téma (System Theme) kezelés a Linear-stílusú belső felületeken
 * (`/dashboard`, `/inspections/*`) -- lásd `tailwind.config.ts` (`darkMode: 'class'`)
 * és `app/globals.css` (`:root` / `.dark` CSS változók a `linear-*` tokenekhez).
 *
 * - `attribute="class"`: a `next-themes` a `<html>` elemre teszi rá a `dark` osztályt,
 *   ha a rendszer sötét témán van -- ezt olvassák a Tailwind `linear-*` tokenek.
 * - `enableSystem`: követi az eszköz `prefers-color-scheme` beállítását.
 * - `defaultTheme="light"`: ha a rendszer-téma NEM olvasható be / nem meghatározható
 *   (pl. régi böngésző, `matchMedia` hiánya), a világos téma az alapértelmezett --
 *   ez a projekt kifejezett elvárása, NEM a `next-themes` csomag alapértelmezése.
 * - A Stripe (Auth/Landing/Beállítások) és BMW (Publikus riport) felületek szándékosan
 *   NEM `dark:`-tudatosak -- azok a design rendszerük szerint mindig fixen világosak
 *   maradnak, függetlenül a `<html>` osztályától.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem {...props}>
      {children}
    </NextThemesProvider>
  );
}
