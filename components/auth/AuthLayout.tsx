import { ReactNode } from 'react';

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * Stripe design system (stripe.md) alapján:
 * - `{colors.canvas-soft}` (#f6f9fc) az oldal alapszíne
 * - halvány, elmosott gradiens-háló (cream / lavender / indigo / ruby) a felső sávban
 *   -- a márka "non-negotiable" hero eleme, itt visszafogott, auth-oldalhoz illő erősséggel
 * - a `card-feature-light` komponens: fehér kártya, `rounded-lg` (12px), hairline keret, 32px padding
 */
export function AuthLayout({ eyebrow, title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen flex-col items-center bg-stripe-canvas-soft px-4 py-12">
      {/* Gradiens-háló háttér -- a Stripe márka szignatúrája, nagyon tompítva, hogy egy B2B
          admin belépőképernyőn ne legyen zavaró/agresszív, csak egy halvány atmoszférikus lehelet. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] overflow-hidden"
      >
        <div
          className="absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full opacity-[0.14] blur-[110px]"
          style={{
            background:
              'radial-gradient(closest-side, #f5e9d4 0%, #b9b9f9 40%, #665efd 65%, transparent 100%)',
          }}
        />
      </div>

      <div className="relative z-10 flex w-full flex-col items-center">
        {/* Logo / wordmark helye -- cseréld le a tényleges céglogóra */}
        <div className="mb-10 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-stripe-md bg-stripe-primary font-sohne text-[15px] font-medium text-white">
            C
          </div>
          <span className="font-sohne text-[16px] font-normal text-stripe-ink">
            CarPass
          </span>
        </div>

        <div className="w-full max-w-[420px] rounded-stripe-lg border border-stripe-hairline bg-white p-8 shadow-stripe-1">
          <p className="font-sohne text-[13px] font-medium uppercase tracking-[0.4px] text-stripe-primary">
            {eyebrow}
          </p>
          <h1 className="mt-2 font-sohne text-[26px] font-light leading-[1.15] tracking-stripe-md text-stripe-ink">
            {title}
          </h1>
          <p className="mt-2 font-sohne text-[15px] font-light text-stripe-ink-mute">
            {subtitle}
          </p>

          <div className="mt-8">{children}</div>
        </div>

        <div className="mt-6 font-sohne text-[14px] font-light text-stripe-ink-mute">
          {footer}
        </div>
      </div>
    </div>
  );
}
