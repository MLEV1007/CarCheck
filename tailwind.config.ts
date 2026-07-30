import type { Config } from 'tailwindcss';

// Design tokenek forrása: stripe.md design-elemzés (Auth / Landing / Beállítások felületekhez).
// Ha a Linear és BMW felületekhez is Tailwind tokenre lesz szükség egy következő lépésben,
// azokat célszerű külön névtér alá tenni (pl. `linear-canvas`, `bmw-primary`), hogy ne
// ütközzenek a Stripe tokenekkel ugyanabban a configban.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
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
        linear: {
          canvas: '#010102',
          'surface-1': '#0f1011',
          'surface-2': '#141516',
          'surface-3': '#18191a',
          hairline: '#23252a',
          'hairline-strong': '#34343a',
          ink: '#f7f8f8',
          'ink-muted': '#d0d6e0',
          'ink-subtle': '#8a8f98',
          'ink-tertiary': '#62666d',
          primary: '#5e6ad2',
          'primary-hover': '#828fff',
          'primary-focus': '#5e69d1',
          success: '#27a644',
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
