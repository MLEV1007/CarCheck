# PROJEKT: CarPass SaaS (MVP)

## 1. A Projekt Célja
Egy modern, mobil-first B2B SaaS alkalmazás fejlesztése független autóvizsgáló szakemberek számára. A szoftver célja, hogy a helyszíni autóátvizsgálások dokumentációját (festékvastagság-mérés, hibák rögzítése fotókkal/videókkal, autó adatok) digitalizálja, és a manuális Word/Drive/Email folyamatot egy automatizált, interaktív, prémium ügyfélriporttá alakítsa.

## 2. Technológiai Stack
* **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, Shadcn/ui (UI komponensek).
* **Backend & Adatbázis:** Supabase (PostgreSQL adatbázis + Supabase Auth + Supabase Storage a képeknek/videóknak).
* **Hosting:** Vercel.
* **Tervezési elv:** Mobile-first (mivel a szakemberek telefonon/tableten használják a műhelyben/terepen).

## 3. Biztonság és Multi-Tenancy (Kritikus Szabályok!)
* A rendszerben több független autóvizsgáló cég fog regisztrálni.
* **RLS (Row-Level Security):** Minden adatbázis-táblán (`inspections`, `defects`, `paint_measurements` stb.) kötelezően engedélyezni kell az RLS-t!
* Minden táblának tartalmaznia kell a `user_id` oszlopot (amely a `auth.users`-re mutat).
* Garantálnod kell, hogy egy bejelentkezett felhasználó kizárólag a saját maga által létrehozott adatokat láthatja, szerkesztheti és törölheti. Adatszivárgás a bérlők között szigorúan TILTOTT.

## 4. UI/UX Design Rendszerek & Skillek (Szigorú Szabályok!)
A projektben 3 megadott dizájn-elemzés alapján kell dolgoznod. A felületeket a kontextusuknak megfelelően a megadott stílusban KÖTELEZŐ felépíteni:

### 4.1. Stripe Design System (`stripe.md`) -> Auth, Landing & Beállítások
* **Hol használod:** `/login`, `/register`, `/settings`, landing/árazás felületek.
* **Stílusjegyek:**
  * Színpaletta: Elektromos indigó (`#533afd`) fő CTA gombok, mély sötétkék (`#0d253d`) szövegek, tiszta fehér vagy alig színezett háttér (`#f6f9fc`).
  * Forma & Tipográfia: Lekerekített pill-gombok (`rounded-full`), `8px 16px` tömör padding, tiszta B2B SaaS elegancia.
  * Számok/Árak: Használj `tnum` (tabular figures) karakterformázást a pénzügyi és számbeli adatoknál.

### 4.2. Linear Design System (`linear.md`) -> Szakértői Munkaterület (App)
* **Hol használod:** `/dashboard`, `/inspections/*` (új vizsgálat indítása, adatok bevitele, fotófeltöltés).
* **Stílusjegyek:**
  * Színpaletta: Mély sötét/majdnem fekete háttér (`#010102`), sötétszürke kártyák (`#0f1011`), halvány levendula-kék (`#5e6ad2`) fókuszok és kiemelések. 1px-es finom hajszálvonal szegélyek (`#23252a`).
  * Forma & Tipográfia: Négyszögletes, enyhén lekerekített sarkok (`rounded-md` / `rounded-lg`), rendkívül tömör, funkcionális és profi fejlesztői/szoftveres érzetet keltő elrendezés.
  * Fókusz: Sötétben, garázsban, mobilon is könnyen olvasható, nagy kontrasztú adatbeviteli mezők.

### 4.3. BMW Corporate Design System (`bmw.md`) -> Publikus Ügyfélriport
* **Hol használod:** `/report/[public_token]` (A vásárló által megtekinthető nyilvános jelentés).
* **Stílusjegyek:**
  * Színpaletta: Világos/Fehér canvas (`#ffffff`), prémium sötétkék hero sávok (`#1a2129`), hivatalos BMW-kék (`#1c69d4`) akció színek.
  * Forma & Tipográfia: **SZIGORÚAN 0px lekerekítés (`rounded-none`)** az összes gombnál, kártyánál és elemnél! Mérnöki, precíz élek.
  * Tipográfia kontraszt: Drámai kontraszt a vastag (700-as súlyú) címsorok és a nagyon vékony (300-as Light súlyú) törzsszövegek között. B2B prémium német autóipari esztétika.

## 5. Az MVP Fő Funkciói és architektúrája

### A) Autentikáció & Profil (`/login`, `/register`, `/settings`)
* Regisztráció és Login Supabase Auth segítségével. [Stripe Design Style]
* Védett útvonalak middleware-rel (csak bejelentkezve érhető el a `/dashboard`).
* Beállítások oldal: a vizsgáló feltöltheti a saját céglogóját, nevét, telefonszámát és elsődleges márkaszínét.

### B) Szakértői Dashboard & Űrlap (`/dashboard`, `/inspections/new`)
* [Linear Dark Design Style]
* **Dashboard:** A saját korábbi vizsgálatok listázása, státuszok (Piszkozat / Befejezett), szűrés, "Új vizsgálat" gomb.
* **Lépésről lépésre űrlap (Wizard):**
  1. *Autó adatok:* Márka, modell, évjárat, alvázszám (VIN), rendszám, km óra állás.
  2. *Festékvastagság-mérés:* Karosszéria elemek listája értékmegadással (mikron).
  3. *Hibák & Média:* Hibák kategóriája, leírása + fotó/videó feltöltése közvetlenül a kameráról a Supabase Storage-ba.
  4. *Publikálás:* Titkosított egyedi link (`public_token`) generálása.

### C) Publikus Ügyfélriport (`/report/[public_token]`)
* [BMW Corporate Light Design Style - 0px rounded]
* **NEM IGÉNYEL BEJELENTKEZÉST.**
* Az autóbevizsgálást megrendelő vevő csak ezt a felületet látja a kapott egyedi linken keresztül.
* Gyönyörű, letisztult, interaktív elrendezés:
  * A vizsgálatot végző cég brandingje (logó + céges színek).
  * Autó összefoglaló kártya.
  * Karosszéria rétegvastagság-térkép (színkódolt: gyári / újrafújt / gittelt).
  * Hibák listája fotókkal, lejátszható videókkal.
  * PDF-ben való letöltés opció.

## 6. Fejlesztési Szabályok számodra (AI)
1. **Lépésről lépésre haladj!** Sose generálj egyszerre túl sok kódot. Mindig egy konkrét funkcióra vagy modulra fókuszálj.
2. Tiszta, moduláris TypeScript kódot írj Tailwind CSS osztályokkal.
3. Mindig tartsd be a megadott felülethez rendelt Design System előírásait (Stripe / Linear / BMW)!
4. Ha valami nem világos, tegyél fel tisztázó kérdéseket, mielőtt kódot írsz.
