/**
 * Vizsgálati- és AI-keret (kvóta) típusdefiníciók (PROJEKT_INSTRUKCIOK.md "Kredit/keret
 * adatbázis migráció" lépés, 2026-08-04).
 *
 * A DB-oszlopok snake_case-ben vannak (`user_credits` tábla, lásd
 * `supabase/migrations/20260804_inspection_quotas.sql`), az alkalmazás-rétegben
 * (`lib/quotas.ts`, komponensek) mindenhol az itt definiált camelCase alakot
 * használjuk -- a leképezést kizárólag `lib/quotas.ts` végzi. Ugyanaz a minta, mint a
 * `types/credits.ts`-nél (a régi, egyedi AI-kredit rendszernél).
 */

/** 2026-08-06, "Árazási struktúra bővítés" lépés -- `growth` (35 vizsgálat/hó, 14
 * AI-elemzés/hó) és `business` (gyakorlatban korlátlan vizsgálat, 100 AI-elemzés/hó,
 * EGYEDI ártárgyalás -- nem önkiszolgáló Stripe checkout tétel, lásd `BillingTab.tsx`)
 * hozzáadva a korábbi `starter`/`pro` mellé -- lásd
 * `supabase/migrations/20260806_pricing_tiers_growth_business_ai_credits.sql`.
 *
 * 2026-08-07, "Ingyenes alap-kvóta bevezetése" lépés -- `free` hozzáadva: ez az az
 * állapot, amit egy szervezet a legelső `user_credits` sor létrejöttekor kap, MIELŐTT
 * bármilyen fizetős csomagot választott volna (5 vizsgálat / 3 AI-kredit havonta) --
 * KORÁBBAN ilyenkor is `starter`-t kapott, ami a Billing felületen tévesen "Egyéni
 * csomag / Aktív csomag"-ként jelent meg egy sosem fizető usernek is, lásd
 * `supabase/migrations/20260807_free_tier_default_quota.sql`. */
export type QuotaPlanTier = 'free' | 'starter' | 'growth' | 'pro' | 'business';

export interface QuotaBalance {
  /** A KÖZÖS, szervezet-szintű kvóta-sor szervezet-azonosítója -- ugyanaz a
   * `user_credits.organization_id`, mint a `UserCredit`-nél (lásd `types/credits.ts`),
   * mert a plan_tier/kvóta oszlopok UGYANAZON a `user_credits` táblán élnek. */
  organizationId: string;
  planTier: QuotaPlanTier;
  monthlyInspectionsLimit: number;
  monthlyInspectionsRemaining: number;
  purchasedInspectionsRemaining: number;
  /** monthlyInspectionsRemaining + purchasedInspectionsRemaining összege. */
  totalInspectionsAvailable: number;
  monthlyAiLimit: number;
  monthlyAiRemaining: number;
  /** Vásárolt (nem lejáró) AI-kredit keret -- 2026-08-06, "Árazási struktúra bővítés"
   * lépés, `user_credits.purchased_ai_remaining` -- a havi keret elfogyása UTÁN
   * vonódik le belőle (lásd `consume_ai_quota` RPC). */
  purchasedAiRemaining: number;
  /** monthlyAiRemaining + purchasedAiRemaining összege -- ez az a szám, amit a
   * felhasználónak ténylegesen "AI kredit"-ként kell mutatni (lásd
   * `HeaderCreditBadge.tsx`/`CreditDashboardModal.tsx`), NEM csak a havi rész. */
  totalAiAvailable: number;
  /** `user_credits.stripe_subscription_id` léte -- 2026-08-17, "Előfizetés lemondása"
   * lépés: `true`, ha a szervezetnek van egy Stripe-on keresztül létrejött, ÉLŐ
   * előfizetése (tehát a `BillingTab.tsx` "Előfizetés lemondása" gombja ténylegesen
   * hívható) -- KÜLÖNBÖZIK a `planTier !== 'free'`-től, mert az Autóház (`business`)
   * tier EGYEDI ártárgyalással jár, Stripe Subscription objektum NÉLKÜL (lásd
   * `BillingTab.tsx` "Kapcsolatfelvétel" CTA-ját), ott ez a mező `false` marad. */
  hasActiveStripeSubscription: boolean;
  /** `user_credits.cancel_at_period_end` -- `true`, ha a Menedzser lemondta az
   * előfizetést (`/api/stripe/cancel-subscription`), de a MÁR KIFIZETETT számlázási
   * ciklus végéig még aktív. */
  cancelAtPeriodEnd: boolean;
  /** `user_credits.subscription_current_period_end` (ISO string) -- a jelenlegi
   * számlázási ciklus/előfizetés vége. `cancelAtPeriodEnd === true` esetén ez az a
   * dátum, ameddig a szervezet MÉG hozzáfér a fizetett csomaghoz, utána a Stripe
   * automatikusan 'free'-re fokozza vissza (lásd `app/api/stripe/webhook/route.ts`
   * `handleSubscriptionEvent`-jét). `null`, ha nincs (soha nem volt) Stripe-előfizetés. */
  subscriptionCurrentPeriodEnd: string | null;
}
