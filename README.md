# CarPass SaaS -- MVP alapok

Ez a csomag a projekt **első lépését** tartalmazza: Next.js 14+ App Router projektstruktúra,
Supabase SSR integráció, védett route-ok middleware-rel, valamint a `/login` és `/register`
oldalak a **Stripe design system** (`stripe.md`) alapján.

## Mi készült el ebben a lépésben

- Next.js 14+ (App Router) + TypeScript + Tailwind CSS alapstruktúra
- Supabase kliensek: böngésző (`lib/supabase/client.ts`), szerver (`lib/supabase/server.ts`)
- `middleware.ts` + `lib/supabase/middleware.ts`: session frissítés minden requesten,
  és route-védelem a `/dashboard`, `/inspections`, `/settings` előtagokra
- `/login` és `/register` oldalak, Stripe stílusban (indigó pill-gombok, gradiens-háló, `Sohne`
  helyett `Inter` betűtípus negatív tracking-gel)
- `/auth/callback` route handler az email-megerősítő linkekhez
- Egy ideiglenes `/dashboard` placeholder oldal, hogy végig lehessen tesztelni a teljes
  bejelentkezési folyamatot (ez **nem** a végleges Linear-stílusú munkaterület)

## Amit még NEM tartalmaz (következő lépések)

- Adatbázis séma + RLS policy-k (`inspections`, `defects`, `paint_measurements`)
- A tényleges Linear-stílusú dashboard és vizsgálati wizard
- A BMW-stílusú publikus ügyfélriport (`/report/[public_token]`)
- Beállítások oldal (céglogó, márkaszín feltöltése)

## Telepítés

```bash
npm install
```

## Supabase projekt beállítása

1. Hozz létre egy projektet a [supabase.com](https://supabase.com) oldalon.
2. Project Settings -> API -> Connect (Frameworks tab) alatt találod a Project URL-t és a
   Publishable key-t.
3. Másold le a `.env.local.example` fájlt `.env.local` néven, és töltsd ki:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx
```

> Ha a projekted a régebbi "anon key"-t használja (JWT-alapú, `eyJ...`-vel kezdődik), azt is
> nyugodtan beteheted ugyanebbe a változóba -- a `@supabase/ssr` mindkettőt elfogadja.

4. Auth -> URL Configuration alatt add hozzá a redirect URL-ek közé:
   `http://localhost:3000/auth/callback` (élesben a saját domained megfelelő változatát).

## Fejlesztői szerver indítása

```bash
npm run dev
```

Nyisd meg a [http://localhost:3000](http://localhost:3000) címet -- ez automatikusan a
`/login` oldalra irányít, ha nem vagy bejelentkezve.

## Tesztelés

1. Regisztrálj a `/register` oldalon egy valós email címmel.
2. Ha a Supabase projektedben be van kapcsolva az email-megerősítés (alapértelmezett), nézd meg
   a postafiókodat, és kattints a megerősítő linkre -- ez visszavisz az appba, és bejelentkeztet.
3. Ha ki van kapcsolva a megerősítés (Auth -> Providers -> Email -> "Confirm email" kikapcsolva),
   a regisztráció után azonnal a `/dashboard`-ra kerülsz.
4. Próbáld meg bejelentkezés nélkül elérni a `/dashboard`-ot egy inkognitó ablakban -- a
   middleware-nek vissza kell irányítania a `/login`-ra.

## Design tokenek

A `tailwind.config.ts`-ben a `stripe.*` névtér alatt találod a Stripe design tokeneket
(pl. `bg-stripe-primary`, `text-stripe-ink-mute`, `rounded-stripe-lg`). Amikor elkészül a
Linear-stílusú dashboard és a BMW-stílusú publikus riport, célszerű azoknak is saját névteret
nyitni (`linear.*`, `bmw.*`), hogy a három design system tokenjei ne keveredjenek egy globális
`primary`/`ink` néven.
