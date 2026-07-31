# Státusz — Autó Állapotfelmérő SaaS (MVP)

_Utolsó frissítés: 2026-07-31 (Vizsgálat szerkesztő/részletező oldal `/inspections/[id]`)_

## Kész funkciók

### 1. Projekt alapok
- Next.js 15 (App Router) + TypeScript + Tailwind CSS + React 19.
- 3 design rendszer dokumentálva a gyökérben: `stripe.md`, `linear.md`, `bmw.md`.
- Supabase kliensek: `lib/supabase/client.ts` (böngésző), `lib/supabase/server.ts` (Server Component / Route Handler), `lib/supabase/middleware.ts` (session-frissítés + route-védelem `getClaims()`-szel).
- `middleware.ts`: `/dashboard`, `/inspections`, `/settings` védett; bejelentkezve `/login`, `/register` automatikusan `/dashboard`-ra irányít. A `/report/[public_token]` szándékosan NEM védett — publikus, bejelentkezés nélküli felület.

### 2. Autentikáció — Autóvizsgáló Partner Belépés & Regisztráció (`/login`, `/register`)
[Stripe Design Style]
- **Email + jelszó** bejelentkezés/regisztráció Supabase Auth-tal (`components/auth/LoginForm.tsx`, `RegisterForm.tsx`).
- **Google OAuth** gomb mindkét oldalon (`components/auth/GoogleAuthButton.tsx`) — `supabase.auth.signInWithOAuth({ provider: 'google' })`, hivatalos Google ikonnal, "VAGY EMAIL CÍMMEL" elválasztóval (`components/auth/AuthDivider.tsx`).
- Címsorok pontosítva: "Autóvizsgáló Partner Belépés" / "Autóvizsgáló Fiók Létrehozása", B2B alcímmel ("Kezeld a vizsgálataidat és generálj interaktív riportokat pillanatok alatt.").
- `AuthLayout.tsx`: központi fehér kártya, tompított gradiens-háló háttér (nem agresszív, `opacity-[0.14]`, `blur-[110px]`).
- Hibaüzenetek piros dobozban: hibás jelszó, foglalt email, lejárt/hibás megerősítő link, megszakadt Google bejelentkezés.
- `app/auth/callback/route.ts`: egységes route mind az email-megerősítéshez, mind a Google OAuth-hoz; hiba esetén `/login?error=oauth_failed` vagy `/login?error=confirmation_failed`.
- Sikeres belépés/regisztráció után automatikus redirect `/dashboard`-ra (vagy a `redirectTo` query paraméterre, ha védett oldalról lett kidobva a user).
- `components/auth/SignOutButton.tsx`: kijelentkezés.

**TODO ehhez a lépéshez (nem kód, hanem Supabase konfiguráció):**
- A Google provider-t be kell kapcsolni a Supabase Dashboardban (Authentication → Providers → Google), és be kell állítani a Google Cloud Console-ban létrehozott OAuth Client ID / Secret párost, valamint a redirect URI-t (`<supabase-project-url>/auth/v1/callback`).

### 3. Szakértői Dashboard (`/dashboard`)
[Linear Dark Design Style]
- Tailwind `linear-*` design tokenek felvéve (`tailwind.config.ts`) a `linear.md` alapján (canvas, surface-1/2/3, hairline, ink, primary, success).
- `components/dashboard/DashboardHeader.tsx`: cégnév/logó a `profiles` táblából (fallback: "Autó Állapotfelmérő"), link a `/settings`-hez, kijelentkezés (`SignOutButton`, `linear-*` tokenekkel).
- `components/dashboard/StatsBar.tsx`: 3 összegző kártya — összes / piszkozat / befejezett vizsgálat száma.
- `components/dashboard/InspectionsExplorer.tsx` (Client Component): keresőmező (kliens-oldali szűrés rendszám / alvázszám / márka / modell alapján), "+ Új vizsgálat indítása" gomb (`/inspections/new`), vizsgálatok listája (reszponzív táblázat-szerű lista, mobilon egy oszlopba rendeződik).
  - Piszkozat sorok: "Folytatás" gomb → `/inspections/[id]` (ez a route még nincs megépítve).
  - Befejezett sorok: "Riport" gomb (megnyitja `/report/[public_token]`-t új lapon) + "Link másolása" gomb (`navigator.clipboard`).
- `components/dashboard/StatusBadge.tsx`: Piszkozat (sárga) / Befejezett (zöld) jelvény.
- `components/dashboard/EmptyState.tsx`: ha a usernek nincs egyetlen vizsgálata sem.
- `app/dashboard/page.tsx`: Server Component, `supabase.auth.getUser()` + párhuzamos lekérdezés a `profiles` és `inspections` táblákra, mindkettő `user_id`/`id` szerint szűrve — az RLS policy-k (`auth.uid() = user_id`) ettől függetlenül is garantálják a bérlők közti izolációt.
- `components/dashboard/PublishSuccessBanner.tsx`: siker-banner a `/dashboard?published=<public_token>` query paraméter esetén (a wizard publikálás utáni redirectje állítja be) — link megnyitása új lapon + "Link másolása" gomb.

### 4. Új vizsgálat wizard (`/inspections/new`)
[Linear Dark Design Style]
- 4 lépéses, mobil-first wizard, teljesen kliens-oldali state-tel (`components/inspections/wizard/InspectionWizard.tsx`), a tényleges Supabase írás csak a 4. lépés két gombjánál történik.
- `StepIndicator.tsx`: kompakt lépés-jelző (pipa a kész lépéseken, lavender kitöltés az aktívon), mobilon csak a "X. lépés / 4 · cím" felirat látszik a címkék helyett.
- **1. lépés** (`StepCarInfo.tsx`): márka (datalist-tel javasolt márkanevek), modell, évjárat, VIN (nagybetűsítve), rendszám (nagybetűsítve), km óra állás. Kötelező: márka + rendszám.
- **2. lépés** (`StepPaintMeasurements.tsx`): 11 előre definiált karosszéria elem (`lib/inspections/constants.ts` `PAINT_PANELS`) mikron beviteli mezővel; `getPaintStatus()` automatikusan Gyári (0–160 µm, zöld) / Újrafújt (161–300 µm, sárga) / Gittelt-Sérült (300+ µm, piros) badge-et számol (`PaintStatusBadge.tsx`). Üresen hagyott elemek nem kerülnek mentésre.
- **3. lépés** (`StepDefects.tsx`): dinamikus "+ Új hiba rögzítése" kártyák -- kategória select (Motor / Váltó / Karosszéria / Beltér / Fék-Futómű / Egyéb), leírás textarea, `DefectMediaUpload.tsx` fotó/videó választó kliens-oldali előnézettel (object URL). A tényleges Storage-feltöltés csak a végleges mentéskor indul, hogy lépések közti navigáció ne generáljon felesleges hívást.
- **4. lépés** (`StepSummary.tsx`): áttekintő kártyák (autó adatok, kitöltött festékmérések, hibák thumbnaillel), hibaüzenet-sáv sikertelen mentésnél, két gomb:
  - **"Mentés piszkozatként"** → `status: 'draft'`, redirect `/dashboard`-ra.
  - **"Vizsgálat befejezése & Publikálás"** → `status: 'completed'`, redirect `/dashboard?published=<public_token>`-re (a `public_token`-t az `inspections` tábla `gen_random_uuid()` default-ja generálja).
- Mentési sorrend (`InspectionWizard.tsx` `handleSubmit`): kliens-oldalon előre generált `inspectionId` (`crypto.randomUUID()`) → `inspections` upsert → `paint_measurements` bulk insert (csak a kitöltött elemek) → hibánkénti média-feltöltés a `inspection-media` Storage bucket-be (`{user_id}/{inspectionId}/{uuid}-{fájlnév}` path, publikus URL) → `defects` bulk insert. Hiba esetén best-effort rollback (a három tábla soraink törlése `inspection_id`/`id` alapján), hogy a user hibaüzenet után duplikáció nélkül próbálhassa újra.
- Minden mentési lépés a bejelentkezett `user_id`-t írja be, amit az RLS policy-k (`auth.uid() = user_id`) függetlenül is kikényszerítenek — lásd PROJEKT_INSTRUKCIOK.md 3. pont.
- `app/inspections/new/page.tsx`: egyszerű fejléc ("← Vissza" a dashboardra + cím) + `InspectionWizard`.

### 5. Publikus Ügyfélriport (`/report/[public_token]`)
[BMW Corporate Design Style — 0px lekerekítés mindenhol]
- **Nem igényel bejelentkezést** — nincs a middleware `PROTECTED_PREFIXES` listáján. Adatlekérdezés kizárólag a `get_public_report(p_token uuid)` Postgres RPC-n (SECURITY DEFINER) keresztül, `supabase.rpc(...)`-vel — soha nem közvetlen tábla-lekérdezéssel (az RLS policy-k úgyis elutasítanák a bejelentkezés nélküli/idegen olvasást).
- `app/report/[public_token]/page.tsx`: Server Component, Next.js 15 async `params`. Ha az RPC hibát ad (pl. érvénytelen UUID formátumú token) vagy `null`-t (nem létező/törölt riport), a `ReportNotFound.tsx` letisztult 404 állapotot jelenít meg.
- `lib/reports/types.ts`: a `get_public_report` jsonb visszatérési struktúrájának TS típusai (`PublicReportData` = `inspection` + `paint_measurements[]` + `defects[]` + `company`).
- `components/report/ReportHeader.tsx`: cég branding (logó vagy monogram-fallback, telefonos/emailes elérhetőség) + "Nyomtatás / PDF" gomb (natív `window.print()`, `print:hidden`-nel eltűnik nyomtatáskor).
- `components/report/ReportHero.tsx`: sötétkék (`bg-bmw-surface-dark` #1a2129) hero sáv — márka+modell cím, vizsgálat dátuma, 4 speccel (évjárat, rendszám, VIN, km óra állás).
- `components/report/PaintMap.tsx`: karosszéria elemek rácsa a mikron-értékekkel, a wizardban már kiszámolt `status` (gyári/újrafújt/gittelt) alapján zöld/sárga/piros színkódolással + jelmagyarázat.
- `components/report/DefectsGallery.tsx` + `MediaLightbox.tsx`: hibák kategória szerint csoportosítva, fotó/videó thumbnaillel (kiterjesztés alapján `lib/reports/media.ts` `isVideoUrl()` dönti el fotó vagy videó), kattintásra kliens-oldali lightbox (Esc-re és háttérre kattintva zárható).
- `tailwind.config.ts`: felvéve a `bmw-*` design tokenek (primary #1c69d4, surface-dark #1a2129, semantic success/warning/error stb.) a `bmw.md` alapján, a stripe-*/linear-* mellé.
- `app/layout.tsx`: az Inter fontcsalád súlyai kibővítve `700`-zal (korábban csak 300/400/500 volt) a BMW design drámai bold/light kontrasztjához — visszafelé kompatibilis, a Stripe/Linear felületek nem törnek el.
- `app/globals.css`: `@media print` szabály (`print-color-adjust: exact`) hozzáadva, hogy a sötétkék hero sáv és a szín-kódolt festék-kártyák háttérszíne megmaradjon PDF exportnál/nyomtatáskor.

### 6. Cégbeállítások (`/settings`)
[Stripe Design Style]
- `app/settings/page.tsx`: Server Component, `auth.getUser()` + `profiles` sor lekérdezése (`company_name, phone, email, logo_url, primary_color`) az `auth.uid()`-ra épülő `profiles_select_own` RLS policy mögött. Fejléc: "← Dashboard" pill gomb + "Cégbeállítások" cím, fehér `top-nav`, `#f6f9fc` háttér a `<main>`-en.
- `components/settings/SettingsForm.tsx` (Client Component): a form minden mezője kliens-oldali state-ben él, a tényleges Supabase írás a "Módosítások mentése" gombra egyetlen `profiles.upsert({ id: userId, ... })` hívással történik (a `profiles_update_own` / `profiles_insert_own` RLS policy-k `auth.uid() = id` alapján védik).
  - Cég neve, céges telefonszám, céges email cím (`Input` komponens, alapértelmezett email: `profiles.email`, ha üres, akkor a regisztrált `auth.users.email`).
  - `components/settings/LogoUploader.tsx`: fájlválasztó gomb + meglévő logó előnézete. A feltöltés AZONNAL történik fájlválasztáskor (nem várja meg a mentés gombot) -- ugyanabba az `inspection-media` Storage bucket-be kerül, mint a hiba-fotók, a user saját mappájába (`{user_id}/logo/{uuid}.{ext}`), így a meglévő, a wizard hibajavításánál (lásd lent) már kikényszerített RLS policy-k (`(storage.foldername(name))[1] = auth.uid()`) további migráció nélkül védik. Kliens-oldali validáció: csak kép MIME-type, max 5 MB.
  - `components/settings/BrandColorPicker.tsx`: natív `<input type="color">` picker + szabadszöveges hex mező (`tabular-nums-stripe` osztállyal, a Stripe `tnum` előírás szerint) + 4 preset gomb (BMW kék `#1c69d4`, Elegáns fekete `#18181b`, Versenypiros `#da291c`, Profi zöld `#16a34a`). Érvénytelen hex esetén piros keret + hibaüzenet, de a mentést nem blokkolja kliens-oldalon (a `primary_color` egyszerű `text` oszlop, nincs DB-szintű formátum-kényszer).
  - `components/settings/SuccessToast.tsx`: zöld toast ("A cégbeállítások sikeresen frissültek!") sikeres mentés után, jobb felül, 4 másodperc után automatikusan eltűnik, kézzel is bezárható.
- **Dinamikus márkaszín a publikus riportban:** a `/report/[public_token]` (`app/report/[public_token]/page.tsx`) a `report.company.primary_color` értékét egyetlen `--report-accent` CSS változóba teszi a legfelső wrapper `style` attribútumán (fallback: BMW kék `#1c69d4`, ha a mező `null`/üres). Az akcentus-elemek ezt a változót olvassák `text-[var(--report-accent)]` / `bg-[var(--report-accent)]` / inline `style` formában, prop-drilling nélkül:
  - `SectionHeading.tsx` eyebrow szövegszíne.
  - `ReportHeader.tsx` logó-monogram háttérszíne (ha nincs feltöltve logó) + a "Nyomtatás / PDF" gomb hover keretszíne.
  - A `PaintMap.tsx` szín-kódolt gyári/újrafújt/gittelt jelvényei **szándékosan** megmaradtak a szemantikus zöld/sárga/piros BMW tokeneknél (`bmw-success`/`bmw-warning`/`bmw-error`) -- ezek státuszjelentést hordoznak, nem márka-akcentust, ezért nem a cég színét követik.

### 7. Vizsgálat szerkesztő / részletező oldal (`/inspections/[id]`)
[Linear Dark Design Style]
- `app/inspections/[id]/page.tsx`: Server Component. A vizsgálatot `.eq('id', id).eq('user_id', user.id).maybeSingle()`-lel kérdezi le -- ez az `inspections_select_own` RLS policy (`auth.uid() = user_id`) mellett egy explicit, defenzív második védelmi vonal (PROJEKT_INSTRUKCIOK.md 3. pont). Ha a sor `null` (nem létezik VAGY nem a bejelentkezett usert illeti -- a két esetet SZÁNDÉKOSAN nem különböztetjük meg kifelé), a `components/inspections/detail/InspectionNotFound.tsx` egységes "nem található / nincs jogosultság" állapotot mutatja.
- **Elágazás `inspection.status` alapján:**
  - **`draft`**: a meglévő `paint_measurements`/`defects` sorokat a `PAINT_PANELS`/`DefectState` formára alakítva előtölti az `InspectionWizard`-ot, és onnan folytatható a rögzítés/publikálás -- ugyanaz a wizard komponens, mint az `/inspections/new`-nél.
  - **`completed`**: `components/inspections/detail/InspectionDetailView.tsx` (Client Component) -- read-only szakértői adatlap (autó adatok, mérések `PaintStatusBadge`-dzsel, hibák média-thumbnaillel) + 3 akciógomb: "Publikus riport megtekintése" (`target="_blank"`), "Publikus link másolása" (`navigator.clipboard` + inline "Másolva" jelzés + felugró toast), "Visszaállítás piszkozatba / Szerkesztés" (`inspections.status` update `'draft'`-ra, majd `router.refresh()` -- ugyanez a Server Component ág mostantól a wizardot rendereli).
- **`InspectionWizard.tsx` kiegészítve szerkesztő módra** (opcionális `inspectionId`, `initialCarInfo`, `initialPaintMeasurements`, `initialDefects` propokkal -- ha nincsenek megadva, a viselkedés 1:1 megegyezik a korábbi `/inspections/new` flow-val):
  - A mentéskor (`handleSubmit`) a `paint_measurements`/`defects` gyerek-sorok mostantól előbb `DELETE ... WHERE inspection_id = ...`, majd újra `INSERT`-elődnek a jelenlegi state-ből -- új vizsgálatnál ez no-op törlés, szerkesztésnél biztonságosan felülírja a korábbi listát duplikáció nélkül (a wizard nem tart nyilván per-sor DB id-kat, csak kliens-oldali `clientId`-t).
  - **Kritikus hibakezelési változás:** a korábbi "hiba esetén töröljük az egészet" rollback KIZÁRÓLAG új vizsgálatnál fut le mostantól (`isEditMode` flaggel őrizve). Szerkesztésnél a rollback ki van kapcsolva, mert egy MEGLÉVŐ, korábban már elmentett vizsgálatnál a teljes törlés adatvesztést okozna egyetlen sikertelen mentési kísérlet miatt -- ehelyett csak hibaüzenetet kap a user, a korábbi adatok érintetlenek maradnak.
  - Létező hiba-média (már feltöltött Storage URL) nem töltődik fel újra mentéskor -- a `DefectState.previewUrl` `blob:` séma-ellenőrzésével dönti el a kód, hogy kliens-oldali új fájl-előnézetről (újra fel kell tölteni) vagy egy már létező távoli URL-ről (csak hivatkozni kell rá) van-e szó. `DefectMediaUpload.tsx` és `StepSummary.tsx` a videó/fotó megkülönböztetést is ugyanígy, `file` hiányában az URL kiterjesztéséből (`isVideoUrl`) végzi el létező média esetén.
- **`get_public_report` RPC megerősítve** (Supabase migráció, `nsejmkcwvksbwxscvrvb` projekt, `restrict_public_report_to_completed_status`): mostantól csak `status = 'completed'` vizsgálatot ad vissza a `public_token` alapján -- korábban BÁRMILYEN státuszú vizsgálatot visszaadott. Erre a "Visszaállítás piszkozatba" funkció miatt volt szükség: enélkül egy korábban kiküldött ügyfél-link élőben mutatta volna a vizsgáló által épp szerkesztés alatt álló, félkész adatokat. Piszkozat állapotban a link mostantól `ReportNotFound` 404-et mutat, amíg a vizsgáló újra nem publikálja.
- **Dashboard navigáció bekötve** (`components/dashboard/InspectionsExplorer.tsx`): az autó neve (teljes sor bal oldala) mostantól minden sorban `Link`-ként `/inspections/[id]`-re mutat; a piszkozat-soroknál a meglévő "Folytatás" gomb változatlanul, a befejezett soroknál egy új "Megtekintés" gomb (`Eye` ikon) is `/inspections/[id]`-re navigál, a "Riport" (`target="_blank"` a publikus oldalra) és "Link másolása" gombok változatlanul megmaradtak gyors-akcióként.

## Hibajavítások

### 2026-07-31: "new row violates row-level security policy" mentéskor (Storage feltöltés)
**Jelenség:** a `/inspections/new` wizard 4. lépésénél (Mentés piszkozatként / Publikálás) a fotó/videó feltöltés a Supabase Storage-ba `400`-as hibával elszállt, `"new row violates row-level security policy for table \"objects\""` postgres hibaüzenettel. A wizard ezután a best-effort rollback-jét futtatta (törölte a már beszúrt `inspections`/`paint_measurements`/`defects` sorokat), a usernek pedig hibaüzenetet mutatott.

**Gyökérok — NEM a frontend insert payload volt hibás.** Az `InspectionWizard.tsx` `handleSubmit` függvénye már eddig is helyesen küldte a `user_id: user.id` mezőt mind a három tábla (`inspections`, `paint_measurements`, `defects`) minden beszúrásához, és az élő adatbázisban az RLS policy-k (`auth.uid() = user_id`, `WITH CHECK` is jelen) is helyesek voltak mindhárom táblán.

A tényleges hiba a **Supabase Storage `inspection-media` bucket `storage.objects` tábláján hiányzó SELECT RLS policy** volt. A bucket csak INSERT/UPDATE/DELETE policy-kkal rendelkezett, SELECT policy nélkül. A Supabase Storage API a feltöltéskor belsőleg egy `INSERT ... RETURNING`-ot futtat, hogy visszaadja a létrehozott objektum metaadatait — ehhez viszont a beszúrt sor **SELECT-láthatósága** is kell (Postgres RLS: a `RETURNING` klauzula a SELECT policy-t is kikényszeríti). SELECT policy hiányában minden feltöltés RLS hibával bukott, függetlenül attól, hogy az INSERT policy önmagában helyes volt. (Éles adatbázison, tranzakcióban `SET LOCAL ROLE authenticated` + `request.jwt.claims` szimulációval reprodukálva és igazolva: `RETURNING` nélkül az insert sikeres volt, `RETURNING`-gal RLS hibát dobott — pontosan a megfigyelt hibaüzenettel.)

**Javítás (Supabase migrációk, `nsejmkcwvksbwxscvrvb` projekt):**
1. `add_inspection_media_authenticated_select_policy` — hozzáadva egy SELECT policy a `storage.objects`-hez.
2. `scope_inspection_media_policies_to_owner_folder` — a 4 policy-t (SELECT/INSERT/UPDATE/DELETE) szigorítottam: a korábbi verzió bármely bejelentkezett usernek engedte bármely másik user mappájában lévő fájlok írását/olvasását/törlését (csak a `bucket_id = 'inspection-media'` feltételt nézte) — ez ellentétes a projekt 3. pontjában rögzített szigorú multi-tenant izolációval. Az új policy-k a feltöltési útvonal (`{user_id}/{inspectionId}/{fájlnév}`) első szegmensét (`(storage.foldername(name))[1]`) `auth.uid()`-hoz kötik, így egy user csak a saját mappájában lévő objektumokat láthatja/írhatja/törölheti.

**Ellenőrzés:** éles DB-n, tranzakción belüli szimulációval igazolva mindkét irányban — saját mappába való feltöltés sikeres, másik user mappájába való feltöltési kísérlet RLS hibával elutasítva. `get_advisors` (security) újrafuttatva: nincs új figyelmeztetés.

**Következtetés a jövőre:** a `"new row violates row-level security policy"` hiba a `storage.objects` táblánál nem feltétlenül jelenti azt, hogy az INSERT/WITH CHECK policy hibás — hiányzó SELECT policy is pontosan ugyanezt az üzenetet adja, mert a Storage API `RETURNING`-ot használ.

## Verziókezelés
- GitHub repó: `https://github.com/MLEV1007/CarCheck` (`main` ág).
- A `/report/[public_token]` oldalt és a Storage RLS javítást tartalmazó commit (`71e3f01`), valamint a `/settings` + dinamikus riport-branding commit (`ad12ac4`) push-olva a `main`-re.
- A `/inspections/[id]` szerkesztő/részletező oldalt tartalmazó módosítások lokálisan commitolva vannak, de **NINCSENEK pusholva** -- lásd a "Következő lépés" pontnál a részleteket.
- `test images/` mappa (helyi teszt-fotók a fájlfeltöltés kézi teszteléséhez) szándékosan NINCS commitolva/pusholva — nem projekt-fájl, csak lokális teszt-adat.
- **Ismert sandbox-korlátozás:** a `git`-et futtató homokozó és a felhasználó Mac-jén lévő `CarCheck` mappa közötti FUSE-mount nem engedélyez `unlink` szisz­témhívást (a `git commit` belső lock-fájljainak/temp objektumainak törlése "Operation not permitted" hibával elszáll) -- viszont `rename`/`mv` működik rajta. Ha egy jövőbeli `git` parancs `Unable to create '.../index.lock': File exists` hibával áll le, a megoldás: `mv .git/index.lock .git/index.lock.bak<N>` (NEM `rm`), utána a parancs újra lefuttatható. A `git push` ebben a sandboxban emellett hitelesítés nélkül fut (`git config` nem tartalmaz tárolt GitHub credential-t, nincs `GITHUB_TOKEN` env változó) -- a push mindig manuálisan, a felhasználó saját gépéről/termináljából szükséges, amíg nincs beállítva egy credential helper vagy PAT.

## Ellenőrzés
- `npx tsc --noEmit` — hibamentes (legutóbb ellenőrizve a `/inspections/[id]` oldal elkészülte után).
- Supabase security advisor (`get_advisors`, `nsejmkcwvksbwxscvrvb` projekt) — újrafuttatva a `get_public_report` RPC megerősítése után, nincs új figyelmeztetés (a 3 ismert WARN változatlan, lásd lent).
- Adatbázis séma + RLS policy-k élesben ellenőrizve (`list_tables`/`pg_policies`, `nsejmkcwvksbwxscvrvb`): az `inspections`/`paint_measurements`/`defects` táblák mindegyikén megvolt már a teljes SELECT/INSERT/UPDATE/DELETE RLS policy-készlet (`auth.uid() = user_id`) -- a wizard szerkesztő-módú DELETE+INSERT logikájához és a "Visszaállítás piszkozatba" UPDATE-jéhez nem kellett új migráció, csak a `get_public_report` RPC-hez (lásd fent, `restrict_public_report_to_completed_status`).
- ESLint jelenleg nem futtatható a projektben (nincs `.eslintrc` konfiguráció felvéve) — ez korábbi lépések óta ismert hiányosság, nem az egyes lépésekhez kötődik.
- Éles `next build` a szinkronizált projektmappában nem futtatható a sandboxból (fájltulajdonosi jogosultság — a felhasználó gépén fut egy élő `next dev` szerver ugyanerre a mappára), ezért a típusellenőrzés + kód-review + élő séma-ellenőrzés + Supabase advisor adja a validációt.

## Ismert, szándékosan nyitva hagyott TODO-k
- `get_public_report` SECURITY DEFINER függvény `anon`/`authenticated` által futtatható (Supabase advisor warning) — szándékos, ez a publikus riport oldal alapja; a függvény 2026-07-31 óta explicit `status = 'completed'` szűrést is tartalmaz, úgyhogy piszkozat állapotú vizsgálat adatait már nem szivárogtathatja a `public_token`-en keresztül sem.
- Leaked password protection (HaveIBeenPwned ellenőrzés) ki van kapcsolva Supabase Auth-ban — bekapcsolása Supabase Dashboard beállítás, nem kód.
- A wizard szerkesztő-módú mentése (`InspectionWizard.tsx`) a `paint_measurements`/`defects` gyerek-sorokat minden mentéskor törli és újra beszúrja -- ez funkcionálisan helyes és duplikáció-mentes, de a törölt/lecserélt hiba-médiák Storage-objektumai (`inspection-media` bucket) NEM törlődnek automatikusan, csak a rájuk mutató DB-sor szűnik meg. Hosszabb távon érdemes egy takarító job/RPC-t építeni az árva Storage-objektumok ellen -- MVP-szinten nem blokkoló, mert a bucket mérete egyelőre elhanyagolható.

## Következő lépés
- **Push a `/inspections/[id]` commit-nak:** a legutóbbi commit ("feat: /inspections/[id] edit & detail page") csak lokálisan létezik a felhasználó gépén (a sandbox nem tud hitelesíteni a GitHub felé) -- fusd le `git push`-t a saját terminálodból/Git klienseddel a `CarCheck` mappában, hogy a `main` ág naprakész legyen.
- Kézi funkcionális teszt élesben: piszkozat folytatása meglévő méréssel/hibával (média nem töltődik fel újra feleslegesen), publikálás utáni "Visszaállítás piszkozatba" -> a publikus link tényleg 404-et mutat-e utána, majd újra-publikálás után helyreáll-e.
- Logó feltöltés (nagy/hibás fájl elutasítása is), márkaszín mentése és megjelenése a `/report/[public_token]` oldalon, `email` mező mentése a `profiles` táblába -- a `/settings` lépésből maradt kézi tesztek, még nem futtattuk le élesben.
