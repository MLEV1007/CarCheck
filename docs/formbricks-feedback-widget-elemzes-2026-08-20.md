# Formbricks in-app visszajelzés-widget integráció – megvalósíthatósági elemzés

**Projekt:** CarPass (Autó Állapotfelmérő SaaS) · **Dátum:** 2026-08-20 · **Vizsgált kódbázis:** `/Users/manyilevente/Projektek/CarCheck`

---

## 1. Megvalósíthatósági összegzés

**Igen, a Formbricks integrálható a jelenlegi CarPass architektúrába**, méghozzá viszonylag alacsony kockázattal a *kód* oldalán (Next.js App Router + kliens-oldali SDK egy jól bejáratott minta), de **nem triviális az *infrastruktúra* oldala**, ha a self-hosted változat mellett döntötök. A projekt eddig kizárólag menedzselt szolgáltatásokra épül (Vercel + Supabase) — nincs saját szerver, saját Postgres, saját tárhely-szolgáltatás. A self-hosted Formbricks ezt a modellt töri meg: egy különálló, tartósan futó szolgáltatás-köteget igényel (web app + Postgres + fájltárhely + a 2026-os verziókban emellett egy "Hub" és egy Cube.js analitikai komponens is). Ez nem lehetetlen, de ez lenne a projekt **első saját üzemeltetésű backend-komponense**.

Emiatt a javaslatom: **induljatok a Formbricks Cloud ingyenes ("Hobby") csomagjával**, ami dokumentáltan tartalmazza az in-app widgetet, a fájlfeltöltést és a teljes API-hozzáférést, infrastruktúra-üzemeltetés nélkül, EU (Németország) adattárolással. A self-hostingot érdemes később, konkrét adatszuverenitási/megfelelőségi indok esetén megfontolni — lásd a 4. pontot.

A "privát, csak az admin lássa" követelmény **hosting-módtól függetlenül** megoldható: ez a Formbricks projekten/environment-en belüli tagság kérdése (ki van meghívva a Formbricks szervezetbe), nem attól függ, hogy cloud vagy self-hosted verziót használtok.

---

## 2. A releváns kódbázis-tények (amik a döntést befolyásolják)

- **Stack:** Next.js 15.1 (App Router), React 19, TypeScript (strict), Tailwind CSS, Supabase (`@supabase/ssr` — Auth + Postgres/RLS + Storage), Stripe, Vercel hosting.
- **Auth-minta:** a projektben **nincs kliens-oldali globális auth-context/hook** (nincs `AuthProvider`, `useUser` stb.). A bejelentkezett user adatait minden védett oldal (Server Component) saját maga kéri le `supabase.auth.getUser()`-rel (pl. `app/dashboard/page.tsx`, `app/settings/_components/SettingsPageContent.tsx`, `app/admin/page.tsx`). Kliens-oldali auth-állapothoz tehát vagy propként kell átadni a szerverről, vagy a böngésző-oldali Supabase klienssel (`lib/supabase/client.ts`) kell lekérdezni/feliratkozni.
- **Layout-struktúra:** **egyetlen** `layout.tsx` létezik, a gyökér `app/layout.tsx` — nincsenek beágyazott layout-ok a védett route-okhoz (`/dashboard`, `/inspections/*`, `/settings/*`, `/admin`) vagy a publikus route-okhoz (`/`, `/login`, `/register`, `/report/[public_token]`). A gyökér layout mindent körbevesz, beleértve a **publikus, nem bejelentkezett ügyfeleknek szóló riport-oldalt is**.
- **Védett útvonalak forrása:** `middleware.ts` → `lib/supabase/middleware.ts` `PROTECTED_PREFIXES = ['/dashboard', '/inspections', '/settings', '/admin']`. Ez a lista pontosan lefedi azt a kört, ahol a widgetnek meg kellene jelennie — érdemes ugyanezt a listát újrahasznosítani a Formbricks-betöltés feltételéhez, hogy egy helyen legyen karbantartva.
- **Kijelentkezés egyetlen belépési pontja:** `components/auth/SignOutButton.tsx` (`supabase.auth.signOut()` + redirect `/login`-ra). Ez jelenleg az egyetlen hely, ahol a session lezárása történik.
- **Már létező globális kliens-provider minta:** `InsufficientCreditsProvider` a gyökér layoutban (`'use client'`, React Context, minden oldalt körbevesz) — ez a bejáratott minta arra, hogyan kerül be egy globális, kliens-oldali "szolgáltatás" a fába anélkül, hogy minden oldalt módosítani kellene.
- **Third-party script még nincs a projektben** — sem `next/script`, sem hasonló külső SDK-betöltés nem található. A Formbricks lenne az első ilyen integráció, tehát nincs meglévő minta, amit követni kellene, de nincs is meglévő ütközés-kockázat (pl. korábbi Script-stratégiával).
- **Meglévő "lebegő gomb" és z-index minták (fontos az UI-ütközés szempontjából):**
  - Modális ablakok konzekvensen `fixed inset-0 z-50` (pl. `InsufficientCreditsModal.tsx`, `CreditDashboardModal.tsx`, `TeamManagement.tsx`, `DeleteAccountCard.tsx`, `BillingTab.tsx`, `MediaLightbox.tsx`).
  - **`components/inspections/wizard/InspectionWizard.tsx` (1001. sor):** a vizsgálati wizard alján egy `fixed bottom-0 left-0 z-50 w-full` sáv fut **mobilon, a teljes szélességben** — ez a wizard elsődleges, mobil-first navigációs eleme (garázsban/terepen használják telefonon). Egy Formbricks alapértelmezett, jobb-alsó sarokba illesztett lebegő gomb ezzel **vizuálisan ütközhet vagy takarásba kerülhet** a vizsgálat kitöltése közben.
  - **`components/report/ReportAiChat.tsx` (116. sor):** a **publikus** ügyfélriport-oldalon (`/report/[public_token]`) már van egy jobb-alsó lebegő chat-gomb (`z-40`). Mivel a visszajelzés-widget csak bejelentkezett felhasználóknak szól, ez a felület nem releváns cél, de jó referencia arra, hogy a csapat már tudatosan kezeli a "lebegő gomb" pozíciókat és a `print:hidden` eseteket.
  - Tailwind configban **nincs explicit z-index skála** definiálva — a projekt Tailwind alapértelmezett `z-*` osztályokkal dolgozik ad hoc módon (`z-20`/`z-40`/`z-50`), tehát a Formbricks widget z-indexét is ehhez a *de facto* konvencióhoz (modal/overlay = 50) kell majd igazítani, felülírva a saját CSS-ében.
- **Env var-konvenció:** a `.env.local.example` szigorúan dokumentálja a `NEXT_PUBLIC_` prefix szabályát (csak böngészőben biztonságosan kiszivárogtatható értékek kaphatják), és minden titkos kulcsnál (service role, Stripe secret, Resend) explicit figyelmeztetés van erre. Ugyanezt a fegyelmet kell követni a Formbricks environment ID-jánál (ami *nyilvános* azonosító, tehát `NEXT_PUBLIC_` helyes rá) és egy esetleges API-kulcsnál (ami **nem** az).

---

## 3. Azonosított kockázatok és buktatók

### 3.1 SSR / Hidratáció

**Kockázat: alacsony, jól kezelhető.** A `@formbricks/js` SDK maga is `typeof window !== 'undefined'` védelemmel dolgozik, de Next.js App Routerben **nem elég csak erre hagyatkozni** — a `formbricks.setup()`/`init()` hívást egy `'use client'` komponens `useEffect`-jébe kell tenni (soha nem Server Componentben, soha nem a render törzsében). A React 19 + Next.js 15 kombináció ezt a mintát natívan támogatja.

**Megoldás:** egy dedikált, `'use client'` jelölésű wrapper-komponens (lásd a PoC kódot lent), amit a gyökér layoutban mountolunk. A tényleges SDK-t érdemes `next/dynamic`-kal, `{ ssr: false }` opcióval **lazy betölteni**, mert így (a) garantáltan sosem fut szerveren, és (b) a bundle csak akkor töltődik le a böngészőben, amikor ténylegesen szükség van rá — ez egyben a 3.5-ös teljesítmény-kockázatot is enyhíti.

### 3.2 Felhasználó-azonosítás és auth-állapot

**Kockázat: közepes — ez a legkritikusabb architekturális pont, mert a projektnek NINCS kliens-oldali auth-contextje.** Két életképes megoldás van:

1. **Route-csoportos szerver-oldali megoldás:** a védett oldalakat (`dashboard`, `inspections`, `settings`, `admin`) egy közös Next.js route-csoportba (`app/(app)/...`) szervezitek egy saját `layout.tsx`-szel, ami Server Componentként lekéri a usert (ugyanúgy, ahogy ma a `dashboard/page.tsx` teszi), és propként adja át egy kliens wrapper-nek. Ez a "helyes" architektúra, de **fájlmozgatással jár** (meglévő `app/dashboard/`, `app/inspections/`, `app/settings/`, `app/admin/` mappák route-csoportba költöztetése — az URL-eket ez nem változtatja meg, csak a mappastruktúrát).
2. **Minimál-diff megoldás (a PoC ezt követi):** a wrapper-komponens maga, kliensen, a már létező `lib/supabase/client.ts`-en keresztül `supabase.auth.onAuthStateChange()`-dzsel iratkozik fel — ez **automatikusan** megkapja a bejelentkezés/kijelentkezés eseményeket, user ID-t és emailt, **anélkül, hogy bármelyik oldalt vagy a `SignOutButton`-t módosítani kellene**. Ez a mai kódbázisba a legkevesebb ponton nyúl bele, cserébe egy plusz kliens-oldali Supabase-hívást indít minden oldalbetöltéskor (elhanyagolható overhead, mert a `createClient()` már amúgy is könnyű).

**Kijelentkezéskori "szivárgás" — kritikusan fontos, mert a projekt multi-tenant, RLS-re épülő rendszer (lásd PROJEKT_INSTRUKCIOK.md 3. pont):** ha nem hívjátok meg a `formbricks.logout()`/`reset()`-et kijelentkezéskor, egy megosztott gépen (pl. céges tablet a műhelyben, amit több Átvizsgáló használ egymás után) a **következő bejelentkező felhasználó nevében mehetnek ki korábbi visszajelzések**, vagy a Formbricks a régi user attribútumaival (email, szervezet) azonosítja az újat, amíg az `identify()` újra le nem fut. Az `onAuthStateChange` alapú megoldás ezt **szerkezetileg kizárja**, mert minden `SIGNED_OUT` eseményre automatikusan reset fut, minden `SIGNED_IN`-re pedig friss `identify()`.

**API-névstabilitás, amit implementáció előtt validálni kell:** a Formbricks SDK metódusnevei **verziók között változtak** (régebbi: `formbricks.setUserId()` / `setEmail()` / `setAttributes()` külön hívások; újabb: egységes `formbricks.identify(userId, attributes)`; a `setup()` és `init()` nevek is keverednek a különböző doksi-verziókban). **Implementáció előtt a ténylegesen telepített `@formbricks/js` verzió changelogját/típusdefinícióit kell megnézni** — a PoC kódban ezt jelöltem.

### 3.3 Kép-/fájlcsatolás

**Kockázat: magas, ha self-hosted útra mentek — ez a legnagyobb infrastrukturális buktató.**

- **Self-hosted Formbricks esetén az S3-kompatibilis tárhely NEM opcionális, hanem kötelező** a fájlfeltöltéshez (a hivatalos dokumentáció szó szerint "requires S3-compatible storage for file uploads" — helyi lemezes tárolás nincs támogatva). Ez azt jelenti, hogy egy self-hosted bevezetés esetén **vagy** egy külső S3-kompatibilis szolgáltatást (AWS S3, Cloudflare R2, DigitalOcean Spaces stb.) **vagy** a Formbricks által csomagolt, Dockerben futó RustFS komponenst kell üzemeltetni.
- **Érdekes szinergia-lehetőség:** a Supabase Storage maga is S3-kompatibilis API-t kínál (Project Settings → Storage → S3 Connection). Elméletileg ez a végpont beköthető a Formbricks `S3_ENDPOINT_URL`/`S3_ACCESS_KEY`/`S3_SECRET_KEY` változóiba, elkerülve egy teljesen új tárhely-szolgáltatás bevezetését — **ezt viszont nem dokumentálja hivatalosan sem a Formbricks, sem a Supabase**, tehát ez egy tesztelendő feltételezés, nem garantált kompatibilitás (különösen az esetleges path-style vs virtual-hosted-style URL-eltérések miatt, amit az `S3_FORCE_PATH_STYLE` flag hivatott kezelni).
- **Fájlméret/formátum-korlát:** a hivatalos dokumentáció **nem specifikál** kemény méret- vagy formátum-korlátot a self-hosted verzióban — ezt implementáció előtt élesben ki kell próbálni, és érdemes a frontend oldalon (a saját widget-trigger komponensben) egy explicit, felhasználóbarát méretkorlátot (pl. 5–10 MB/fájl) bevezetni, hogy ne a Formbricks szerver oldalán derüljön ki egy túl nagy videó/fotó feltöltésekor.
- **Formbricks Cloud esetén** ez a teljes kockázati kategória **eltűnik** — a fájlfeltöltés a menedzselt szolgáltatás része, nincs saját tárhelyet konfigurálni.

### 3.4 Hálózat, CORS és hosting-architektúra

- **Formbricks Cloud (app.formbricks.com) használata esetén** nincs CORS-konfigurációs teendő a ti oldalatokon — a widget egy külső, harmadik féltől származó domainre hív, ez böngésző-szempontból egy szabványos cross-origin `fetch`, amit a Formbricks szervere maga engedélyez.
- **Self-hosted, saját aldomainen** (pl. `feedback.carpass.hu`) futtatva a self-hosting dokumentáció explicit CORS-változót ad a fájltárhely-komponenshez (`RUSTFS_CORS_ALLOWED_ORIGINS`), de **nem tér ki részletesen a fő webalkalmazás CORS-listájára** — ezt a Docker-alapú telepítés `WEBAPP_URL`/`NEXTAUTH_URL` beállításai mellett külön validálni kell teszt-környezetben, mielőtt élesítenétek.
- **Reklámblokkolók (AdBlock/Privacy Badger/uBlock):** ez egy valós, gyakran alábecsült kockázat feedback-widgeteknél — sok blokkolólista domain-minta alapján (pl. "feedback", "survey", "widget" szavakat tartalmazó aldomainek, vagy konkrétan az `app.formbricks.com` domain) blokkolja az ilyen scripteket. **Gyakorlati következmény: a widget egy nem elhanyagolható kisebbségnél (elsősorban Chrome + adblock kombináció) egyszerűen nem fog betölteni**, függetlenül attól, hogy cloud vagy self-hosted verziót választotok. Mivel a feature "belső" (bejelentkezett, fizető B2B felhasználóknak szól, nem marketing-tracking), ez elsősorban UX-kockázat (néhány felhasználó nem fogja tudni használni a widgetet, hiba nélkül, csendben) — érdemes egy egyszerű fallback linket is elhelyezni ("Nem töltődik be? Írj nekünk: support@carpass.hu"), hogy blokkolás esetén se maradjon a felhasználó visszajelzési csatorna nélkül.
- **Szükséges környezeti változók (frontend, minimum, Cloud esetén):** `NEXT_PUBLIC_FORMBRICKS_ENVIRONMENT_ID`, `NEXT_PUBLIC_FORMBRICKS_API_HOST` (Cloud esetén fix `https://app.formbricks.com`, self-hosted esetén a saját aldomain).
- **Self-hosted esetén backend-oldali változók (nem kimerítő, gyorsan bővül verziónként):** `WEBAPP_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, adatbázis-kapcsolat, `S3_*` változók, és az újabb verziókban `HUB_API_KEY`/`HUB_API_URL`, `CUBEJS_API_SECRET` (beépített analitikai réteg) — ez a lista önmagában jelzi, hogy a self-hosted Formbricks **nem egy egyszerű Docker-konténer, hanem egy kis szolgáltatás-köteg** (web app + adatbázis + fájltárhely + Hub + Cube.js), ami rendszeres karbantartást (verziófrissítés, backup, monitoring) igényel — ezt a jelenlegi, teljesen menedzselt Vercel+Supabase üzemeltetési modell mellett érdemes komolyan mérlegelni.

### 3.5 UI, CSS, z-index és teljesítmény

- **Z-index ütközés a wizard mobil alsó sávjával (`InspectionWizard.tsx`, `z-50`, `fixed bottom-0`):** ha a Formbricks alapértelmezett widget-gombját (tipikusan jobb-alsó sarok) hagyjátok érvényesülni a `/inspections/new` és `/inspections/[id]` oldalakon, az átfedésbe kerülhet a wizard navigációs sávjával mobilon — pont azon a felületen, ami a termék UX-szempontból legkritikusabb (garázsban, telefonon kitöltött vizsgálat). **Javaslat (lásd 5. pont és PoC):** ne az alapértelmezett, mindenhol megjelenő lebegő gombot használjátok, hanem egy **saját, explicit trigger-elemet** (pl. egy "Hiba bejelentése / Javaslat" menüpont a `DashboardHeader`-ben vagy a `/settings` oldalon), ami kódból hívja meg a Formbricks felmérést (`formbricks.track('feedback_button_clicked')`) — így a widget vizuális megjelenése 100%-ban a ti Tailwind/Linear design-rendszeretek irányítása alatt marad, nincs saját CSS-injektálás/z-index-harc.
- **CSS-izoláció:** a Formbricks widget saját, beágyazott stílusokkal dolgozik (jellemzően Shadow DOM-mal vagy erősen scope-olt class-nevekkel a modernebb verziókban) — ez csökkenti, de nem garantáltan nullázza le a Tailwind-ütközés esélyét. Élesítés előtt vizuális regressziós ellenőrzés javasolt sötét témában is (a projekt `next-themes`-alapú dark módot használ a `/dashboard`, `/inspections/*` felületeken) — a Formbricks widget alapértelmezett világos témája esetleg nem illeszkedik a Linear design system sötét canvasához (`#010102`).
- **Bundle-méret / LCP-CLS hatás:** a hivatalos dokumentáció nem közöl pontos, verzió-szintű tömörített bundle-méretet — ezt élesítés előtt a böngésző Network fülén kell lemérni. A kockázat **nagyrészt eleve elhárítható**, mert a widget csak bejelentkezett felhasználóknak szól: ha a betöltést a 3.1 pontban leírt `next/dynamic({ ssr: false })` + útvonal-alapú feltétellel oldjátok meg, a script **egyáltalán nem töltődik le** a nyilvános, teljesítmény-kritikus oldalakon (`/`, `/login`, `/register`, és legfőképp a BMW design-rendszerű, ügyfeleknek szóló `/report/[public_token]`) — ott tehát nulla LCP/CLS hatása lesz.

### 3.6 Adatvédelem / GDPR

- A CarPass projektnek **már van** publikus adatkezelési tájékoztató oldala (`app/adatkezeles/page.tsx`) — a Formbricks bevezetése új **adatfeldolgozót** von be (a bejelentkezett Átvizsgáló neve/emailje, valamint a beküldött szöveges hiba-/javaslat-leírás és a csatolt képek eljutnak a Formbricks szerverére), ezt a tájékoztatót **bővíteni kell** egy új adatfeldolgozó-bejegyzéssel, függetlenül attól, hogy Cloud vagy self-hosted megoldást választotok.
- **Formbricks Cloud:** a hivatalos GDPR-oldal szerint az adatok titkosítva, Németországban (EU) tárolódnak, és kérésre DPA (adatfeldolgozói szerződés) köthető — ez a leginkább "plug and play" a magyar/EU-s B2B megfelelőség szempontjából.
- **Self-hosted:** teljes adat-szuverenitás (ti választjátok meg a szerver földrajzi helyét), ami erősebb GDPR-pozíciót ad, ha ez üzletileg fontos szempont (pl. ügyfél-szerződésben explicit adat-rezidencia követelmény van).
- **Amit a hivatalos dokumentáció NEM specifikált egyértelműen, és implementáció előtt külön validálni kell** (ezt őszintén jelzem, nem feltételezem): pontosan milyen automatikus metaadatot gyűjt a widget minden egyes eseménynél (pl. IP-cím naplózása spam-védelem céljából, user-agent/böngésző-attribútumok). Ezt érdemes közvetlenül a Formbricks támogatásától megkérdezni, vagy a böngésző Network füléből ellenőrizni implementáció közben, mielőtt az adatkezelési tájékoztató pontos szövegét megírjátok.
- **Sütik/consent:** mivel a widget kizárólag bejelentkezett, a szolgáltatást aktívan használó fizető felhasználóknak szól (nem marketing-célú, harmadik feles nyomkövetés az anonim látogatóknak), ez jogalap szempontjából jellemzően a szerződés teljesítése / jogos érdek (a szolgáltatás minőségének javítása) kategóriába esik, nem feltétlenül igényel külön cookie-consent bannert — de ez jogi kérdés, amit érdemes leellenőriztetni azzal, aki az adatkezelési tájékoztatót karbantartja.

---

## 4. Architekturális döntés: Formbricks Cloud vagy self-hosted?

| Szempont | Formbricks Cloud (ajánlott MVP-hez) | Self-hosted |
|---|---|---|
| Új infrastruktúra | Nincs | Docker-köteg (web + DB + S3 + Hub + Cube.js) — a projekt első saját üzemeltetésű backend-komponense |
| Fájlfeltöltés | Beépített, konfiguráció nélkül | Kötelező S3-kompatibilis tárhely beállítása |
| GDPR/adat-rezidencia | EU (Németország), DPA igényelhető | Teljes kontroll, saját választás |
| Karbantartási teher | Nulla | Verziófrissítés, backup, monitoring, biztonsági patch-elés |
| Bevezetési sebesség | Napok | Hetek (infra felállítás + tesztelés) |
| "Csak admin lássa" | Formbricks-projekt tagság kérdése — mindkét módon egyformán megoldható | ugyanaz |

**Javaslat:** kezdjétek a **Formbricks Cloud Hobby (ingyenes) csomagjával** — ez validálja a terméket (van-e valós használat, milyen visszajelzés-típusok jönnek be) infrastrukturális befektetés nélkül. Ha később konkrét üzleti/jogi indok merül fel (pl. egy nagyobb ügyfél szerződésben adat-rezidenciát követel meg), a self-hosted migráció a widget-integrációs kódot **nem** érinti — csak az `NEXT_PUBLIC_FORMBRICKS_API_HOST` env változót kell átírni a saját aldomainre, a frontend kód változatlan marad.

---

## 5. Részletes integrációs terv

1. **Formbricks Cloud fiók + "CarPass" projekt/environment létrehozása**, a válaszok láthatóságának korlátozása a szervezeten belül csak a saját (admin) fiókra. Environment ID kimásolása.
2. **Csomag telepítése:** `npm install @formbricks/js` (a `package.json`-ba kerül, jelenleg még nincs bent).
3. **Env változók bővítése** — `.env.local.example` + `.env.local`:
   - `NEXT_PUBLIC_FORMBRICKS_ENVIRONMENT_ID`
   - `NEXT_PUBLIC_FORMBRICKS_API_HOST` (`https://app.formbricks.com`)
   - Vercel Environment Variables között is be kell állítani (Production + Preview).
4. **Új fájl: `lib/formbricks/protectedPrefixes.ts`** — a `middleware.ts`-ben már létező `PROTECTED_PREFIXES` lista újrahasznosítása/kiemelése egy közös helyre, hogy a middleware és a Formbricks-provider ugyanabból a forrásból dolgozzon (ne kelljen két helyen karban tartani, melyik útvonal számít "bejelentkezett" felületnek).
5. **Új fájl: `components/feedback/FormbricksProvider.tsx`** — kliens komponens, `next/dynamic({ ssr: false })`-dal lazy-importálja a tényleges SDK-hívó logikát, `usePathname()`-nel csak védett útvonalakon aktiválódik, `supabase.auth.onAuthStateChange()`-dzsel azonosít/kijelentkeztet. (Teljes kód lent, 6. pont.)
6. **`app/layout.tsx` módosítása** — a `<FormbricksProvider />` bekerül az `<InsufficientCreditsProvider>` mellé, ugyanabba a mintába illesztve.
7. **Új fájl (opcionális, de ajánlott a 3.5-ös z-index-kockázat elkerülésére): `components/feedback/FeedbackTriggerButton.tsx`** — egy explicit "Hiba bejelentése" gomb/menüpont, ami kódból indítja a felmérést az alapértelmezett lebegő bubble helyett. Beillesztési pont: `DashboardHeader.tsx` (a "Beállítások" link mellé) vagy a `/settings` oldal egy új kártyája.
8. **Formbricks-oldali beállítás:** a felmérés (survey) "Action"-alapú indításra állítása (nem "Page view" automatikus trigger), a fenti `formbricks.track('feedback_button_clicked')` eseményhez kötve — ezzel a widget **sosem** jelenik meg magától, csak explicit felhasználói kattintásra, ami vizuálisan kiiktatja a lebegő gomb / wizard-alsó-sáv ütközési kockázatot.
9. **`app/adatkezeles/page.tsx` bővítése** egy új adatfeldolgozó-bejegyzéssel (Formbricks, cél: termék-visszajelzés gyűjtése, jogalap: jogos érdek/szerződés teljesítése, adat-rezidencia: EU/Németország).
10. **Manuális tesztkör élesítés előtt:** (a) kijelentkezés → új user bejelentkezés ugyanazon a böngészőn — nem szivároghat át a régi user identitása; (b) mobil Safari/Chrome a wizard aktív kitöltése közben — nincs vizuális átfedés; (c) sötét téma a `/dashboard`/`/inspections` felületeken; (d) adblock bekapcsolva — nincs JS hiba, csak csendes hiányzás; (e) fájlcsatolás teszt éles méretű fotóval/videóval.

---

## 6. Proof-of-Concept kód

> A metódusnevek (`setup`/`init`, `identify`/`setUserId`+`setEmail`+`setAttributes`, `logout`/`reset`) a Formbricks SDK verziói között változtak — **a telepítés pillanatában a ténylegesen bekerülő `@formbricks/js` verzió TypeScript-típusdefinícióival egyeztessétek** ezt a kódot (`node_modules/@formbricks/js/dist/index.d.ts`, vagy a csomag saját CHANGELOG-ja). A lenti kód a jelenlegi (2026 közepi) hivatalos minta alapján készült.

**`.env.local.example` bővítése:**

```bash
# Formbricks -- in-app visszajelzés/hibabejelentés widget (bejelentkezett felhasználóknak,
# lásd docs/formbricks-feedback-widget-elemzes-2026-08-20.md). Az Environment ID NEM titkos,
# ezért kaphat NEXT_PUBLIC_ előtagot -- a Formbricks Dashboard Settings -> Setup checklist
# oldaláról másolható ki.
NEXT_PUBLIC_FORMBRICKS_ENVIRONMENT_ID=xxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_FORMBRICKS_API_HOST=https://app.formbricks.com
```

**`lib/formbricks/protectedPrefixes.ts`** (közös forrás a middleware-rel, hogy ne kelljen két helyen karbantartani):

```ts
/**
 * Azok az útvonal-prefixek, ahol a felhasználó garantáltan bejelentkezett
 * (lásd lib/supabase/middleware.ts PROTECTED_PREFIXES -- innen emeltük ki
 * közös helyre, hogy a Formbricks-provider és a middleware ugyanabból a
 * listából dolgozzon).
 */
export const PROTECTED_PREFIXES = ['/dashboard', '/inspections', '/settings', '/admin'] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
```

*(Ezután `lib/supabase/middleware.ts`-ben is érdemes erre a közös konstansra átállni, hogy tényleg egyetlen forrás legyen.)*

**`components/feedback/FormbricksClient.tsx`** — a tényleges SDK-hívó logika, amit lazy-loadolunk:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const environmentId = process.env.NEXT_PUBLIC_FORMBRICKS_ENVIRONMENT_ID;
const apiHost = process.env.NEXT_PUBLIC_FORMBRICKS_API_HOST;

/**
 * Csak akkor mountolódik (lásd FormbricksProvider.tsx), amikor a pathname védett
 * útvonalon van -- tehát ez a komponens sosem fut a publikus landing/login/register/
 * riport oldalakon, a bundle-je sem töltődik le ott.
 */
export default function FormbricksClient() {
  const pathname = usePathname();
  const isInitialized = useRef(false);

  // 1) Egyszeri setup -- csak kliensen, csak egyszer.
  useEffect(() => {
    if (!environmentId || !apiHost) {
      console.warn('[Formbricks] Hiányzó NEXT_PUBLIC_FORMBRICKS_* env változó, a widget kikapcsolva.');
      return;
    }
    if (isInitialized.current) return;
    isInitialized.current = true;

    import('@formbricks/js').then(({ default: formbricks }) => {
      formbricks.setup({ environmentId, appUrl: apiHost });
      // Fontos: a jelenlegi user azonosítását NEM itt végezzük -- lásd lent, az
      // onAuthStateChange feliratkozás gondoskodik róla, hogy setup UTÁN azonnal
      // (és minden későbbi login/logout eseményre is) lefusson az identify/logout.
    });
  }, []);

  // 2) Auth-állapot követése -- mivel a projektnek nincs globális kliens-oldali auth
  // contextje (lásd az elemzés 3.2 pontját), közvetlenül a Supabase auth eseményeire
  // iratkozunk fel. Ez automatikusan lefedi: első betöltéskor meglévő session,
  // bejelentkezés, KIJELENTKEZÉS (kritikus multi-tenant biztonsági szempontból --
  // lásd 3.2 -- hogy a következő user ne az előző identitásával küldjön visszajelzést).
  useEffect(() => {
    const supabase = createClient();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      import('@formbricks/js').then(({ default: formbricks }) => {
        if (event === 'SIGNED_OUT') {
          formbricks.logout();
          return;
        }
        if (session?.user) {
          // A `role`/`organizationId` attribútum segíthet a Formbricks-oldali
          // szegmentálásban (pl. csak "manager" szerepkörnek induló felmérés) --
          // ha ez kell, egy kis kiegészítő supabase.from('profiles').select(...)
          // hívással bővíthető itt, jelenleg csak az alap identitást küldjük.
          formbricks.identify(session.user.id, {
            email: session.user.email ?? undefined,
          });
        }
      });
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // 3) Next.js App Router route-változás jelzése a Formbricksnek (a klasszikus
  // "page view" trigger továbbra is működjön, mert az App Router kliens-oldali
  // navigációja nem jár teljes oldalbetöltéssel).
  useEffect(() => {
    import('@formbricks/js').then(({ default: formbricks }) => {
      formbricks.registerRouteChange?.();
    });
  }, [pathname]);

  return null;
}
```

**`components/feedback/FormbricksProvider.tsx`** — a gyökér layoutba kerülő, útvonal-alapú kapcsoló:

```tsx
'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { isProtectedPath } from '@/lib/formbricks/protectedPrefixes';

// ssr:false -- lásd az elemzés 3.1 pontját: garantáltan sosem fut szerveren, és a
// @formbricks/js bundle csak akkor kerül a hálózati kérések közé, amikor ez a
// dinamikus import ténylegesen kiértékelődik (tehát védett útvonalon, bejelentkezve).
const FormbricksClient = dynamic(() => import('@/components/feedback/FormbricksClient'), {
  ssr: false,
});

/**
 * Mountold az app/layout.tsx-ben, az InsufficientCreditsProvider mellé.
 * Publikus oldalakon (/, /login, /register, /report/[public_token]) ez a komponens
 * `null`-t rendereld -- a Formbricks bundle-je le sem töltődik ott, tehát nulla
 * hatással van a nyilvános, ügyfeleknek szóló riport-oldal LCP/CLS-ére.
 */
export function FormbricksProvider() {
  const pathname = usePathname();
  if (!isProtectedPath(pathname)) return null;
  return <FormbricksClient />;
}
```

**`app/layout.tsx` diff (a meglévő fájlba illesztve):**

```tsx
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { InsufficientCreditsProvider } from '@/components/credits/InsufficientCreditsProvider';
import { FormbricksProvider } from '@/components/feedback/FormbricksProvider'; // ÚJ
import './globals.css';

// ...

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu" className={inter.variable} suppressHydrationWarning>
      <body className="font-sohne antialiased">
        <ThemeProvider>
          <InsufficientCreditsProvider>
            {children}
            <FormbricksProvider /> {/* ÚJ -- csak védett útvonalon aktiválódik */}
          </InsufficientCreditsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Opcionális: explicit trigger-gomb** a lebegő bubble kiváltására (lásd 3.5/5.7–5.8 pont), például a `DashboardHeader.tsx`-be illesztve a "Beállítások" link mellé:

```tsx
'use client';

import { MessageSquarePlus } from 'lucide-react';

/**
 * Explicit "Hiba bejelentése / Javaslat" akció -- a Formbricks-oldalon az adott
 * felmérést "Action-based" trigger-re kell állítani, erre az eseménynévre kötve.
 * Ez KIZÁRJA az alapértelmezett, automatikusan megjelenő lebegő gombot, tehát
 * nincs z-index-ütközés a wizard mobil alsó sávjával (lásd az elemzés 3.5 pontját).
 */
export function FeedbackTriggerButton() {
  function handleClick() {
    import('@formbricks/js').then(({ default: formbricks }) => {
      formbricks.track('feedback_button_clicked');
    });
  }

  return (
    <button
      onClick={handleClick}
      aria-label="Hiba bejelentése vagy javaslat küldése"
      className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-linear-ink-subtle transition-colors hover:bg-linear-surface-1 hover:text-linear-ink lg:h-8 lg:min-w-0 lg:justify-start lg:px-3"
    >
      <MessageSquarePlus className="h-4 w-4" />
      <span className="hidden lg:inline">Visszajelzés</span>
    </button>
  );
}
```

---

## 7. Nyitott kérdések implementáció előtt

- A `@formbricks/js` pontos, telepítéskor aktuális API-ja (metódusnevek) — ellenőrizendő a csomag típusdefinícióival.
- A widget által automatikusan gyűjtött metaadatok pontos köre (IP-napló, user-agent) — a Formbricks támogatásától vagy a Network fülről validálandó, mielőtt az adatkezelési tájékoztató végleges szövege megszületik.
- Supabase Storage S3-kompatibilis végpontjának tényleges kompatibilitása Formbricks self-hosted fájlfeltöltéssel (csak akkor releváns, ha később self-hosted útra váltotok) — nem dokumentált, tesztelendő feltételezés.
- Sötét téma vizuális illeszkedése a Linear design-rendszerhez (`/dashboard`, `/inspections/*`) — a Formbricks widget saját alapértelmezett témázása felülírásra szorulhat.
