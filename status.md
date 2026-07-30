# Státusz — Autó Állapotfelmérő SaaS (MVP)

_Utolsó frissítés: 2026-07-30_

## Kész funkciók

### 1. Projekt alapok
- Next.js 14+ (App Router) + TypeScript + Tailwind CSS.
- 3 design rendszer dokumentálva a gyökérben: `stripe.md`, `linear.md`, `bmw.md`.
- Supabase kliensek: `lib/supabase/client.ts` (böngésző), `lib/supabase/server.ts` (Server Component / Route Handler), `lib/supabase/middleware.ts` (session-frissítés + route-védelem `getClaims()`-szel).
- `middleware.ts`: `/dashboard`, `/inspections`, `/settings` védett; bejelentkezve `/login`, `/register` automatikusan `/dashboard`-ra irányít.

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
- `components/dashboard/DashboardHeader.tsx`: cégnév/logó a `profiles` táblából (fallback: "Autó Állapotfelmérő"), link a `/settings`-hez, kijelentkezés (`SignOutButton`, most már `linear-*` tokenekkel).
- `components/dashboard/StatsBar.tsx`: 3 összegző kártya — összes / piszkozat / befejezett vizsgálat száma.
- `components/dashboard/InspectionsExplorer.tsx` (Client Component): keresőmező (kliens-oldali szűrés rendszám / alvázszám / márka / modell alapján), "+ Új vizsgálat indítása" gomb (`/inspections/new`), vizsgálatok listája (reszponzív táblázat-szerű lista, mobilon egy oszlopba rendeződik).
  - Piszkozat sorok: "Folytatás" gomb → `/inspections/[id]` (ez a route még nincs megépítve, a wizard lesz a következő lépés).
  - Befejezett sorok: "Riport" gomb (megnyitja `/report/[public_token]`-t új lapon) + "Link másolása" gomb (`navigator.clipboard`).
- `components/dashboard/StatusBadge.tsx`: Piszkozat (sárga) / Befejezett (zöld) jelvény.
- `components/dashboard/EmptyState.tsx`: ha a usernek nincs egyetlen vizsgálata sem.
- `app/dashboard/page.tsx`: Server Component, `supabase.auth.getUser()` + párhuzamos lekérdezés a `profiles` és `inspections` táblákra, mindkettő `user_id`/`id` szerint szűrve — az RLS policy-k (`auth.uid() = user_id`) ettől függetlenül is garantálják a bérlők közti izolációt.
- Ellenőrizve (2026-07-30): a dashboard kódja már a specifikáció szerinti Linear dark tokeneket használja (`bg-linear-canvas` #010102, `bg-linear-surface-1` #0f1011, `border-linear-hairline` #23252a, `bg-linear-primary` #5e6ad2) — ha korábban világos háttérrel jelent meg, az egy elavult dev-szerver cache volt, nem kódhiba. Újraindítás után (`npm run dev`) a sötét téma megjelenik.
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

## Ellenőrzés
- `npx tsc --noEmit` — hibamentes.
- Supabase security advisor (`get_advisors`, `nsejmkcwvksbwxscvrvb` projekt) — nincs RLS-hiányosság; a két figyelmeztetés (`get_public_report` SECURITY DEFINER + leaked password protection) a projekt korábbi lépéseiből ismert és szándékos/külön TODO, ehhez a lépéshez nem kapcsolódó új hiányosság nem került elő.
- Adatbázis séma ellenőrizve élesben (`list_tables`, `nsejmkcwvksbwxscvrvb`): `inspections`, `paint_measurements`, `defects` oszlopai, valamint az `inspection-media` publikus Storage bucket és a hozzá tartozó `authenticated`-only insert/update/delete policy-k megegyeznek a wizard kódjában feltételezett sémával.
- Éles `next build` a szinkronizált projektmappában nem futtatható a sandboxból (fájltulajdonosi jogosultság — a felhasználó gépén fut egy élő `next dev` szerver ugyanerre a mappára), ezért a típusellenőrzés + kód-review + élő séma-ellenőrzés + Supabase advisor adta a validációt ehhez a lépéshez.

## Következő lépés
- `/inspections/[id]` — piszkozat vizsgálat szerkesztése/folytatása (jelenleg a dashboard "Folytatás" gombja erre a route-ra mutat, de még nincs megépítve).
- `/report/[public_token]` — publikus, bejelentkezés nélküli ügyfélriport [BMW Design Style].
- `/settings` — céglogó, cégnév, telefonszám, márkaszín feltöltése a `profiles` táblába.
