import type { Config } from 'tailwindcss';

// Design tokenek forrása: stripe.md design-elemzés (Auth / Landing / Beállítások felületekhez).
// Ha a Linear és BMW felületekhez is Tailwind tokenre lesz szükség egy következő lépésben,
// azokat célszerű külön névtér alá tenni (pl. `linear-canvas`, `bmw-primary`), hogy ne
// ütközzenek a Stripe tokenekkel ugyanabban a configban.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  // Rendszer-téma (System Theme): a `next-themes` a <html>-re teszi a `dark` class-t,
  // ha az eszköz sötét témán van (lásd `components/theme/ThemeProvider.tsx`). Csak a
  // `linear-*` tokenek (Szakértői Munkaterület) CSS-változó-alapúak és reagálnak erre --
  // a `stripe-*` (Auth/Landing/Beállítások) és `bmw-*` (Publikus riport) tokenek
  // szándékosan fix, literal hex értékek maradnak, a design rendszer előírása szerint.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        stripe: {
          primary: '#533afd',
          'primary-deep': '#4434d4',
          'primary-press': '#2e2b8c',
          'primary-soft': '#665efd',
          'primary-subdued': '#b9b9f9',
          ink: '#0d253d',
          'ink-secondary': '#273951',
          'ink-mute': '#64748d',
          'ink-mute-2': '#61718a',
          canvas: '#ffffff',
          'canvas-soft': '#f6f9fc',
          'canvas-cream': '#f5e9d4',
          hairline: '#e3e8ee',
          'hairline-input': '#a8c3de',
          ruby: '#ea2261',
          magenta: '#f96bee',
          lemon: '#9b6829',
        },
        // Design tokenek forrása: linear.md (Szakértői Munkaterület -- /dashboard, /inspections/*).
        // CSS-változókra épülnek (lásd app/globals.css :root / .dark), hogy a Rendszer-téma
        // (System Theme, components/theme/ThemeProvider.tsx) világos/sötét váltása minden
        // meglévő `bg-linear-*`/`text-linear-*`/stb. class-t automatikusan kövessen, komponens-
        // szintű `dark:` prefixek nélkül. A `primary`/`success`/`warning`/`danger` az
        // `rgb(var(--x-rgb) / <alpha-value>)` mintát használja, hogy a Tailwind opacity
        // módosítók (pl. `bg-linear-primary/10`) is működjenek CSS-változóval is.
        linear: {
          canvas: 'var(--linear-canvas)',
          'surface-1': 'var(--linear-surface-1)',
          'surface-2': 'var(--linear-surface-2)',
          'surface-3': 'var(--linear-surface-3)',
          hairline: 'var(--linear-hairline)',
          'hairline-strong': 'var(--linear-hairline-strong)',
          ink: 'var(--linear-ink)',
          'ink-muted': 'var(--linear-ink-muted)',
          'ink-subtle': 'var(--linear-ink-subtle)',
          'ink-tertiary': 'var(--linear-ink-tertiary)',
          primary: 'rgb(var(--linear-primary-rgb) / <alpha-value>)',
          'primary-hover': 'var(--linear-primary-hover)',
          'primary-focus': 'var(--linear-primary-focus)',
          success: 'rgb(var(--linear-success-rgb) / <alpha-value>)',
          'success-soft': 'var(--linear-success-soft)',
          warning: 'rgb(var(--linear-warning-rgb) / <alpha-value>)',
          'warning-soft': 'var(--linear-warning-soft)',
          danger: 'rgb(var(--linear-danger-rgb) / <alpha-value>)',
          'danger-soft': 'var(--linear-danger-soft)',
        },
        // Design tokenek forrása: bmw.md (Publikus Ügyfélriport -- /report/[public_token]).
        bmw: {
          primary: '#1c69d4',
          'primary-active': '#0653b6',
          'primary-disabled': '#d6d6d6',
          ink: '#262626',
          body: '#3c3c3c',
          'body-strong': '#1a1a1a',
          muted: '#6b6b6b',
          'muted-soft': '#9a9a9a',
          hairline: '#e6e6e6',
          'hairline-strong': '#cccccc',
          canvas: '#ffffff',
          'surface-soft': '#f7f7f7',
          'surface-card': '#fafafa',
          'surface-strong': '#ebebeb',
          'surface-dark': '#1a2129',
          'surface-dark-elevated': '#262e38',
          'on-primary': '#ffffff',
          'on-dark': '#ffffff',
          'on-dark-soft': '#bbbbbb',
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#dc2626',
        },
      },
      fontFamily: {
        sohne: ['var(--font-inter)', 'SF Pro Display', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        'stripe-xs': '4px',
        'stripe-sm': '6px',
        'stripe-md': '8px',
        'stripe-lg': '12px',
        'stripe-xl': '16px',
      },
      boxShadow: {
        'stripe-1': '0 1px 3px rgba(0, 55, 112, 0.08)',
        'stripe-2': '0 8px 24px rgba(0, 55, 112, 0.08), 0 2px 6px rgba(0, 55, 112, 0.04)',
      },
      letterSpacing: {
        'stripe-xxl': '-1.4px',
        'stripe-xl': '-0.96px',
        'stripe-lg': '-0.64px',
        'stripe-md': '-0.26px',
        'stripe-sm': '-0.22px',
      },
    },
  },
  plugins: [],
};

export default config;
