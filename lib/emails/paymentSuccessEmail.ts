import { sendTransactionalEmail } from '@/lib/resend';

/**
 * "Sikeres fizetés" visszaigazoló email az ügyfélnek -- 2026-08-17, "Sikeres fizetés email +
 * számlázási cím kötelezővé tétele" lépés, Levi kifejezett kérésére. Hívja:
 * `app/api/stripe/webhook/route.ts` `handleCheckoutSessionCompleted`, MINDEN sikeres
 * `checkout.session.completed` eseménynél (havi előfizetés ÉS egyszeri Top-up/AI-kredit
 * vásárlás egyaránt) -- lásd ott a hívás JSDoc-ját a "best-effort, nem dob hibát a webhook
 * felé" indoklásért.
 *
 * **A HTML dizájn (lásd lent `buildPaymentSuccessEmailHtml`) SZÁNDÉKOSAN ugyanaz a
 * stílus/CSS, mint a Supabase Auth "Magic Link" belépő email sablonjáé** (Levi 2026-08-17-i
 * kérése, ugyanazt a `.container`/`.logo`/`.title`/`.text`/`.button`/`.footer` osztály-
 * struktúrát használja, kiegészítve egy `.details` doboz-osztállyal a fizetés-adatoknak) --
 * ha a Magic Link sablon dizájnja változik, ezt is érdemes vele szinkronban tartani. A KÉT
 * KÖTELEZŐ tartalmi elem, amit egy jövőbeli átdolgozásnál is MEG KELL TARTANI:
 *   1) a fizetési azonosító (`paymentId`) megjelenítése,
 *   2) a tájékoztatás, hogy a számlát a fizetést követő 24 órán belül kiküldjük, HA az
 *      összes szükséges számlázási adat rendelkezésre áll (ez utóbbi a `checkout/route.ts`
 *      `billing_address_collection: 'required'` beállításával TÉNYLEGESEN gyakorlatilag
 *      mindig teljesül, lásd annak JSDoc-ját).
 */

export interface PaymentSuccessEmailParams {
  /** A vásárlást indító user email címe (Stripe Checkout `customer_details.email`, ennek
   * hiányában a session létrehozásakor megadott `customer_email`-re esik vissza -- lásd a
   * hívó JSDoc-ját). */
  to: string;
  /** Ügyfélnek mutatott fizetési azonosító -- a Checkout Session-höz tartozó PaymentIntent ID
   * ('payment' módú, egyszeri vásárlásnál), ennek hiányában a Subscription ID
   * ('subscription' módnál), ennek hiányában maga a Checkout Session ID. Lásd a hívó
   * JSDoc-ját a pontos leképezésért. */
  paymentId: string;
  /** Megvásárolt tétel megjelenített neve, pl. "Profi csomag (havi előfizetés)" vagy "+10
   * Autó vizsgálat-csomag". */
  itemLabel: string;
  /** Formázott összeg, pl. "9 900 Ft". */
  amountLabel: string;
  /** A fizetés időpontja. */
  paidAt: Date;
}

/** Éles CarPass domain a "Előfizetés megtekintése" gombhoz -- lásd `lib/supabase/client.ts` +
 * `app/adatkezeles/page.tsx` JSDoc-jait, ez a projekt bekötött saját domainje. A
 * `checkout/route.ts`-ben elérhető `request.nextUrl.origin` itt NEM elérhető (a webhook egy
 * szerver-szerver Stripe hívás, nincs mögötte böngésző-kérés), ezért fix URL. */
const BILLING_PAGE_URL = 'https://carpass.hu/settings/billing';

function buildPaymentSuccessEmailHtml(params: Omit<PaymentSuccessEmailParams, 'to'>): string {
  const formattedDate = params.paidAt.toLocaleString('hu-HU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Budapest',
  });

  // Lásd a fenti JSDoc-ot -- ugyanaz a CSS-osztály-struktúra (.container/.logo/.title/.text/
  // .button/.footer), mint a Supabase Auth "Magic Link" belépő email sablonjában, kiegészítve
  // egy `.details` doboz-osztállyal a fizetés-adatok (tétel/összeg/azonosító/időpont)
  // áttekinthető megjelenítéséhez.
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
.container { max-width: 500px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.logo { font-size: 24px; font-weight: bold; color: #09090b; margin-bottom: 24px; }
.title { font-size: 20px; font-weight: 600; color: #18181b; margin-bottom: 12px; }
.text { font-size: 15px; color: #71717a; line-height: 1.5; margin-bottom: 24px; }
.details { background-color: #f4f4f5; border-radius: 8px; padding: 4px 20px; margin-bottom: 24px; }
.details-row { font-size: 14px; color: #18181b; padding: 8px 0; border-bottom: 1px solid #e4e4e7; }
.details-row:last-child { border-bottom: none; }
.details-row span { color: #71717a; }
.button { display: inline-block; background-color: #2563eb; color: #ffffff !important; font-weight: 600; font-size: 15px; text-decoration: none; padding: 12px 24px; border-radius: 8px; text-align: center; }
.footer { margin-top: 32px; font-size: 12px; color: #a1a1aa; text-align: center; }
</style>
</head>
<body>
<div class="container">
<div class="logo">🚗 CarPass</div>
<div class="title">Sikeres fizetés</div>
<p class="text">
      Köszönjük, a fizetésed sikeresen megtörtént. Alább találod a vásárlás adatait.
</p>
<div class="details">
  <div class="details-row"><span>Tétel:</span> ${params.itemLabel}</div>
  <div class="details-row"><span>Összeg:</span> ${params.amountLabel}</div>
  <div class="details-row"><span>Fizetési azonosító:</span> ${params.paymentId}</div>
  <div class="details-row"><span>Időpont:</span> ${formattedDate}</div>
</div>
<p class="text">
      A számlát a fizetést követő <strong>24 órán belül</strong> elküldjük emailben, amennyiben az összes szükséges számlázási adat (pl. számlázási cím) rendelkezésre áll.
</p>
<a href="${BILLING_PAGE_URL}" class="button">Előfizetés megtekintése</a>
<p class="footer">
      Ha bármilyen kérdésed van a fizetéssel kapcsolatban, keress minket bizalommal.<br>
      © CarPass – Autó Állapotfelmérő
</p>
</div>
</body>
</html>
  `.trim();
}

export async function sendPaymentSuccessEmail(params: PaymentSuccessEmailParams): Promise<void> {
  await sendTransactionalEmail({
    to: params.to,
    subject: 'CarPass -- Sikeres fizetés',
    html: buildPaymentSuccessEmailHtml(params),
  });
}
