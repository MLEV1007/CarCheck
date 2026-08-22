'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, Mail, X, Zap } from 'lucide-react';
import { formatDateTimeHu, formatHuf } from '@/lib/format';
import type { QuotaSummarySuccessResponse } from '@/app/api/quotas/summary/route';
import type { QuotaPlanTier } from '@/types/quotas';

interface BillingTabProps {
  /** Csak Menedzsernek látszanak a vásárlási gombok (PROJEKT_INSTRUKCIOK.md "Frontend
   * Fizetési Modal / Billing Felület" lépés, explicit szabály). A `SettingsTabs.tsx` maga
   * a teljes "Előfizetés" fület is csak Menedzsernek jeleníti meg, ez a prop egy MÁSODIK,
   * belső védelmi réteg, ha ez a komponens valaha egy Átvizsgálónak is látható helyre
   * kerülne. */
  role: 'manager' | 'inspector';
  /** A Stripe Price ID-k a szerver-oldali env változókból (`STRIPE_PRICE_ID_*`), ez a
   * kliens-komponens nem olvashatja őket közvetlenül (nincs `NEXT_PUBLIC_` előtag,
   * szándékosan, lásd `.env.local.example`), ezért a szülő Server Component
   * (`app/settings/_components/SettingsPageContent.tsx`) adja át prop-ként. `null`, ha az
   * adott ár még nincs beállítva a Vercel környezeti változói között, ilyenkor a
   * hozzá tartozó gomb `disabled` marad, hibaüzenet helyett.
   *
   * **2026-08-06, "Árazási struktúra bővítés" lépés:** `growthPriceId` (új, `growth` havi
   * csomag) + 3 AI-kredit-csomag ár (`aiTopup5/15/40PriceId`) hozzáadva, lásd
   * `supabase/migrations/20260806_pricing_tiers_growth_business_ai_credits.sql`
   * `apply_plan_purchase` RPC-jének bővített `p_plan_action` enumját. A `business` tier
   * SZÁNDÉKOSAN nem kap price ID-t, egyedi ártárgyalás, nem önkiszolgáló Stripe
   * Checkout tétel (lásd lent a `plans` tömb `business` bejegyzését). */
  starterPriceId: string | null;
  growthPriceId: string | null;
  proPriceId: string | null;
  /** Éves (kb. 20% kedvezményes) Price ID-k, 2026-08-07, "Havi/éves kapcsoló" lépés.
   * `null`, ha még nincs beállítva, ilyenkor az éves nézetben a kártya gombja az
   * érvényes havi árra esik vissza (lásd a kártya-renderelésnél az `activePriceId`
   * `?? plan.monthlyPriceId` fallback-et), hogy a vásárlás gomb ne váljon haszontalanná
   * egy hiányzó env változó miatt. */
  starterYearlyPriceId: string | null;
  growthYearlyPriceId: string | null;
  proYearlyPriceId: string | null;
  topupPriceId: string | null;
  aiTopup5PriceId: string | null;
  aiTopup15PriceId: string | null;
  aiTopup40PriceId: string | null;
  /** `?success=true`/`?canceled=true` a Stripe Checkout `success_url`/`cancel_url`
   * visszairányításából (lásd `app/api/stripe/checkout/route.ts`), a szülő oldal
   * (`app/settings/billing/page.tsx`) olvassa ki a `searchParams`-ból. */
  banner: 'success' | 'canceled' | null;
  /** `?session_id=` a Stripe Checkout `success_url`-jéből, 2026-08-09, "Nincs
   * számla-email" lépés. `null`, ha nincs (pl. `canceled` banner esetén). Ebből kérjük le
   * a `/api/stripe/checkout-session` route-tól a számla linkjét, hogy MEGBÍZHATÓAN
   * megjelenítsük, függetlenül attól, hogy a Stripe `sendInvoice` e-mailje eljutott-e a
   * vevőhöz (lásd `app/api/stripe/webhook/route.ts` JSDoc-ját, ez időszakosan,
   * indokolatlanul hibázik ugyanolyan felépítésű Session-öknél). */
  sessionId: string | null;
}

/** `plan_tier` -> magyar megjelenítendő címke, ugyanaz a forrás, mint
 * `CreditDashboardModal.tsx`-ben (a két felület szándékosan azonos szóhasználatot ad).
 * 2026-08-07, "Fizetések átnevezése" lépés: a belső `starter`/`growth`/`pro`/`business`
 * azonosító VÁLTOZATLAN maradt (DB enum, Stripe webhook leképezés), csak a felhasználónak
 * mutatott név cserélődött, lásd PROJEKT_INSTRUKCIOK.md-hez tartozó kérést.
 * 2026-08-07, "Ingyenes alap-kvóta bevezetése" lépés: `free` hozzáadva, ez a fizetés
 * nélküli kezdőállapot címkéje, SZÁNDÉKOSAN nem szerepel a `plans` tömbben (lent), tehát
 * egy ilyen usernek egyik fizetős kártyán sem jelenik meg "Aktív csomag".
 *
 * `export`, 2026-08-11, "Platform Admin kredit/előfizetés-kezelés" lépés: az
 * `AdminOrganizationsTable.tsx` is ugyanezt a címke-szóhasználatot használja a csomag-
 * választó dropdownnál, hogy a Platform Admin ÉS az ügyfél-arcú Billing felület
 * konzisztens legyen, egyetlen forrás, nem duplikált leképezés. */
export const PLAN_TIER_LABELS: Record<QuotaPlanTier, string> = {
  free: 'Ingyenes csomag',
  starter: 'Egyéni csomag',
  growth: 'Műhely / Kereskedői csomag',
  pro: 'Profi csomag',
  business: 'Autóház csomag',
};

/** IDEIGLENES teszt-üzemmódi zár (2026-08-12, felhasználói kérés: "szeretném ha a
 * vásárlás gomb inaktív lenne a tesztelés alatt... Ki fogom adni tesztelésre cégeknek a
 * rendszert, még nem szeretném ha vásárolnának"), `true` esetén a 3 TÉNYLEGES Stripe
 * Checkout-ot indító gomb (csomagváltás, +10 vizsgálat Top-up, AI-kredit vásárlása)
 * TELJESEN NORMÁL kinézettel LÁTHATÓ marad (nem tűnik el, nem halványul el), de nem
 * kattintható, a "Kapcsolatfelvétel" (Autóház, mailto) gomb és a Havi/Éves kapcsoló NEM
 * érintett, mert azok nem indítanak valódi fizetést.
 *
 * **2026-08-17, "Fizetés élesítése" lépés: `false`-ra állítva**, a felhasználó kérte a
 * tesztelési zár feloldását, mostantól minden Menedzser ténylegesen vásárolhat
 * (előfizetés-csomag, +10 vizsgálat Top-up, AI-kredit csomagok). A kapcsoló és a fenti
 * teszt-időszaki dokumentáció szándékosan a helyén maradt (NINCS törölve/kód-eltávolítva),
 * ha egy KÉSŐBBI tesztelési időszakhoz megint kellene, elég `true`-ra visszaállítani,
 * nincs hozzá env-változó vagy DB-mező.
 *
 * **FONTOS, SZÁNDÉKOSAN NEM a natív HTML `disabled` attribútummal van megvalósítva
 * (2026-08-12, 2. finomítás, felhasználói kérés: "ha ráviszem a kurzort piros kör
 * áthúzva jelenjen meg rajta"):** az ELSŐ verzió `disabled={PURCHASES_DISABLED_FOR_TESTING
 * || ...}`-t használt, ami éles tesztelésben (macOS Safari/Chrome) NEM mutatta a
 * "tiltott" (`cursor: not-allowed`, a kör-áthúzva ikon) kurzort ráhúzáskor, ez egy jól
 * dokumentált böngésző-kvirk: a `cursor` CSS tulajdonság `disabled` form-vezérlőkön
 * megbízhatatlanul/egyáltalán nem érvényesül (Safari pl. figyelmen kívül hagyja), a
 * natívan letiltott gomb `title` tooltipje pedig Chrome-ban/Safariban EGYÁLTALÁN NEM
 * jelenik meg ráhúzáskor. Ehelyett a gomb HTML-szinten "engedélyezett" marad (a natív
 * `disabled` KIZÁRÓLAG a valódi, átmeneti okoknál, checkout épp folyamatban/hiányzó
 * price ID, aktív), a tényleges blokkolást a `handlePurchase()` elején lévő korai
 * `return` (lásd lent) végzi, a `cursor-not-allowed` osztály pedig FELTÉTEL NÉLKÜL (nem
 * `disabled:` variánsként) kerül a gombra, ez a kombináció MINDEN böngészőben
 * megbízhatóan mutatja a kör-áthúzva kurzort ÉS a `title` tooltipet is, miközben a gomb
 * kinézete (szín/árnyalat) nem változik, tehát nem "tűnik el"/halványul. */
const PURCHASES_DISABLED_FOR_TESTING = false;

type LoadState = 'loading' | 'ready' | 'error';
type BillingPeriod = 'monthly' | 'yearly';

interface PlanCardDef {
  key: 'starter' | 'growth' | 'pro' | 'business';
  title: string;
  /** `null` a `business` tier-nél, egyedi ártárgyalás, nincs fix, nyilvánosan
   * megjelenített ár (lásd a kártya renderelésénél a "Egyedi ajánlat" ágat). */
  monthlyPrice: number | null;
  /** Éves ár TELJES (12 havi) összege, kb. 20% kedvezménnyel, `null` a `business`
   * tier-nél, ugyanúgy, mint a `monthlyPrice`-nál. */
  yearlyPrice: number | null;
  monthlyPriceId: string | null;
  yearlyPriceId: string | null;
  features: string[];
  isCurrentPlan?: boolean;
  highlight?: boolean;
}

interface AiPackDef {
  key: 'ai_topup5' | 'ai_topup15' | 'ai_topup40';
  credits: number;
  price: number;
  priceId: string | null;
}

/**
 * Beállítások > Előfizetés (Billing) felület (PROJEKT_INSTRUKCIOK.md "Frontend Fizetési
 * Modal / Billing Felület" lépés, 2026-08-04), Stripe design system (`stripe.md`, mert a
 * `/settings` alatti felület, lásd PROJEKT_INSTRUKCIOK.md 4.1 pontja): jelenlegi csomag +
 * hátralévő vizsgálati/AI keret, majd a 4 előfizetési csomag kártyája, végül egy külön
 * "AI-kredit vásárlása" szekció.
 *
 * **2026-08-06, "Árazási struktúra bővítés" lépés, a korábbi 3-kártyás (Starter/Pro/
 * +10 Autó) elrendezés helyett:**
 *   1) 4 ELŐFIZETÉSI csomag: Starter (20 vizsgálat / 6 AI-kredit havonta), Growth (ÚJ, 35
 *      vizsgálat / 14 AI-kredit), Pro (50 vizsgálat / 25 AI-kredit, az AI-keret
 *      TUDATOSAN kevesebb, mint a vizsgálati keret MINDEN csomagnál, hogy ne lehessen az
 *      összes vizsgálatot AI-val elvégezni, lásd a felhasználóval egyeztetett
 *      "scarcity by design" elvet), Business (ÚJ, gyakorlatban korlátlan vizsgálat + 100
 *      AI-kredit, EGYEDI ártárgyalás, kapcsolatfelvétel gomb, NEM Stripe Checkout).
 *   2) a "+10 Autó" eseti vizsgálat-Top-up KÜLÖN szekcióban marad (nem előfizetés).
 *   3) ÚJ: "AI-kredit vásárlása" szekció 3 csomaggal (5/15/40 kredit), a felhasználó
 *      explicit kérése volt egy ÖNÁLLÓAN vásárolható AI-kredit termék, hogy ha valakinek
 *      elfogy a havi AI-kerete, ne kelljen magasabb csomagra váltania, csak kredit-et
 *      vegyen. "1 AI-kredit = 1 vizsgálat" (a `lib/inspectionAiCredit.ts` "1 AI kredit = 1
 *      vizsgálat" elve alapján, TELJES vizsgálatra vonatkozik, nem egyedi AI-hívásra).
 *
 * Önállóan, kliens-oldalon tölti be a `/api/quotas/summary` adatot (ugyanaz a minta, mint
 * `CreditDashboardModal.tsx`/`HeaderCreditBadge.tsx`), MINDEN fül-váltáskor/oldal-
 * betöltéskor friss adatot mutat, nem egy esetlegesen elavult pillanatképet.
 */
export function BillingTab({
  role,
  starterPriceId,
  growthPriceId,
  proPriceId,
  starterYearlyPriceId,
  growthYearlyPriceId,
  proYearlyPriceId,
  topupPriceId,
  aiTopup5PriceId,
  aiTopup15PriceId,
  aiTopup40PriceId,
  banner,
  sessionId,
}: BillingTabProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<QuotaSummarySuccessResponse | null>(null);
  /** A sikeres fizetés banner számla-linkje, lásd a `sessionId` prop JSDoc-ját.
   * `undefined` = még nem érkezett válasz (nincs link megjelenítve), `null` = lekérdezve,
   * de nincs számla ehhez a Session-höz (pl. előfizetés, nem egyszeri vásárlás). */
  const [invoiceUrl, setInvoiceUrl] = useState<string | null | undefined>(undefined);
  const [checkoutLoadingKey, setCheckoutLoadingKey] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  /** "Előfizetés lemondása" (2026-08-17, felhasználói kérés), lásd
   * `app/api/stripe/cancel-subscription/route.ts` JSDoc-ját. `isCancelModalOpen` a
   * megerősítő modal (lásd lent `CancelSubscriptionModal`), `cancelActionLoading` a
   * lemondás/visszavonás GOMB saját (a csomagváltó gombokétól KÜLÖN) töltési állapota,
   * `cancelActionError` a hozzá tartozó hibaüzenet. */
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelActionLoading, setCancelActionLoading] = useState(false);
  const [cancelActionError, setCancelActionError] = useState<string | null>(null);
  /** Havi/éves kapcsoló, 2026-08-07, "Havi/éves kapcsoló" lépés. Csak a 3 önkiszolgáló
   * előfizetési kártyát (Egyéni/Műhely Kereskedői/Profi) érinti, az Autóház (egyedi
   * ajánlat) és a Top-up/AI-kredit szekciók változatlanok maradnak. */
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/quotas/summary');
        const json = (await response.json().catch(() => null)) as QuotaSummarySuccessResponse | null;

        if (cancelled) return;

        if (response.ok && json?.success) {
          setData(json);
          setState('ready');
        } else {
          setState('error');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (banner !== 'success' || !sessionId) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/stripe/checkout-session?session_id=${encodeURIComponent(sessionId)}`);
        const json = (await response.json().catch(() => null)) as
          | { success: true; invoiceUrl: string | null }
          | { success: false; error: string }
          | null;

        if (cancelled) return;
        setInvoiceUrl(response.ok && json?.success ? json.invoiceUrl : null);
      } catch {
        if (!cancelled) setInvoiceUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [banner, sessionId]);

  async function handlePurchase(priceId: string | null, key: string) {
    // Teszt-üzemmódi zár (lásd `PURCHASES_DISABLED_FOR_TESTING` JSDoc-ját fent), ez a
    // TÉNYLEGES blokkolási pont (a gombok HTML-szinten szándékosan NEM `disabled`-ek,
    // hogy a `cursor-not-allowed` és a `title` tooltip ráhúzáskor megbízhatóan
    // megjelenjen minden böngészőben), billentyűzettel (Enter/Space) aktivált
    // kattintást is ugyanígy elnyel.
    if (PURCHASES_DISABLED_FOR_TESTING) return;

    if (!priceId) {
      setCheckoutError('Ez a csomag jelenleg nem elérhető, keress meg minket az aktiváláshoz.');
      return;
    }

    setCheckoutError(null);
    setCheckoutLoadingKey(key);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const json = (await response.json().catch(() => null)) as
        | { success: true; url: string }
        | { success: false; error: string }
        | null;

      if (response.ok && json?.success) {
        window.location.href = json.url;
        return;
      }

      setCheckoutError(json?.success === false ? json.error : 'Nem sikerült elindítani a fizetést.');
    } catch {
      setCheckoutError('Nem sikerült elindítani a fizetést. Ellenőrizd az internetkapcsolatot.');
    } finally {
      setCheckoutLoadingKey(null);
    }
  }

  /**
   * Előfizetés lemondása/visszavonása (2026-08-17), lásd
   * `app/api/stripe/cancel-subscription/route.ts` JSDoc-ját a "biztos megoldás"
   * (`cancel_at_period_end`) indoklásáért. Sikeres válasz esetén OPTIMISTA módon,
   * helyben frissítjük a `data.quota` állapotot (nem várjuk meg a webhook kör-utat,
   * lásd a route JSDoc "DB write-through" pontját), a `planTier`/kvóta-oszlopok
   * VÁLTOZATLANOK maradnak, hiszen a lemondás csak a `cancelAtPeriodEnd`/
   * `subscriptionCurrentPeriodEnd` mezőket érinti, amíg a kifizetett ciklus le nem jár.
   */
  async function handleCancelAction(action: 'cancel' | 'resume') {
    setCancelActionError(null);
    setCancelActionLoading(true);

    try {
      const response = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = (await response.json().catch(() => null)) as
        | { success: true; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null }
        | { success: false; error: string }
        | null;

      if (response.ok && json?.success) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                quota: {
                  ...prev.quota,
                  cancelAtPeriodEnd: json.cancelAtPeriodEnd,
                  subscriptionCurrentPeriodEnd: json.currentPeriodEnd,
                },
              }
            : prev
        );
        setIsCancelModalOpen(false);
        return;
      }

      setCancelActionError(
        json?.success === false
          ? json.error
          : action === 'cancel'
            ? 'Nem sikerült lemondani az előfizetést.'
            : 'Nem sikerült visszavonni a lemondást.'
      );
    } catch {
      setCancelActionError('Nem sikerült teljesíteni a kérést. Ellenőrizd az internetkapcsolatot.');
    } finally {
      setCancelActionLoading(false);
    }
  }

  const currentPlanTier = data?.quota.planTier;

  const plans: PlanCardDef[] = [
    {
      key: 'starter',
      title: 'Egyéni',
      monthlyPrice: 18990,
      yearlyPrice: 182300,
      monthlyPriceId: starterPriceId,
      yearlyPriceId: starterYearlyPriceId,
      features: [
        '20 vizsgálat / hó',
        '6 AI-kredit / hó',
        'Publikus, márkázott ügyfélriport (PDF-exporttal)',
        'Alap e-mail támogatás',
      ],
      isCurrentPlan: currentPlanTier === 'starter',
    },
    {
      key: 'growth',
      title: 'Műhely / Kereskedői',
      monthlyPrice: 27990,
      yearlyPrice: 268700,
      monthlyPriceId: growthPriceId,
      yearlyPriceId: growthYearlyPriceId,
      features: [
        '35 vizsgálat / hó',
        '14 AI-kredit / hó',
        'Publikus, márkázott ügyfélriport (PDF-exporttal)',
        'Csapatkezelés (csapattagok meghívása) (ÚJ)',
        'Kiemelt támogatás',
      ],
      isCurrentPlan: currentPlanTier === 'growth',
      highlight: true,
    },
    {
      key: 'pro',
      title: 'Profi',
      monthlyPrice: 37990,
      yearlyPrice: 364700,
      monthlyPriceId: proPriceId,
      yearlyPriceId: proYearlyPriceId,
      features: [
        '50 vizsgálat / hó',
        '25 AI-kredit / hó',
        'Publikus, márkázott ügyfélriport (PDF-exporttal)',
        'AI szakértő chat az ügyfélriporton',
        'Csapatkezelés (csapattagok meghívása)',
        'Kiemelt támogatás',
      ],
      isCurrentPlan: currentPlanTier === 'pro',
    },
    {
      key: 'business',
      title: 'Autóház',
      monthlyPrice: null,
      yearlyPrice: null,
      monthlyPriceId: null,
      yearlyPriceId: null,
      features: [
        'Gyakorlatban korlátlan vizsgálat / hó',
        '100 AI-kredit / hó',
        'Publikus, márkázott ügyfélriport (PDF-exporttal)',
        'AI szakértő chat az ügyfélriporton',
        'Csapatkezelés (csapattagok meghívása)',
        'Dedikált támogatás + egyedi feltételek',
      ],
      isCurrentPlan: currentPlanTier === 'business',
    },
  ];

  const aiPacks: AiPackDef[] = [
    { key: 'ai_topup5', credits: 5, price: 4990, priceId: aiTopup5PriceId },
    { key: 'ai_topup15', credits: 15, price: 12990, priceId: aiTopup15PriceId },
    { key: 'ai_topup40', credits: 40, price: 29990, priceId: aiTopup40PriceId },
  ];

  return (
    <div className="flex flex-col gap-6">
      {banner === 'success' && (
        <div className="rounded-stripe-md border border-green-200 bg-green-50 px-4 py-3 font-sohne text-[13px] text-green-800">
          <p>
            Sikeres fizetés! A csomagod/keretkiegészítésed néhány másodpercen belül megjelenik itt lent, ha nem
            látod azonnal, frissítsd az oldalt.
          </p>
          {invoiceUrl && (
            <a
              href={invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block font-medium underline underline-offset-2"
            >
              Számla megnyitása
            </a>
          )}
        </div>
      )}
      {banner === 'canceled' && (
        <div className="rounded-stripe-md border border-stripe-hairline bg-stripe-canvas-soft px-4 py-3 font-sohne text-[13px] text-stripe-ink-secondary">
          A fizetés megszakadt, semmi nem történt, bármikor újrapróbálhatod.
        </div>
      )}

      {/* Jelenlegi csomag + hátralévő keret */}
      <div className="rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1 sm:p-8">
        <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">Jelenlegi csomag</h2>

        {state === 'loading' && (
          <div className="mt-4 flex items-center gap-2 font-sohne text-[13px] text-stripe-ink-mute">
            <Loader2 className="h-4 w-4 animate-spin" />
            Egyenleg betöltése…
          </div>
        )}

        {state === 'error' && (
          <p className="mt-4 font-sohne text-[13px] text-red-600">
            Nem sikerült betölteni az előfizetés-adatokat. Próbáld újra később.
          </p>
        )}

        {state === 'ready' && data && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-stripe-canvas-cream px-3 py-1 font-sohne text-[13px] font-medium text-stripe-lemon">
                {PLAN_TIER_LABELS[data.quota.planTier]}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-stripe-md border border-stripe-hairline px-4 py-3">
                <p className="font-sohne text-[12px] font-normal uppercase tracking-wide text-stripe-ink-mute">
                  Hátralévő vizsgálat
                </p>
                <p className="mt-1 font-sohne text-[20px] font-medium tabular-nums text-stripe-ink">
                  {data.quota.monthlyInspectionsRemaining + data.quota.purchasedInspectionsRemaining}
                  <span className="ml-1 font-sohne text-[13px] font-light text-stripe-ink-mute">
                    / {data.quota.monthlyInspectionsLimit} havi
                    {data.quota.purchasedInspectionsRemaining > 0
                      ? ` + ${data.quota.purchasedInspectionsRemaining} Top-up`
                      : ''}
                  </span>
                </p>
              </div>
              <div className="rounded-stripe-md border border-stripe-hairline px-4 py-3">
                <p className="font-sohne text-[12px] font-normal uppercase tracking-wide text-stripe-ink-mute">
                  Hátralévő AI-kredit
                </p>
                <p className="mt-1 flex items-center gap-1 font-sohne text-[20px] font-medium tabular-nums text-stripe-ink">
                  <Zap className="h-4 w-4 text-stripe-primary" />
                  {data.quota.totalAiAvailable}
                  <span className="ml-1 font-sohne text-[13px] font-light text-stripe-ink-mute">
                    / {data.quota.monthlyAiLimit} havi
                    {data.quota.purchasedAiRemaining > 0 ? ` + ${data.quota.purchasedAiRemaining} vásárolt` : ''}
                  </span>
                </p>
              </div>
            </div>
            <p className="font-sohne text-[12px] font-light text-stripe-ink-mute">
              1 AI-kredit egy TELJES vizsgálat összes AI-funkcióját fedezi (VIN-szkenneléstől a
              szakvélemény-összefoglalóig).
            </p>

            {/* Előfizetés lemondása (2026-08-17), csak Menedzsernek, és csak ha van
                tényleges Stripe-előfizetés (lásd `hasActiveStripeSubscription` JSDoc-ját,
                az Autóház/business tier egyedi ajánlat, Stripe Subscription nélkül). */}
            {role === 'manager' && data.quota.hasActiveStripeSubscription && (
              <div className="border-t border-stripe-hairline pt-4">
                {data.quota.cancelAtPeriodEnd ? (
                  <div className="flex flex-col gap-3 rounded-stripe-md border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-sohne text-[13px] font-light text-amber-800">
                      Az előfizetésed lemondva,{' '}
                      <span className="font-medium">
                        {formatDateTimeHu(data.quota.subscriptionCurrentPeriodEnd) || 'a jelenlegi ciklus végéig'}
                      </span>{' '}
                      még teljes hozzáférésed van, utána a fiókod automatikusan Ingyenes csomagra vált. A fiókod
                      NEM törlődik.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCancelAction('resume')}
                      disabled={cancelActionLoading}
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-amber-300 bg-white px-4 font-sohne text-[13px] font-normal text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {cancelActionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Lemondás visszavonása
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-sohne text-[12px] font-light text-stripe-ink-mute">
                      Ha lemondod az előfizetésed, a már kifizetett időszak végéig (
                      {formatDateTimeHu(data.quota.subscriptionCurrentPeriodEnd) || 'a ciklus végéig'}) még
                      változatlanul használhatod a rendszert, utána automatikusan Ingyenes csomagra vált. A fiókod
                      megmarad.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsCancelModalOpen(true)}
                      className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-stripe-ruby/40 px-4 font-sohne text-[13px] font-normal text-stripe-ruby transition-colors hover:bg-stripe-ruby/5"
                    >
                      Előfizetés lemondása
                    </button>
                  </div>
                )}
                {cancelActionError && (
                  <p role="alert" className="mt-2 font-sohne text-[12px] text-stripe-ruby">
                    {cancelActionError}
                  </p>
                )}
              </div>
            )}

            {role === 'manager' && !data.quota.hasActiveStripeSubscription && data.quota.planTier === 'business' && (
              <p className="border-t border-stripe-hairline pt-4 font-sohne text-[12px] font-light text-stripe-ink-mute">
                Az Autóház csomag egyedi ajánlat, a lemondásához{' '}
                <a
                  href="mailto:levente.manyi@buildmysite.hu?subject=Aut%C3%B3h%C3%A1z%20csomag%20-%20lemond%C3%A1s"
                  className="font-medium text-stripe-primary underline underline-offset-2"
                >
                  vedd fel velünk a kapcsolatot
                </a>
                .
              </p>
            )}
          </div>
        )}
      </div>

      {isCancelModalOpen && (
        <CancelSubscriptionModal
          isLoading={cancelActionLoading}
          error={cancelActionError}
          periodEndLabel={formatDateTimeHu(data?.quota.subscriptionCurrentPeriodEnd ?? null)}
          onConfirm={() => handleCancelAction('cancel')}
          onClose={() => {
            setCancelActionError(null);
            setIsCancelModalOpen(false);
          }}
        />
      )}

      {/* 4 előfizetési csomag-kártya + Havi/Éves kapcsoló (2026-08-07, "Havi/éves kapcsoló"
          lépés), könnyű, függőségmentes szegmentált kapcsoló (nincs @radix-ui/react-switch,
          hogy ne kerüljön be egy csak erre az egy helyre importált új csomag). */}
      <div>
        <div className="mb-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">Előfizetési csomagok</h2>
          <div className="inline-flex items-center rounded-full border border-stripe-hairline bg-stripe-canvas-soft p-1">
            <button
              type="button"
              onClick={() => setBillingPeriod('monthly')}
              className={`rounded-full px-3.5 py-1.5 font-sohne text-[13px] font-normal transition-colors ${
                billingPeriod === 'monthly'
                  ? 'bg-white text-stripe-ink shadow-stripe-1'
                  : 'text-stripe-ink-mute hover:text-stripe-ink-secondary'
              }`}
            >
              Havi
            </button>
            <button
              type="button"
              onClick={() => setBillingPeriod('yearly')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-sohne text-[13px] font-normal transition-colors ${
                billingPeriod === 'yearly'
                  ? 'bg-white text-stripe-ink shadow-stripe-1'
                  : 'text-stripe-ink-mute hover:text-stripe-ink-secondary'
              }`}
            >
              Éves
              <span className="rounded-full bg-stripe-primary/10 px-1.5 py-0.5 font-sohne text-[11px] font-medium text-stripe-primary">
                -20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const showYearly = billingPeriod === 'yearly' && plan.yearlyPrice !== null;
            const activePriceId = showYearly ? (plan.yearlyPriceId ?? plan.monthlyPriceId) : plan.monthlyPriceId;
            const displayedMonthlyEquivalent = showYearly
              ? Math.round((plan.yearlyPrice as number) / 12)
              : plan.monthlyPrice;
            const yearlySavings =
              showYearly && plan.monthlyPrice !== null ? plan.monthlyPrice * 12 - (plan.yearlyPrice as number) : 0;

            return (
              <div
                key={plan.key}
                className={`flex flex-col gap-5 rounded-stripe-lg border bg-white p-7 shadow-stripe-1 transition-all duration-200 hover:-translate-y-1 hover:shadow-stripe-2 ${
                  plan.highlight ? 'border-stripe-primary ring-1 ring-stripe-primary' : 'border-stripe-hairline'
                }`}
              >
                <div>
                  {plan.highlight && (
                    <span className="mb-2.5 inline-flex items-center rounded-full bg-stripe-primary/10 px-2.5 py-0.5 font-sohne text-[11px] font-medium text-stripe-primary">
                      Legnépszerűbb
                    </span>
                  )}
                  <h3 className="font-sohne text-[16px] font-medium leading-snug text-stripe-ink">{plan.title}</h3>
                  {displayedMonthlyEquivalent !== null ? (
                    <>
                      <p className="mt-2 whitespace-nowrap font-sohne text-[26px] font-medium tabular-nums text-stripe-ink">
                        {formatHuf(displayedMonthlyEquivalent)}
                        <span className="font-sohne text-[13px] font-light text-stripe-ink-mute">/hó</span>
                      </p>
                      <p className="mt-1 font-sohne text-[12px] font-light leading-relaxed text-stripe-ink-mute">
                        {showYearly
                          ? `évente egyben számlázva (${formatHuf(plan.yearlyPrice)}), spórolsz ${formatHuf(
                              yearlySavings
                            )}-ot/év`
                          : 'havonta számlázva'}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 font-sohne text-[20px] font-medium text-stripe-ink">Egyedi ajánlat</p>
                  )}
                </div>

                <ul className="flex flex-1 flex-col gap-2.5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 font-sohne text-[14px] font-light leading-relaxed text-stripe-ink-secondary"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stripe-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {role === 'manager' ? (
                  plan.isCurrentPlan ? (
                    <span className="inline-flex h-9 items-center justify-center rounded-full border border-stripe-hairline font-sohne text-[13px] font-normal text-stripe-ink-mute">
                      Aktív csomag
                    </span>
                  ) : plan.key === 'business' ? (
                    <a
                      href="mailto:levente.manyi@buildmysite.hu?subject=Aut%C3%B3h%C3%A1z%20csomag%20-%20egyedi%20aj%C3%A1nlat"
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-stripe-primary px-4 font-sohne text-[13px] font-normal text-stripe-primary transition-colors hover:bg-stripe-primary/5"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Kapcsolatfelvétel
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handlePurchase(activePriceId, `${plan.key}_${billingPeriod}`)}
                      disabled={checkoutLoadingKey === `${plan.key}_${billingPeriod}` || !activePriceId}
                      aria-disabled={PURCHASES_DISABLED_FOR_TESTING || checkoutLoadingKey === `${plan.key}_${billingPeriod}` || !activePriceId}
                      title={PURCHASES_DISABLED_FOR_TESTING ? 'Tesztelés alatt a vásárlás átmenetileg nem elérhető.' : undefined}
                      className={`inline-flex min-h-[2.25rem] items-center justify-center gap-1.5 rounded-full bg-stripe-primary px-4 py-2 text-center font-sohne text-[13px] font-normal leading-snug text-white transition-colors hover:bg-stripe-primary-deep disabled:cursor-not-allowed disabled:opacity-60 ${
                        PURCHASES_DISABLED_FOR_TESTING ? 'cursor-not-allowed' : ''
                      }`}
                    >
                      {checkoutLoadingKey === `${plan.key}_${billingPeriod}` && (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      )}
                      Váltás erre a csomagra
                    </button>
                  )
                ) : (
                  <span className="font-sohne text-[12px] font-light text-stripe-ink-mute">
                    Csak a Menedzser vásárolhat/válthat csomagot.
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Extra vizsgálat Top-up */}
      <div>
        <h2 className="mb-3 font-sohne text-[15px] font-medium text-stripe-ink">Extra vizsgálat</h2>
        <div className="flex flex-col gap-4 rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-sohne text-[15px] font-medium text-stripe-ink">+10 vizsgálat csomag</p>
            <p className="mt-1 font-sohne text-[13px] font-light text-stripe-ink-secondary">
              Bővítsd a havi keretedet bármikor. A megvásárolt extra vizsgálatok nem járnak le, és bármelyik csomag
              mellett tetszőlegesen felhasználhatók.
            </p>
            <p className="mt-2 font-sohne text-[20px] font-medium tabular-nums text-stripe-ink">
              {formatHuf(8500)}
              <span className="font-sohne text-[13px] font-light text-stripe-ink-mute"> / csomag</span>
            </p>
          </div>
          {role === 'manager' ? (
            <button
              type="button"
              onClick={() => handlePurchase(topupPriceId, 'topup10')}
              disabled={checkoutLoadingKey === 'topup10' || !topupPriceId}
              aria-disabled={PURCHASES_DISABLED_FOR_TESTING || checkoutLoadingKey === 'topup10' || !topupPriceId}
              title={PURCHASES_DISABLED_FOR_TESTING ? 'Tesztelés alatt a vásárlás átmenetileg nem elérhető.' : undefined}
              className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-stripe-primary px-5 font-sohne text-[13px] font-normal text-white transition-colors hover:bg-stripe-primary-deep disabled:cursor-not-allowed disabled:opacity-60 ${
                PURCHASES_DISABLED_FOR_TESTING ? 'cursor-not-allowed' : ''
              }`}
            >
              {checkoutLoadingKey === 'topup10' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Vásárlás
            </button>
          ) : (
            <span className="font-sohne text-[12px] font-light text-stripe-ink-mute">
              Csak a Menedzser vásárolhat.
            </span>
          )}
        </div>
      </div>

      {/* AI-kredit vásárlása, "1 AI kredit = 1 vizsgálat" */}
      <div>
        <h2 className="mb-1 font-sohne text-[15px] font-medium text-stripe-ink">AI-kredit vásárlása</h2>
        <p className="mb-3 font-sohne text-[13px] font-light text-stripe-ink-secondary">
          Vásárolj kiegészítő AI-kreditet csomagváltás nélkül. 1 kredit egy teljes átvizsgálás összes intelligens
          funkcióját (diktálás, forgalmi-szkenner, összefoglaló) fedezi. A megvásárolt kreditek nem járnak le.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {aiPacks.map((pack) => (
            <div
              key={pack.key}
              className="flex flex-col gap-3 rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1"
            >
              <div className="flex items-center gap-1.5 font-sohne text-[15px] font-medium text-stripe-ink">
                <Zap className="h-4 w-4 text-stripe-primary" />
                {pack.credits} AI-kredit
              </div>
              <p className="font-sohne text-[24px] font-medium tabular-nums text-stripe-ink">
                {formatHuf(pack.price)}
                <span className="font-sohne text-[13px] font-light text-stripe-ink-mute"> / csomag</span>
              </p>
              <p className="font-sohne text-[12px] font-light text-stripe-ink-mute">
                {formatHuf(Math.round(pack.price / pack.credits))} / kredit
              </p>
              {role === 'manager' ? (
                <button
                  type="button"
                  onClick={() => handlePurchase(pack.priceId, pack.key)}
                  disabled={checkoutLoadingKey === pack.key || !pack.priceId}
                  aria-disabled={PURCHASES_DISABLED_FOR_TESTING || checkoutLoadingKey === pack.key || !pack.priceId}
                  title={PURCHASES_DISABLED_FOR_TESTING ? 'Tesztelés alatt a vásárlás átmenetileg nem elérhető.' : undefined}
                  className={`mt-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-stripe-primary px-4 font-sohne text-[13px] font-normal text-stripe-primary transition-colors hover:bg-stripe-primary/5 disabled:cursor-not-allowed disabled:opacity-60 ${
                    PURCHASES_DISABLED_FOR_TESTING ? 'cursor-not-allowed' : ''
                  }`}
                >
                  {checkoutLoadingKey === pack.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Vásárlás
                </button>
              ) : (
                <span className="font-sohne text-[12px] font-light text-stripe-ink-mute">
                  Csak a Menedzser vásárolhat.
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {checkoutError && (
        <p
          role="status"
          className="rounded-stripe-md border border-red-200 bg-red-50 px-4 py-3 font-sohne text-[13px] text-red-700"
        >
          {checkoutError}
        </p>
      )}
    </div>
  );
}

/**
 * "Előfizetés lemondása" megerősítő modal (2026-08-17), ugyanaz a modal-mintázat, mint
 * a `DeleteAccountCard.tsx` "Fiók törlése" modaljánál (háttér-kattintás/`X`/`Mégse` zárja
 * be, amíg nincs folyamatban lévő kérés), DE annál KÖNNYEBB megerősítéssel (nincs beírandó
 * email cím), a lemondás VISSZAVONHATÓ (lásd "Lemondás visszavonása" gomb), a fiók/
 * adatok NEM vesznek el, tehát nem indokolt ugyanolyan szigorú megerősítés, mint egy
 * végleges fiók-törlésnél.
 */
function CancelSubscriptionModal({
  isLoading,
  error,
  periodEndLabel,
  onConfirm,
  onClose,
}: {
  isLoading: boolean;
  error: string | null;
  periodEndLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={isLoading ? undefined : onClose}
      role="presentation"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Előfizetés lemondásának megerősítése"
        className="w-full max-w-md rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stripe-ruby/10 text-stripe-ruby">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <h3 className="font-sohne text-[16px] font-normal text-stripe-ink">Biztosan lemondod az előfizetést?</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Bezárás"
            className="rounded-full p-1 text-stripe-ink-mute transition-colors hover:bg-stripe-canvas-soft hover:text-stripe-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-2 font-sohne text-[13px] font-light leading-relaxed text-stripe-ink-secondary">
          <p>
            A már kifizetett időszak végéig ({periodEndLabel || 'a jelenlegi ciklus végéig'}) MINDEN funkciódat
            változatlanul tovább használhatod.
          </p>
          <p>Utána a fiókod automatikusan Ingyenes csomagra vált, a fiókod és a korábbi vizsgálataid megmaradnak.</p>
          <p>A lemondást a ciklus vége előtt bármikor visszavonhatod.</p>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-stripe-sm border border-stripe-ruby/30 bg-stripe-ruby/5 px-3 py-2 font-sohne text-[13px] text-stripe-ruby">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="inline-flex h-9 items-center justify-center rounded-full border border-stripe-hairline-input px-4 font-sohne text-[13px] font-normal text-stripe-ink-secondary transition-colors hover:bg-stripe-canvas-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            Mégse
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-stripe-ruby px-4 font-sohne text-[13px] font-normal text-white transition-colors hover:bg-stripe-ruby/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Előfizetés lemondása
          </button>
        </div>
      </div>
    </div>
  );
}
