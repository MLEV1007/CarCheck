# Security audit -- /admin (Platform Admin felület)

**Dátum:** 2026-08-11
**Kérdés (Levi):** Mennyire könnyű a `/admin` felülethez fiók nélkül, illetéktelenül
hozzáférni ("feltörni")? Számít-e, hogy a `/admin` egy gyakran bot-scannelt útvonal-név?

**Módszer:** a tényleges kódot (middleware, Server Component guard, Supabase RLS policy-k,
auth-folyamat) végigkövetve, NEM feltételezésekből -- minden alábbi állítás egy konkrét
fájlra/policy-ra hivatkozik.

## Rövid válasz

Fiók nélkül ma gyakorlatilag nem lehet hozzáférni -- három egymástól független védelmi
réteg van egymás mögött, és a legerősebb (az adatbázis RLS) még akkor is tartana, ha a
felső kettő valamiért hibás lenne. A `/admin` elnevezés önmagában NEM biztonsági rés, csak
egy kényelmi/zaj-kérdés (lásd lent) -- a botok scannelése ellen a valódi védelem nem a
titkos elnevezés, hanem az, hogy nincs mit "feltörni" rajta (nincs jelszó, amit
kitalálhatnának).

## A hozzáférési lánc, ahogy egy fiók nélküli látogató/bot ténylegesen ütközik vele

**1. réteg -- `middleware.ts` / `lib/supabase/middleware.ts` (Edge, minden kérésnél lefut,
MIELŐTT bármilyen oldal-kód vagy adatbázis-lekérdezés elindulna).** A `/admin` szerepel a
`PROTECTED_PREFIXES` listában. A session-ellenőrzés `supabase.auth.getClaims()`-szel
történik -- ez a BIZTONSÁGOS módszer (helyben, WebCrypto+JWKS-szel validálja a JWT
aláírását), NEM a `getSession()`, amit a Supabase dokumentáció kifejezetten NEM javasol
route-védelemre, mert nincs garantáltan aláírás-ellenőrizve. Bejelentkezés nélkül a
`/admin`-ra érkező kérés `302`-es átirányítást kap a `/login`-ra -- **nulla adat, nulla
adatbázis-lekérdezés fut le.** Egy scannelő bot itt pontosan annyit tud meg, hogy ez egy
létező, bejelentkezést igénylő útvonal -- ugyanennyit tudna meg a `/dashboard` vagy a
`/settings` scannelésével is.

**2. réteg -- `app/admin/page.tsx` (Server Component, csak akkor fut, ha VAN érvényes
munkamenet).** Bárki, aki regisztrál (az önkiszolgáló regisztráció NYITOTT, ez szándékos
üzleti döntés, nem hiba), IDE már bejut -- de a kód rögtön leellenőrzi az `isPlatformAdmin
(user.id)`-t (`lib/auth/roles.ts`), ami a `platform_admins` allow-list táblát nézi. Ha nem
admin: "Hozzáférés megtagadva" szöveg, **és a szervezetek/profilok/kredit-adatok lekérdezése
(a `Promise.all` blokk) EL SEM INDUL** -- ez kódszinten, nem csak vizuálisan van blokkolva.

**3. réteg -- Supabase RLS (Row-Level Security), az ADATBÁZIS szintjén -- ez a TÉNYLEGES,
megkerülhetetlen határ.** Még ha a fenti kettő valamiért hibás lenne (pl. egy jövőbeli
kódmódosítás véletlenül kihagyná a guard-ot), egy bejelentkezett-de-nem-admin felhasználó
ÁLTAL KÖZVETLENÜL a Supabase REST API-nak küldött kérés (a Next.js app teljes megkerülésével)
akkor is csak a saját szervezetét látná: az `organizations`/`profiles`/`user_credits`/
`inspections` táblák `_platform_admin` policy-jai (lásd `20260803_platform_admin_
entitlements.sql`, `20260811120000_admin_credits_management.sql`) mind az `is_platform_
admin()` SQL-függvényre épülnek, ami a `platform_admins` táblát nézi. **A `platform_admins`
táblán NINCS insert/update/delete policy `authenticated` szerepkörre** -- vagyis senki, SEMMILYEN
API-hívással nem tudja saját magát felvenni erre a listára; ez KIZÁRÓLAG SQL-lel/service-role
kulccsal módosítható, ami csak szerver-oldalon, KIZÁRÓLAG a `lib/supabase/admin.ts`-ben él,
soha nem kerül a böngészőbe (`NEXT_PUBLIC_`-előtag nélkül, ellenőriztem: nincs is használva
kliens-komponensben, és a `.env.local` git-ignore-olt, nincs commitolva).

**Következtetés:** a védelem NEM egyetlen pontra (pl. "van-e URL a menüben") épül, hanem
mindhárom rétegen külön-külön is meg kellene bukni ahhoz, hogy valaki más ügyfelek adatához
jusson.

## Miért nem "feltörhető" ez klasszikus bot-scanneléssel

A `/admin`, `/wp-admin`, `/administrator` stílusú 0-24 automata scannelés szinte mindig
**jelszó-alapú** bejelentkezést céloz (credential stuffing: kiszivárgott felhasználónév/
jelszó párok tömeges kipróbálása, vagy alap jelszavak, pl. `admin`/`admin123`). Ennek a
projektnek **NINCS jelszó mezője SEHOL** -- a bejelentkezés kizárólag Magic Link (email-be
küldött, egyszer használatos link) vagy Passkey (eszközhöz kötött WebAuthn) -- lásd
`RegisterForm.tsx`/`MagicLinkForm.tsx`/`PasskeyButton.tsx`. Egy botnak **nincs mit
beírnia** -- nincs jelszó-mező, amit tömegesen próbálgathatna. Ahhoz, hogy valaki egyáltalán
munkamenetet szerezzen, vagy egy VALÓS postafiók felett kell rendelkeznie (hogy a Magic
Linkre kattintson), vagy egy adott eszközhöz kötött, korábban regisztrált Passkey-vel kell
rendelkeznie -- egyik sem tömeges, automatizált scanneléssel kivitelezhető, mindkettő egy
konkrét, célzott célpontot (a te vagy egy ügyfeled postafiókját/eszközét) igényelne.

Jelenleg egyetlen fiók van a `platform_admins` allow-listen: `test@buildmysite.hu` (ma
állítva be). A tényleges "mit kellene feltörnie egy támadónak" tehát leszűkül erre az egy
postafiókra (vagy magára a Supabase-projektre/service-role kulcsra) -- ez FÜGGETLEN attól,
hogy a felület URL-je `/admin` vagy bármi más.

## Mit ér ténylegesen a `/admin` átnevezése

Nem biztonsági lyukat zár be, mert -- lásd fent -- nincs mit kihasználni rajta jelenleg.
Amit VALÓBAN csökkent:
- **Log-zaj**: a 0-24 scannelő botok 302-es válaszai ma is megjelennek a Vercel logokban,
  feleslegesen nehezítve a tényleges hibák/gyanús minták kiszűrését.
- **Felderítési érték**: egy kevésbé kitalálható útvonal-név (pl. egy random string) picivel
  csökkenti annak esélyét, hogy valaki egyáltalán tudja, hol KÍSÉRELJEN meg bármit (bár a
  fenti védelem enélkül is tartana).

Ez egy olcsó, érdemes MÁSODLAGOS lépés (defense-in-depth), de fontos tudni, hogy ez
kényelmi/zaj-csökkentő intézkedés, NEM az, ami ma megvédi az adatot -- azt a 2-3. réteg
(RLS + allow-list) csinálja.

## Talált hiányosságok / javasolt, még el nem végzett lépések

Fontossági sorrendben, de egyik sem "azonnal cselekvő" súlyosságú a fentiek fényében:

1. **Nincs alkalmazás-szintű rate limit** semmilyen route-on (sem a middleware-ben, sem a
   Magic Link küldésén) -- jelenleg KIZÁRÓLAG a Supabase Auth (GoTrue) beépített
   korlátjára támaszkodtok (`MagicLinkForm.tsx` kommentje szerint a beépített teszt-email-
   küldőnek "szigorú óránkénti korlátja van" -- ha időközben egyedi SMTP-re álltatok át
   éles forgalomhoz, érdemes megnézni a Supabase Dashboard -> Authentication -> Rate
   Limits beállítást, mert onnantól ez az egyetlen fék, ami megakadályozza, hogy valaki
   tömegesen Magic Link e-maileket generáltasson egy célpont postafiókjába
   ("email-bombázás") vagy feleslegesen terhelje az email-küldési kvótát/számlát.
2. **Nincsenek biztonsági HTTP-fejlécek** (`next.config.mjs`-ben sem CSP, sem
   `X-Frame-Options`/`frame-ancestors`, sem `Referrer-Policy` nincs beállítva). Ez
   elméletben egy clickjacking-vektort hagy nyitva egy MÁR bejelentkezett Platform Admin
   ellen (egy láthatatlan iframe-be ágyazva rávehető lenne egy kattintásra, ami pl. a
   csapatkezelés-kapcsolót vagy egy ügyfél kredit-egyenlegét módosítaná) -- olcsó
   hozzáadni, érdemes egy következő lépésben.
3. **Nincs naplózás/riasztás** arra, ha egy bejelentkezett-de-nem-admin felhasználó
   ismételten megpróbálja betölteni a `/admin`-t -- ma ez csendben történik, nincs jelzés,
   ha valaki (pl. egy kíváncsi ügyfél) próbálkozik. Nem sürgős, de egy log-sor az "access
   denied" ágban gyakorlatilag ingyenes védelmi jel lenne.
4. **Nincs `robots.txt`** a projektben -- ez nem biztonsági, csak higiéniai pont (a keresők/
   jóindulatú crawler-ek számára jelezné, hogy `/admin`-t ne indexeljék).

## Amit NEM kell most megcsinálni

Nem javaslom Stripe-fizetési vagy egyéb, ehhez a kérdéshez nem kapcsolódó módosítást
végezni csak a `/admin` miatt -- a jelenlegi három réteg (Edge-redirect, Server Component
guard, RLS + allow-list) strukturálisan elegendő, a fenti 4 pont finomhangolás, nem
sürgősségi javítás.
