import { FeedbackTriggerButton } from '@/components/feedback/FeedbackTriggerButton';

/**
 * "Visszajelzés" kártya a Cégbeállítások oldalon (Stripe Design System), a felhasználó
 * explicit kérésére: "A beállításokon belül legyen egy cta gomb amire nyomva indul el a
 * form." A tényleges űrlap a megnyíló `FeedbackModal.tsx`-ben él (lásd
 * `FeedbackTriggerButton.tsx` JSDoc-ját), ugyanaz a modal, mint amit a Szakértői
 * Munkaterület fejlécének ikon-gombja nyit meg.
 *
 * Szándékosan Server Component (nincs `'use client'` ezen a fájlon), a modal
 * nyitó/záró állapotát a beágyazott `FeedbackTriggerButton` ('use client') kezeli,
 * ennek a kártyának magának nincs saját kliens-oldali állapota.
 */
export function FeedbackCard() {
  return (
    <div className="flex flex-col gap-3 rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1 sm:p-8">
      <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">Visszajelzés</h2>
      <p className="font-sohne text-[13px] font-light text-stripe-ink-mute">
        Hibát találtál, vagy ötleted van egy új funkcióra? Küldd el nekünk, minden visszajelzést átnézünk.
      </p>
      <div>
        <FeedbackTriggerButton variant="settings-cta" />
      </div>
    </div>
  );
}
