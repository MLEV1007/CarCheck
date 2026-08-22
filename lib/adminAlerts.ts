import { createAdminClient } from '@/lib/supabase/admin';
import { sendAlertEmail } from '@/lib/resend';

/**
 * Illetéktelen `/admin` hozzáférési kísérletek naplózása + email-riasztás (2026-08-11,
 * a security audit "Nincs naplózás/riasztás" pontjára, Levi kifejezett kérésére).
 *
 * Hívja: `app/admin/page.tsx`, a "Hozzáférés megtagadva" ágban (bejelentkezett, DE NEM
 * `platform_admins` allow-listen szereplő user próbálta betölteni az oldalt).
 *
 * **Throttle, nem minden kísérletnél email:** ha ugyanaz a user `ALERT_THROTTLE_MINUTES`-en
 * belül TÖBBSZÖR is megpróbálja betölteni a `/admin`-t (pl. véletlenül könyvjelzőzte,
 * vagy többször frissíti az oldalt), csak az ELSŐ kísérletnél megy ki email, a NAPLÓZÁS
 * (`admin_access_attempts` sor beszúrása) viszont MINDEN egyes kísérletnél megtörténik,
 * csak az `alert_email_sent` mező marad `false` a throttle-elt soroknál. Enélkül egy
 * kíváncsi/frissítgető user könnyen email-áradatot generálna.
 *
 * **Service-role kliens, NEM a hívó user RLS-jogosultsága:** a hívó user (aki éppen
 * ELUTASÍTÁST kapott) definíció szerint NEM láthatja/írhatja az `admin_access_attempts`
 * táblát a saját RLS-jogosultságával (nincs is rá `authenticated`-nek szánt insert
 * policy, lásd a migráció JSDoc-ját), a naplózás ezért a `lib/supabase/admin.ts`
 * service-role klienssel történik, UGYANAZ a minta, mint a Stripe webhook `user_credits`
 * írásainál.
 *
 * **Sose dob hibát a hívó felé:** ez egy "best-effort" mellékhatás, nem szabad, hogy egy
 * DB- vagy email-küldési hiba miatt az elutasított user egy csúnya 500-as hibaoldalt
 * lásson a "Hozzáférés megtagadva" helyett, minden hiba itt elnyelve, csak logolva
 * (`console.error`), UGYANAZ az elv, mint `lib/quotas.ts` `checkAiQuota`-jánál.
 */
const ALERT_THROTTLE_MINUTES = 60;

/** Ide megy a riasztó email, ma egyetlen, hardcode-olt cím (Levi kérése szerint).
 * Ha a jövőben több platform admin lesz, ezt cserélhetjük egy `platform_admins` tábla
 * + `auth.users.email` join-ra, ami MINDEN aktuális platform adminnak elküldi. */
const ALERT_RECIPIENT_EMAIL = 'test@buildmysite.hu';

interface UnauthorizedAccessUser {
  id: string;
  email: string | null | undefined;
}

function buildAlertEmailHtml(user: UnauthorizedAccessUser, attemptedAt: Date): string {
  const formattedDate = attemptedAt.toLocaleString('hu-HU', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Europe/Budapest',
  });

  return `
    <div style="font-family: sans-serif; font-size: 14px; color: #0d253d;">
      <p><strong>Illetéktelen /admin hozzáférési kísérlet történt a CarPass rendszerben.</strong></p>
      <p>
        Fiók email címe: <strong>${user.email ?? '(ismeretlen)'}</strong><br />
        Felhasználó azonosító (user_id): <code>${user.id}</code><br />
        Időpont: ${formattedDate} (Europe/Budapest)
      </p>
      <p>
        Ez a fiók be van jelentkezve a CarPass-ba, de NINCS rajta a platform admin
        allow-listen, megpróbálta betölteni a /admin felületet, és elutasítást kapott.
        Ha ezt nem te vagy egy ismert csapattag kezdeményezte, érdemes megvizsgálni.
      </p>
    </div>
  `.trim();
}

export async function notifyUnauthorizedAdminAccess(user: UnauthorizedAccessUser): Promise<void> {
  try {
    const supabaseAdmin = createAdminClient();
    const now = new Date();
    const throttleSince = new Date(now.getTime() - ALERT_THROTTLE_MINUTES * 60 * 1000).toISOString();

    // FONTOS (2026-08-11, hibajavítás, lásd status.md): a throttle-lekérdezés
    // KIZÁRÓLAG a TÉNYLEGESEN SIKERES küldéseket (`alert_email_sent = true`) veszi
    // figyelembe, NEM minden korábbi kísérletet. Az eredeti verzió bármelyik korábbi
    // kísérletet (sikertelent is) throttle-nek számított, ami azt jelentette, hogy ha az
    // ELSŐ email-küldés elhasalt (pl. hiányzó `RESEND_API_KEY`), a hiba kijavítása UTÁN is
    // csendben 60 percig KIMARADT volna minden újrapróbálkozás, élesben pontosan ez
    // történt: manyilevente@gmail.com sokszor próbálkozott, mindegyik sor `alert_email_
    // sent=false` lett, mert az ELSŐ (sikertelen) kísérlet lezárta a throttle-ablakot a
    // többi elől is.
    const { data: recentAttempt, error: recentAttemptError } = await supabaseAdmin
      .from('admin_access_attempts')
      .select('id')
      .eq('user_id', user.id)
      .eq('alert_email_sent', true)
      .gte('attempted_at', throttleSince)
      .limit(1)
      .maybeSingle();

    if (recentAttemptError) {
      console.error('[adminAlerts] Korábbi kísérletek lekérdezése sikertelen:', recentAttemptError);
    }

    const shouldSendEmail = !recentAttempt;

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('admin_access_attempts')
      .insert({ user_id: user.id, email: user.email ?? null })
      .select('id')
      .single();

    if (insertError || !inserted) {
      console.error('[adminAlerts] Kísérlet naplózása sikertelen:', insertError);
      return;
    }

    if (!shouldSendEmail) {
      console.log('[adminAlerts] Kísérlet naplózva, email KIHAGYVA (throttle, volt már friss kísérlet):', {
        userId: user.id,
      });
      return;
    }

    try {
      await sendAlertEmail({
        to: ALERT_RECIPIENT_EMAIL,
        subject: 'CarPass, illetéktelen /admin hozzáférési kísérlet',
        html: buildAlertEmailHtml(user, now),
      });

      const { error: updateError } = await supabaseAdmin
        .from('admin_access_attempts')
        .update({ alert_email_sent: true })
        .eq('id', inserted.id);

      if (updateError) {
        console.error('[adminAlerts] alert_email_sent frissítése sikertelen (az email egyébként kiment):', updateError);
      }

      console.log('[adminAlerts] Riasztó email elküldve:', { userId: user.id, to: ALERT_RECIPIENT_EMAIL });
    } catch (emailError) {
      console.error('[adminAlerts] Riasztó email küldése sikertelen (a kísérlet naplózva lett):', emailError);
    }
  } catch (error) {
    console.error('[adminAlerts] Váratlan hiba a riasztás feldolgozása közben:', error);
  }
}
