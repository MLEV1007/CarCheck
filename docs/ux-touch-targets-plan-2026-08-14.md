# Terv: Érintési célterület (touch target) javítás a Linear munkaterületen

**Dátum:** 2026-08-14
**Kiváltó ok:** Fejlesztői UX-visszajelzés — az ikon-gombok mérete (28–32px) a HIG/Material minimum (44/48px) alatt van, ami "garázsban, terepen, telefonon" dolgozó szakembereknél mellé-koppintásokhoz vezet.
**Terjedelem:** Elsősorban a Linear design rendszerű Szakértői Munkaterület (`/dashboard`, `/inspections/*`), + 3 bónusz találat más felületeken.
**Státusz:** Tervezési fázis, implementáció nem indult.

---

## 1. A probléma pontosítása

### 1.1 Szabvány-referencia

| Szabvány | Minimum méret | Megjegyzés |
|---|---|---|
| Apple HIG | 44×44 pt | Ajánlott minimum minden érinthető elemre |
| Material Design 3 | 48×48 dp | A *vizuális* ikon lehet kisebb (pl. 24dp), a *érintési terület* nem |
| WCAG 2.2 — 2.5.8 (AA) | 24×24 CSS px | Jogilag kötelező minimum, ha nincs elég térköz a szomszédos elemekhez |
| WCAG 2.2 — 2.5.5 (AAA) | 44×44 CSS px | A HIG-gel megegyező, "best practice" szint |

A projekt céleszköze (telefon/tablet, terepen, néha kesztyűben, napfényben rossz kontraszttal) miatt a **44×44 CSS px AAA-szintet** vesszük célként, nem a WCAG AA minimumot — ez indokolt, mert a felhasználói kontextus (mozgó kéz, sietés, napfénytükröződés) pontosan azok a "korlátozó körülmények", amikre a WCAG AAA szint készült.

### 1.2 Kulcsfontosságú tervezési feszültség

A `linear.md` design-elemzés és a `PROJEKT_INSTRUKCIOK.md` explicit módon **"rendkívül tömör, funkcionális"** elrendezést ír elő a Linear munkaterületre. Ha minden ikon-gombot naívan 44×44px-re nagyítunk, az:

- vizuálisan összeütközik a Linear-esztétikával (a Linear.app maga is 24–32px-es vizuális gombokat használ, NEM 44px-eseket — ők is a hit-slop technikát alkalmazzák asztali/mobil webre),
- szűk helyeken (pl. `PaintCanvas` 200px széles popover) ténylegesen kifuthat a konténerből vagy átfedésbe kerülhet szomszédos elemekkel.

**Ezért a terv alapelve: a vizuális méretet és az érintési területet szét kell választani.** Ahol van hely (fejléc, 64px magas sáv), ott a tényleges dobozt is növeljük. Ahol nincs (popover, fotó-thumbnail sarok), ott egy láthatatlan, kibővített érintési zónát ("hit-slop") adunk a vizuálisan változatlan gomb köré.

### 1.3 Root cause

A kódbázisban **nincs egyetlen közös `IconButton` primitíva** — minden ikon-gomb egyedi, kézzel írt `className` string (pl. `closeButtonClass` lokális konstansként `DamageCanvas.tsx`-ben és `PaintCanvas.tsx`-ben, külön-külön definiálva). Emiatt:

1. a hiba szisztematikusan, sokszor kimásolva ismétlődik (pl. a "vissza" nyíl 4 fájlban van szó szerint duplikálva, a törölhető fotó-thumbnail mintázat 2 fájlban),
2. egy pontszerű javítás (csak `DamageCanvas.tsx`) nem oldja meg a rendszerszintű problémát — ahogy a visszajelzés is írja.

A tartós megoldás ezért **nem csak a talált 8 helyszín patch-elése**, hanem egy **közös primitíva bevezetése**, hogy jövőbeli új ikon-gombok ne örököljék újra a hibát.

---

## 2. Leltár — minden érintett helyszín

Az alábbi táblázat a teljes `components/` + `app/` fát lefedő grep-alapú bejárás eredménye (`h-6/h-7/h-8/h-9` + `w-6/w-7/w-8/w-9` kombinációk minden interaktív `<button>`/`<Link>`/`<a>` elemen). **8 mintázat-csoportba** rendezve (A–H), + 3 bónusz találat a Linear munkaterületen kívül.

### A) Mikrofon-gomb — `VoiceInputButton.tsx`

| | |
|---|---|
| **Fájl:sor** | `components/ui/VoiceInputButton.tsx:137` |
| **Jelenlegi méret** | `h-7 w-7` (28×28px), kör alakú |
| **Kontextus** | Textarea/input sarkába illesztett "addon" gomb (`StepDiagnostics.tsx`, `StepEquipment.tsx` diktálás-kártya, `DamageCanvas.tsx` leírás mező, `FormControls.tsx` `TextareaField`) |
| **Térbeli korlát** | Van hely — a szülő `flex items-center gap-1.5` sor nem szoros |
| **Technika** | Hit-slop (láthatatlan bővítés), mert a vizuális méret a diktálás-badge-ekkel (`Diktálás…`/`Simítás…` pill-ek) egy sorban él, és a vizuális arány felborulna nagyobb körrel |
| **Recept** | `relative` a `<button>`-re + `before:absolute before:-inset-2 before:content-['']` → 28px + 2×8px = 44px |

### B) Lista-elem törlés gombok (wizard sorok)

| Fájl:sor | Méret | Elem |
|---|---|---|
| `StepDiagnostics.tsx:84` | `h-8 w-8` | "Hibakód törlése" |
| `StepDefects.tsx:74` | `h-8 w-8` | Hiba törlése a listából |
| `StepServiceHistory.tsx:452` | `h-8 w-8` | "PDF megnyitása" link |
| `StepServiceHistory.tsx:461` | `h-8 w-8` | "PDF eltávolítása" |
| `StepServiceHistory.tsx:506` | `h-8 w-8` | "Bejegyzés törlése" |

**Kontextus:** vertikális listasorok, `flex items-center justify-between` mintázat, a sor jobb szélén. **Térbeli korlát:** minimális — a listasorok tipikusan `py-2`/`py-3`-mal magasabbak, mint 32px, van függőleges hely.
**Technika:** hit-slop. **Recept:** `h-8 w-8` (32px) → `before:-inset-1.5` (2×6px = 44px).
**Megjegyzés:** ez 5 db, gyakorlatilag azonos kódrészlet — jó jelölt arra, hogy egy közös `RowActionButton` komponensbe kerüljön.

### C) Fotó/média-előnézet sarok "eltávolítás" gombja

| Fájl:sor | Méret |
|---|---|
| `StepServiceHistory.tsx:380` | `h-6 w-6` (24px) |
| `components/inspections/wizard/DefectMediaUpload.tsx:43` | `h-6 w-6` (24px) |
| `StepGeneralPhotos.tsx:72` | `h-6 w-6` (24px) |

**Kontextus:** `absolute right-1.5 top-1.5` pozícióban, egy `relative aspect-square **overflow-hidden** rounded-md` thumbnail-konténer sarkában.

⚠️ **Kritikus technikai buktató:** a szülő konténeren `overflow-hidden` van (ez vágja körbe a képet a lekerekített sarkokhoz). Ha a hit-slopot egyszerű `before:-inset-*` pszeudo-elemmel oldjuk meg úgy, ahogy a fenti pontoknál, a `overflow-hidden` **levágja a konténer határain túlnyúló részt — a láthatatlan érintési terület nem fog működni**, mert a böngésző a klip-tartományon kívül eső részt sem rendereli, sem nem fogadja el kattintásként.

**Helyes megoldás:** a DOM-struktúra szétbontása:
1. külső `<div className="relative aspect-square rounded-md">` (overflow-hidden **NÉLKÜL**, csak `relative`),
2. belső `<div className="absolute inset-0 overflow-hidden rounded-md">` — ez tartalmazza csak a `<img>`-et, ez vágja körbe a lekerekített sarkot,
3. a törlés `<button>` a KÜLSŐ (nem vágott) konténer közvetlen gyereke, hogy a hit-slop pszeudo-eleme szabadon túlnyúlhasson a kép vizuális határán.

**Grid-ütközés ellenőrzés:** a rácsok `grid-cols-2 gap-3` (12px gap) mobilon. Egy 24px-es gomb `top-1.5 right-1.5` (6px behúzással) + 44px cél eléréséhez 2×10px hit-slop kell → 4px-cel nyúlik túl a cellahatáron a gap-be. Mivel a gap 12px, ez **biztonságos** (4px < 12px, nem ér át a szomszédos thumbnail saját hit-zónájába, ami a cella túlsó sarkában van). **QA-lépésként mindenképp vizuálisan ellenőrizni kell mobil nézetben, hogy a két szomszédos "X" gomb érintési zónája nem lóg egymásba.**
**Recept:** `h-6 w-6` → `before:-inset-2.5` (2×10px = 44px).
**DRY-megjegyzés:** ez a mintázat **szó szerint duplikálva** van `StepServiceHistory.tsx` és `StepGeneralPhotos.tsx` fájlokban (+ egy variánsa `DefectMediaUpload.tsx`-ben) — érdemes egy közös `RemovablePhotoThumbnail` komponensbe kiemelni, hogy a javítás egy helyen történjen, ne háromszor.

### D) `DamageCanvas` popup bezáró gomb

| | |
|---|---|
| **Fájl:sor** | `components/inspections/DamageCanvas.tsx:185` (osztály-definíció) / `:255` (a `<button>`) |
| **Jelenlegi méret** | `h-7 w-7` (28px) |
| **Kontextus** | `w-full max-w-sm rounded-lg border p-4` panel, `flex items-center justify-between` fejléc sorban a cím mellett |
| **Térbeli korlát** | Van hely — `p-4` (16px) padding van a panel szélén |
| **Technika** | Hit-slop, mert a panel `overflow-visible`-nek van jelölve a szülőn (`relative ... overflow-visible`), tehát a kibővített zóna nem vágódik le |
| **Recept** | `before:-inset-2` (2×8px = 44px) |

### E) `PaintCanvas` popup bezáró gomb — a legszűkebb eset

| | |
|---|---|
| **Fájl:sor** | `components/inspections/PaintCanvas.tsx:138` (osztály) / `:211` (a `<button>`) |
| **Jelenlegi méret** | `h-6 w-6` (24px) — a legkisebb az összes közül |
| **Kontextus** | `absolute z-30 w-[200px] max-w-[80vw] rounded-lg border p-3` popover, ami egy autó-képen elhelyezett méréspont mellett nyílik ki, dinamikus pozícióval (`popoverPositionClasses` — bal/jobb, fent/lent a ponthoz képest) |
| **Térbeli korlát** | Legszűkebb: 200px széles popover, `p-3` (12px) padding, a cím szöveg (`text-[12px]`) `gap-2`-vel van a gombtól |
| **Technika** | Hit-slop, **kisebb ráhagyással**, mert 200px-es popoverben a 44px-es teljes hit-zóna közel a cím szöveghez érhet |
| **Recept** | `h-6 w-6` (24px) → 2×10px hit-slop → **de** mivel a cím és a gomb között csak `gap-2` (8px) van, javasolt **aszimmetrikus** hit-slop: `before:-inset-y-2.5 before:-inset-x-2.5` helyett `before:[inset:-10px_-10px_-10px_-4px]` (jobb/felül/alul 10px, bal oldalon csak 4px), hogy a láthatatlan zóna ne nyúljon rá a cím szövegére. Ez az egyetlen hely, ahol NEM egyenletes hit-slopot javaslok. |
| **Megjegyzés** | Ha implementáció közben kiderül, hogy még ez is túl szoros, alternatíva: a popover `p-3`-at `p-2.5` + a cím sor `gap-2`-t `gap-3`-ra emelni, hogy legyen 2px extra puffer. |

### F) Fejléc "vissza" nyilak (4× duplikált kód)

| Fájl:sor |
|---|
| `components/inspections/detail/InspectionDetailView.tsx:214` |
| `app/admin/page.tsx:189` |
| `app/inspections/new/page.tsx:96` |
| `app/inspections/[id]/page.tsx:395` |

**Jelenlegi méret:** mind `h-8 w-8` (32px), `ArrowLeft h-4 w-4` ikonnal, `flex h-16 items-center gap-3` fejlécben.
**Kontextus:** a fejléc 64px magas (`h-16`), tehát 16px felesleges hely van felül-alul a gomb körül.
**Technika:** itt **javaslom a tényleges doboz növelését**, nem hit-slopot — mert (a) van rá szabad hely függőlegesen is, (b) ez egy önálló, semmivel nem szomszédos elem a fejléc bal szélén, (c) a 4 fájl amúgy is egyenként duplikált kódrészlet, tehát ez a legjobb alkalom egy közös `<BackButton />` komponens bevezetésére.
**Recept:** `h-8 w-8` → `h-11 w-11` (44×44px), az ikon marad `h-4 w-4` (nem nő az ikon, csak a klikkelhető doboz — vizuálisan majdnem ugyanaz, mert a `rounded-md` háttér csak `:hover`-en látszik).
**DRY-akció:** kiemelés egy `components/ui/BackLink.tsx` komponensbe, `href` és `label` propokkal — mind a 4 helyen ezt használni a duplikált `<Link className="inline-flex h-8 w-8 ...">` helyett.

### G) Fejléc "Beállítások" ikon mobil nézete

| | |
|---|---|
| **Fájl:sor** | `components/dashboard/DashboardHeader.tsx:70-76` |
| **Jelenlegi állapot** | `<Link>` `h-8` magas, `px-2` (mobil/tablet) vagy `px-3` (`lg:`) vízszintes padding; a `"Beállítások"` szöveges label `hidden lg:inline` — tehát **< 1024px szélességen (ami lefedi a projekt céleszközeit: telefon ÉS tablet is!) a link csak egy `Settings h-4 w-4` ikont mutat**, kb. 16(ikon) + 2×8(padding) ≈ 32×32px tényleges tap-boксz |
| **Kontextus** | `flex shrink-0 items-center gap-1.5 sm:gap-3` sor, `HeaderCreditBadge` és a `SignOutButton` társaságában |
| **Technika** | Tényleges doboz-növelés (van hely a 64px fejlécben), + a mobil/tablet nézetben `min-w-11 justify-center` hozzáadása, hogy az ikon-only állapotban is min. 44px széles legyen (jelenleg a szélesség a tartalomtól — az ikon + padding – függ, ami csak ~32px) |
| **Recept** | `className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 ..."` → `className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 ... lg:h-8 lg:min-w-0 lg:justify-start lg:px-3"` (a `h-11`/`min-w-11` csak breakpoint alatt aktív, `lg:`-nél visszaáll a kompakt 32px-es, szöveges verzióra, ahol már nincs ikon-only probléma) |

### H) Fejléc "Kijelentkezés" gomb mobil nézete (bónusz — a feedback nem nevesíti, de azonos hiba)

| | |
|---|---|
| **Fájl:sor** | `components/auth/SignOutButton.tsx:17-24` |
| **Jelenlegi állapot** | Szó szerint ugyanaz a mintázat, mint G): `h-8`, `px-2.5`/`lg:px-3`, `<span className="hidden lg:inline">Kijelentkezés</span>` |
| **Technika** | Ugyanaz, mint G) — `h-11 min-w-11 lg:h-8 lg:min-w-0` |
| **Megjegyzés** | Mivel a `DashboardHeader.tsx` és a `SignOutButton.tsx` közvetlenül egymás mellett van a fejlécben, **javaslom együtt javítani G-vel egy commitban**, hogy a fejléc jobb oldali sávja vizuálisan konzisztens maradjon (mindkét gomb egyszerre nő/csökken a breakpointon). |

---

## 3. Bónusz találatok (a Linear munkaterületen kívül, de érdemes egy körben kezelni)

Ezeket a feedback nem nevesíti explicit, de ugyanaz a hibaosztály, és az audit során előjöttek:

| Fájl:sor | Méret | Kontextus | Prioritás |
|---|---|---|---|
| `components/dashboard/InspectionActionsMenu.tsx:92` | `h-8 w-8` | Dashboard lista-sor "⋮" (kebab) menü trigger, `aria-haspopup="menu"` | **P1** — ugyanolyan gyakran használt terepi elem, mint a többi |
| `components/dashboard/PublishSuccessBanner.tsx:86` | `h-9 w-9` (36px) | Banner bezáró "X" | P2 — legközelebb van a 44px-hez, ritkán használt (egyszeri sikerbanner) |
| `components/report/ReportAiChat.tsx:140` | `h-8 w-8` | AI chat bezáró gomb a **publikus BMW riportban** (`/report/[public_token]`) | P2 — más célközönség (ügyfél, nem terepi szakember), de ha ő is telefonon nézi, ugyanúgy releváns; a BMW design (`rounded-none`) miatt itt a hit-slop pszeudo-elemet is `rounded-none`-nal kell definiálni, hogy stílustörés ne legyen (bár a pszeudo-elem amúgy sem látható, ez csak a konzisztencia kedvéért) |

---

## 4. Rendszerszintű megoldás — közös primitívák

A pontszerű patch-ek mellett **két új, újrafelhasználható darabot** vezetünk be, hogy a hiba ne térjen vissza legközelebb egy új ikon-gombnál.

### 4.1 `components/ui/IconButton.tsx` — közös ikon-gomb primitíva

```tsx
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Vizuális doboz mérete (px) — a tényleges <button> ekkora marad, az ikon a hívó fél
   * felelőssége (gyerekként adja át). Alapértelmezetten a Linear-mintázatokban használt
   * méretek. Az érintési terület MINDIG minimum 44x44px, a `size`-tól függetlenül --
   * lásd a `docs/ux-touch-targets-plan-2026-08-14.md` tervet. */
  size?: 24 | 28 | 32;
  variant?: 'ghost' | 'ghost-danger';
}

const SIZE_CLASS: Record<NonNullable<IconButtonProps['size']>, string> = {
  24: 'h-6 w-6',
  28: 'h-7 w-7',
  32: 'h-8 w-8',
};

// Minden mérethez a 44px cél eléréséhez szükséges szimmetrikus hit-slop (inset), lásd a
// terv 2. fejezetének "Recept" sorait -- (44 - méret) / 2, Tailwind spacing tokenre kerekítve.
const HIT_SLOP_CLASS: Record<NonNullable<IconButtonProps['size']>, string> = {
  24: 'before:-inset-2.5', // 24 + 2*10 = 44
  28: 'before:-inset-2',   // 28 + 2*8  = 44
  32: 'before:-inset-1.5', // 32 + 2*6  = 44
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = 32, variant = 'ghost', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'relative inline-flex shrink-0 items-center justify-center rounded-md transition-colors',
          'before:absolute before:content-[""]', // láthatatlan hit-slop pszeudo-elem
          SIZE_CLASS[size],
          HIT_SLOP_CLASS[size],
          variant === 'ghost' && 'text-linear-ink-subtle hover:bg-linear-surface-2 hover:text-linear-ink',
          variant === 'ghost-danger' && 'text-linear-ink-subtle hover:bg-linear-surface-2 hover:text-linear-danger',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
IconButton.displayName = 'IconButton';
```

**Miért `<button>` és nem `<Link>` is egyben?** A "vissza" nyilak `next/link`-et használnak — ehhez egy külön, de a hit-slop logikát megosztó `BackLink.tsx` készül (lásd F pont), ami a `Link`-re teszi ugyanazokat a Tailwind osztályokat.

### 4.2 `RemovablePhotoThumbnail.tsx` — a C) pontban talált 3× duplikált mintázat kiváltására

Props: `previewUrl`, `onRemove`, `alt?`. Belül a 2.C fejezetben leírt kétrétegű DOM-struktúrát (külső `relative`, belső `overflow-hidden` csak a képre) valósítja meg, plusz az `IconButton size={24}` variánst használja a törlés gombhoz.

### 4.3 Regressziós védőháló

A projektben jelenleg nincs automatizált teszt (`package.json`-ban csak `next lint` van). Egy egyszerű, build-be illeszthető Node-szkript javasolt (`scripts/check-touch-targets.mjs`), ami:

1. végigmegy a `components/**/*.tsx` és `app/**/*.tsx` fájlokon,
2. regex-szel megkeres minden `<button`/`<Link`/`<a` elemet, aminek a `className`-jében `h-6`/`h-7`/`h-8`/`h-9`/`w-6`/`w-7`/`w-8`/`w-9` szerepel,
3. ha a class-listában NINCS `before:-inset` VAGY nem az `IconButton`/`BackLink` komponensből származik, **hibával kilép** (nem 0-s exit code).

Ezt `npm run lint`-hez fűzve (vagy egy külön `npm run lint:touch-targets` script + CI lépésként) biztosítja, hogy egy jövőbeli új ikon-gomb ne csúszhasson be ugyanezzel a hibával — ez teszi a javítást ténylegesen **"atombiztossá"**, nem csak egyszeri patch-eléssé.

---

## 5. Migrációs sorrend (fázisokban, kockázat szerint)

| Fázis | Helyszínek | Indoklás |
|---|---|---|
| **1. Alapozás** | `IconButton.tsx` + `BackLink.tsx` + `RemovablePhotoThumbnail.tsx` létrehozása, egységesen tesztelve 1 helyen (pl. csak `DamageCanvas.tsx`) | Mielőtt 13 fájlt módosítunk, a primitíva helyességét egy izolált helyen validáljuk |
| **2. Legkritikusabb terepi elemek** | D) DamageCanvas close, E) PaintCanvas close, A) VoiceInputButton | Ezek a leggyakrabban használt elemek egy vizsgálat KÖZBEN (nem csak listázásnál) — itt a legnagyobb a valós ROI |
| **3. Lista-műveletek** | B) 5 db törlés-gomb, C) 3 db fotó-eltávolítás | Gyakori, de kevésbé idő-kritikus (nem menet közben, hanem adatbevitel után) |
| **4. Navigáció/fejléc** | F) 4 db vissza-nyíl (BackLink-re cserélve), G) Beállítások, H) Kijelentkezés, InspectionActionsMenu kebab | Alacsonyabb gyakoriságú, de a fejléc mindig látható, így szimbolikusan is fontos |
| **5. Bónusz/opcionális** | PublishSuccessBanner, ReportAiChat (BMW) | Külön ticket is lehet, más célközönség |
| **6. Védőháló** | `scripts/check-touch-targets.mjs` + `package.json` script bekötés | A legvégén, amikor már minden meglévő hely megfelel — így a szkript első futása zöld |

---

## 6. Tesztelési / verifikációs terv

1. **DevTools mobil emuláció (gyors kör minden fázis után):** Chrome DevTools → Device Toolbar → iPhone SE (a legkisebb gyakori célképernyő) és iPad (a `linear.md` "tableten kompakt" megjegyzése miatt) — vizuálisan ellenőrizni, hogy egyik gomb sem nőtt fel *látványosan* (a cél: az elrendezés majdnem ugyanúgy fest, mint most).
2. **Tényleges hit-terület mérés:** DevTools Elements panelben a `:before` pszeudo-elem box modelljét megnézni (Computed → Box model), és leellenőrizni, hogy a `content-box` szélesség/magasság ≥ 44px.
3. **Grid-ütközés QA (C pont):** a fotó-rácsoknál (`StepServiceHistory`, `StepGeneralPhotos`) mobil nézetben (2 oszlop) kézzel kipróbálni, hogy egy 2. oszlopbeli fotó "X" gombjára koppintva nem az 1. oszlopbeli fotó törlődik-e véletlenül (ez pontosan az a bug-osztály, amit a hit-slop rosszul méretezve okozhatna).
4. **Fizikai eszköz teszt:** legalább 1 valós telefonon (nem csak emulátoron), lehetőleg vékony kesztyűben vagy körömmel/ujjbeggyel gyors koppintásokkal — ez adja vissza legjobban az eredeti visszajelzés forgatókönyvét ("garázsban, siető kézzel").
5. **Vizuális regresszió a design-rendszerekre:** mivel 3 különböző design-rendszer (Linear/Stripe/BMW) érintett a bónusz körben, minden fázis után 1-1 screenshot összevetés (előtte/utána) a `linear.md`/`bmw.md` stílusjegyek (pl. BMW `rounded-none` szabály) sérülésének kizárására.
6. **`npm run lint` + `npm run build`** minden fázis végén — a projekt saját szabálya szerint (lásd korábbi feedback-memo) ezt egy szinkron bash hívásban kell futtatni, nem háttérben pollozva.
7. **Accessibility smoke-check:** mivel minden érintett gombon már ma is van `aria-label`, ez nem változik — de érdemes egy gyors axe DevTools futtatást tenni a "Target Size" (WCAG 2.5.8) szabályra, hogy objektíven is 0 találat legyen utána.

---

## 7. Elfogadási kritériumok (Definition of Done)

- [ ] Mind a 8 A–H mintázat + a 3 bónusz helyszín érintési területe méréssel igazoltan ≥ 44×44 CSS px mobil/tablet nézetben (< 1024px).
- [ ] Egyik érintett felület vizuális megjelenése sem tér el észrevehetően a jelenlegitől (a hit-slop technika miatt) — kivéve F) és G)/H), ahol tudatosan nő a tényleges doboz, de ez design-szempontból elfogadható (fejléc, van hely).
- [ ] A `DamageCanvas`/`PaintCanvas` popup közelében lévő szomszédos interaktív elemek (cím szöveg, mezők) között nincs átfedő hit-zóna.
- [ ] A fotó-rácsokban (2 oszlopos mobil nézet) szomszédos thumbnail törlés-gombjainak hit-zónája nem lóg egymásba.
- [ ] `IconButton`/`BackLink`/`RemovablePhotoThumbnail` primitívák léteznek és minden érintett helyen ezeket használjuk (nincs többé kézzel másolt `h-7 w-7 ...` string).
- [ ] `scripts/check-touch-targets.mjs` zöld a teljes kódbázison, és be van kötve a `npm run lint` folyamatba.
- [ ] `npm run build` és `npm run lint` hibamentes.
- [ ] Legalább 1 fizikai eszközös manuális teszt megtörtént és dokumentálva van (rövid jegyzet elég, screenshot/videó opcionális).

---

## 8. Becsült effort

| Fázis | Becsült idő |
|---|---|
| 1. Alapozás (primitívák + 1 validációs hely) | 1.5–2 óra |
| 2. Kritikus terepi elemek (3 hely) | 1 óra |
| 3. Lista-műveletek (8 hely, de ismétlődő minta) | 1.5 óra |
| 4. Navigáció/fejléc (6 hely, ebből 4 azonos) | 1 óra |
| 5. Bónusz (opcionális, külön ütemezhető) | 0.5–1 óra |
| 6. Védőháló szkript | 1 óra |
| Tesztelés/QA (végig, fázisonként elosztva) | 1.5–2 óra |
| **Összesen** | **≈ 8–9.5 óra** — ez igazolja a visszajelzés "közepes-nehéz" besorolását: nem egy 10 perces patch, de egy nap alatt, egy fejlesztővel, biztonságosan elvégezhető, mérhető ROI-val (kevesebb véletlen mellé-koppintás terepen). |

---

## 9. Nyitott kérdések / döntést igénylő pontok

1. **G/H fejléc-gombok mérete `lg:` felett:** a jelenlegi `h-8` (32px) marad-e asztali nézetben, vagy ott is érdemes 44px-re húzni konzisztencia kedvéért? *Javaslat: maradjon 32px asztalon — ott egérrel dolgoznak, a HIG/Material ajánlás kifejezetten érintőképernyős kontextusra vonatkozik.*
2. **`RemovablePhotoThumbnail` bevezetése** technikailag nagyobb refaktor (3 fájl DOM-struktúra átalakítása), mint egy sima class-csere — ha az idő szűkös, ez leválasztható külön ticketre, és a 3 helyen egyenként is megoldható a kétrétegű `overflow-hidden` trükk közös komponens nélkül (kicsit több duplikáció marad, de a touch-target hiba önmagában javítva lesz).
3. **Bónusz kör (7. fejezet) prioritása:** javaslom külön, kisebb PR-ként, hogy a fő (feedback által nevesített) kör gyorsan review-zható/mergelhető maradjon.
