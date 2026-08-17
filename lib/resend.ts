/**
 * Általános célú, tetszőleges tartalmú email küldés Resend-en keresztül (2026-08-11,
 * "Illetéktelen /admin hozzáférés riasztás" lépés) -- KIZÁRÓLAG szerver-oldali kódból
 * hívható (`lib/adminAlerts.ts`), SOHA nem 'use client' komponensből, mert a
 * `RESEND_API_KEY` nincs `NEXT_PUBLIC_` előtaggal.
 *
 * Miért ez, és nem a Supabase Auth email-küldése: a Supabase beépített email-küldője
 * (ami a Magic Linket is küldi, lásd `MagicLinkForm.tsx`) KIZÁRÓLAG a saját, fix Auth
 * sablon-eseményeire (login/confirm/invite/reset) hívható -- nincs API rajta tetszőleges
 * tartalmú, egyedi email küldésére (pl. ez a riasztás). Ezért ÚJ, önálló szolgáltatás
 * (Resend) szükséges -- Levi választása a security audit "Nincs naplózás/riasztás"
 * pontjára adott tisztázó kérdésre (2026-08-11).
 *
 * Szándékosan `fetch`-csel, a `resend` npm csomag hozzáadása NÉLKÜL -- egyetlen,
 * viszonylag ritka (throttle-elt) email-küldéshez nem indokolt egy új dependency, a
 * Resend REST API-ja pedig triviálisan hívható közvetlenül (ugyanaz az elv, mint
 * `lib/stripe.ts`-nél a hivatalos SDK, DE ott a Stripe API jóval bonyolultabb/gyakrabban
 * hívott, ott megéri az SDK-t használni -- itt NEM).
 */

export class MissingResendApiKeyError extends Error {
  constructor() {
    super(
      'A RESEND_API_KEY hiányzik (vagy üres) a szerver környezeti változói közül -- ' +
        'lásd .env.local.example. Regisztrálj a resend.com-on, hozz létre egy API kulcsot, ' +
        'és állítsd be Vercelen (Production környezetre is bepipálva) + a helyi ' +
        '.env.local-ban.'
    );
    this.name = 'MissingResendApiKeyError';
  }
}

const RESEND_API_URL = 'https://api.resend.com/emails';

/** Alapértelmezett feladó -- 2026-08-11, Levi megerősítése: a `carpass.hu` domain MÁR
 * hitelesítve van a Resend fiókban, és a `noreply@carpass.hu` cím már ÉLESBEN küldi a
 * regisztrációs/belépési (Magic Link) emaileket a Supabase Auth SMTP-integrációján
 * keresztül -- lásd a `RESEND_ALERT_FROM_EMAIL` env változó JSDoc-ját lent, ha mégis felül
 * akarod írni (pl. teszt-környezetben). */
const DEFAULT_FROM_EMAIL = 'CarPass Riasztás <noreply@carpass.hu>';

/** Ügyfélnek szóló (nem belső riasztás) tranzakciós emailek alapértelmezett feladója --
 * 2026-08-17, "Sikeres fizetés email" lépés. Külön env változóval (`RESEND_FROM_EMAIL`)
 * felülírható, hogy a "Riasztás" feladó-név NE jelenjen meg ügyfélnek szóló levélben
 * (pl. `lib/emails/paymentSuccessEmail.ts`). Ugyanaz a hitelesített `carpass.hu` domain. */
const DEFAULT_TRANSACTIONAL_FROM_EMAIL = 'CarPass <noreply@carpass.hu>';

interface SendViaResendParams {
  from: string;
  to: string;
  subject: string;
  html: string;
}

async function sendViaResend({ from, to, subject, html }: SendViaResendParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new MissingResendApiKeyError();
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '(nincs válasz-törzs)');
    throw new Error(`Resend email küldés sikertelen (HTTP ${response.status}): ${details}`);
  }
}

interface SendAlertEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Egyetlen, tetszőleges tartalmú email elküldése a Resend REST API-n keresztül.
 * DOB hibát, ha a küldés sikertelen (hívja a `lib/adminAlerts.ts` `notifyUnauthorizedAdminAccess`-e,
 * ami ezt elkapva csak logol -- a riasztás-küldés hibája SOHA nem szabad, hogy az `/admin`
 * oldal renderelését megakassza).
 */
export async function sendAlertEmail({ to, subject, html }: SendAlertEmailParams): Promise<void> {
  const from = process.env.RESEND_ALERT_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL;
  await sendViaResend({ from, to, subject, html });
}

interface SendTransactionalEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Ügyfélnek szóló tranzakciós email (pl. sikeres fizetés visszaigazolás, lásd
 * `lib/emails/paymentSuccessEmail.ts`) küldése a Resend REST API-n keresztül -- 2026-08-17,
 * "Sikeres fizetés email" lépés. Ugyanaz az infrastruktúra, mint a `sendAlertEmail`-nél
 * (ugyanaz a hitelesített domain), csak MÁS alapértelmezett feladó-névvel ("CarPass", NEM
 * "CarPass Riasztás") -- lásd `DEFAULT_TRANSACTIONAL_FROM_EMAIL`. DOB hibát, ha a küldés
 * sikertelen -- a hívó (`app/api/stripe/webhook/route.ts`) elkapja és csak logolja, UGYANAZ
 * az elv, mint a `stripe.invoices.sendInvoice()` hívásnál: az email-küldés hibája SOHA nem
 * szabad, hogy a webhook (és vele a kredit/csomag jóváírás) hiba-státuszra álljon.
 */
export async function sendTransactionalEmail({ to, subject, html }: SendTransactionalEmailParams): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_TRANSACTIONAL_FROM_EMAIL;
  await sendViaResend({ from, to, subject, html });
}
