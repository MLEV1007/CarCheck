# TERV — "AI hiba-felismerés fotóból" a Hibák és Média wizard-lépéshez (`StepDefects.tsx`)

_Ez egy FEJLESZTÉSI UTASÍTÁS/SPEC egy jövőbeli implementációs lépéshez, a `PLAN_ai_report_chat.md` konvenciója szerint. A felhasználó explicit kérése (2026-08-16): "készíts egy tervet ennek a funkciónak a lefejlesztésére... nagyon fontos, hogy az AI nem adhat téves válaszokat" — ez a fájl a tényleges fejlesztés indulásakor követendő. MÉG NINCS MEGVALÓSÍTVA._

## 1. Cél

A `StepDefects.tsx` (Hibák és Média rögzítése) jelenleg a wizard EGYETLEN fotó-alapú lépése, ahol nincs AI-szkennelés — a szakértő minden hiba-kártyánál kézzel választ kategóriát (`DEFECT_CATEGORIES`) és gépeli/diktálja a leírást. Ez a leggyakrabban, legtöbbször ismételt kézi művelet a teljes wizardban (jellemzően 3-10 hiba/vizsgálat).

Az új `/api/ai/scan-defect` route ugyanazt a Gemini Vision architektúrát követi, mint a már bevált `scan-vin`/`scan-service-doc` route-ok: a szakértő lefotózza a hibát, az AI **javaslatot** ad kategóriára + megír egy rövid, tényszerű vázlat-leírást, amit a szakértő egy kattintással elfogad (és a mezőkbe kerül, onnantól szabadon szerkeszthető) vagy elvet.

**Amit ez a funkció EXPLICITEN NEM csinál (v1 hatókör-korlátozás, lásd 3. pont):** nem ad műszaki diagnózist, nem ad javítási javaslatot, nem ad költségbecslést, nem ad numerikus súlyossági pontszámot, és nem tölt ki semmit automatikusan felhasználói jóváhagyás nélkül.

## 2. Kire vonatkozik

- A `StepDefects.tsx` minden hiba-kártyáján megjelenik, miután a szakértő fotót/videót választott a `DefectMediaUpload`-ban (videónál a gomb NEM jelenik meg — lásd 4.1).
- Ugyanabba az "1 AI kredit = 1 vizsgálat" keretbe tartozik, mint a másik 5 AI-funkció (`lib/inspectionAiCredit.ts`), `featureName: 'defect_scan'`.

## 3. A HALLUCINÁCIÓ ELLENI VÉDELEM — ez a terv magja

A felhasználó kifejezett kérése alapján ez a szakasz a legfontosabb, és minden más döntést ennek kell alárendelni. A kockázat itt lényegesen nagyobb, mint a meglévő 5 route-nál, mert:
- a `scan-vin`/`scan-service-doc` egy **zárt, szabványos formátumú dokumentumot** olvas (VIN-plakett, forgalmi engedély, szervizkönyv-táblázat) — a kinyerendő adat előre definiált mezőkbe rendezhető, kevés tere van a "kitalálásnak";
- a `parse-equipment` egy **zárt katalógusra** (`EQUIPMENT_ITEMS`) map-el, szigorú enum-mal;
- a `scan-defect` viszont egy **szabad, nyílt jelenetről** (tetszőleges autó-sérülés, tetszőleges szög/fény/minőség) kér **szabad szöveges leírást** — itt a modell könnyen "kiszínezhet" olyan részleteket, amik nem láthatók a képen (pl. konkrét alkatrész-nevet, okot, súlyosságot, javítás módját talál ki).

Ezért a védelem TÖBB, egymástól független rétegből áll — egyik réteg kiesése se okozzon téves adatot a végleges riporton:

### 3.1. Zárt kategória-katalógus (ugyanaz a minta, mint `parse-equipment`)
A `category` mező KIZÁRÓLAG az 5 meglévő `DEFECT_CATEGORIES` érték egyike lehet (`Motor`, `Váltó`, `Beltér`, `Fék/Futómű`, `Egyéb`) — a `responseSchema` enum-mal kényszeríti, ÉS a szerver a válasz feldolgozásakor MÉG EGYSZER ellenőrzi (nem bízik a séma-megfelelésre), pontosan úgy, ahogy a `parse-equipment/route.ts` a `catalogSet.has(item.id)` ellenőrzést végzi. Ha a modell mégis egy nem-katalógus értéket adna vissza, a teljes AI-javaslatot elvetjük (nem próbáljuk "legjobb egyezésre" kerekíteni), és `defectDetected: false`-ként kezeljük.

### 3.2. Kötelező "nem látok egyértelmű hibát" kimenet
A modell NE legyen kényszerítve arra, hogy mindenképp találjon valamit. A válasz-séma tartalmaz egy `defectDetected: boolean` mezőt:
- Ha a kép nem egyértelműen egy autó-hibát/sérülést mutat (pl. rossz kép, nem releváns tárgy, túl homályos, vagy egyszerűen nem látszik rajta semmi problémás), a modell `defectDetected: false`-t ad vissza, `category`/`description` NÉLKÜL.
- A rendszerutasítás explicit tiltja a "találgatást": *"Ha nem vagy egyértelműen biztos abban, hogy mit látsz, vagy a kép nem alkalmas hiba azonosítására, MINDIG `defectDetected: false`-t adj vissza — SOHA ne találj ki egy plauzibilis, de bizonytalan választ csak azért, hogy legyen mit visszaadni."*
- Ugyanez a `confidence` (`high`/`medium`/`low`) mező is megmarad (ugyanaz a minta, mint a másik 4 Vision route-nál) — `low` confidence esetén a UI külön, jól látható figyelmeztetést mutat ("Az AI bizonytalan ebben a javaslatban — ellenőrizd különösen alaposan").

### 3.3. Szigorú "csak amit látsz" rendszerutasítás
A prompt explicit korlátozza a leírás tartalmát:
- *"KIZÁRÓLAG azt írd le, amit a képen TÉNYLEGESEN látsz — a sérülés/hiba típusát, helyét, méretét/kiterjedését, ha az vizuálisan megállapítható."*
- *"SOHA ne találj ki, ne feltételezz és ne egészíts ki olyan információt, ami nem látható a képen: NE adj meg konkrét alkatrész-márkát/típust, NE adj okot/diagnózist (pl. 'valószínűleg elhasználódás miatt'), NE adj javítási javaslatot, NE adj költségbecslést, NE ítélj a súlyosságról szavakkal sem (pl. 'veszélyes', 'azonnal javítandó')."*
- *"Ha a kép egy autó-alkatrészt mutat, de nem egyértelmű, hogy azon HIBA van-e, `defectDetected: false`-t adj vissza — a bizonytalan esetben mindig a visszafogottabb választ add."*
- Ez a szabály szándékosan szigorúbb, mint a többi route promptja, mert itt nincs "ground truth" dokumentum (mint egy VIN-plakett), amihez a modell kimenete objektíven ellenőrizhető lenne.

### 3.4. NINCS numerikus/automatikus súlyosság-becslés v1-ben
A korábbi javaslatban felmerült "súlyossági becslés" **explicit KIMARAD a v1 hatóköréből** — egy hibásan magabiztos AI-súlyosság-pontszám (pl. "7/10 súlyos") közvetlen jogi/bizalmi kockázatot jelentene egy ügyfélnek küldött hivatalos riporton, és a `DefectState` típus jelenleg nem is tartalmaz súlyosság-mezőt (DB-séma bővítést igényelne). Ha ezt mégis szeretné a felhasználó, az egy KÜLÖN, saját tervet igénylő döntés legyen — lásd 8. pont.

### 3.5. Kötelező emberi jóváhagyás — SOSE közvetlen state-írás
Ellentétben azzal, ahogy pl. a `parse-equipment` update-jei közvetlenül a mezőkbe írnak, a `scan-defect` válasza **mindig egy elkülönült "AI javaslat" kártyaként** jelenik meg, KÜLÖN "Elfogadom" / "Elvetem" gombbal — a `category`/`description` mező a hiba-kártyán csak az "Elfogadom" kattintás UTÁN töltődik ki (és onnantól ugyanúgy szabadon szerkeszthető, mint egy kézzel beírt érték). Amíg a szakértő nem fogadja el, a javaslat vizuálisan is jól elkülönül a "kész" mezőktől (pl. szaggatott keret + "AI javaslat — ellenőrizd" felirat). Ez azért fontosabb védelem, mint a többi route-nál, mert itt a legnagyobb a szabad szöveges "kitalálás" tere.

### 3.6. Csak explicit felhasználói kérésre fut le
Az AI-hívás NEM automatikus a fotó kiválasztásakor (ellentétben azzal, ahogy pl. a `StepEquipment.tsx` diktálás vége automatikusan triggereli a `parse-equipment`-et) — a fotó feltöltése után egy külön "✨ AI elemzés" gomb jelenik meg, amit a szakértőnek kattintania kell. Ez (a) tudatossá teszi, hogy egy AI-javaslat érkezik, nem egy automatikus tény, és (b) elkerüli a felesleges kredit-fogyasztást olyan fotóknál, ahol a szakértő úgyis kézzel akar gépelni.

### 3.7. Kötelező, állandó disclaimer a UI-ban
Az "AI javaslat" kártyán mindig látható egy rövid felirat: *"Az AI-javaslat tájékoztató jellegű, a képen látottak alapján — mindig ellenőrizd, mielőtt elfogadod."* (Ugyanaz az elv, mint a költségbecslés/riport-chat disclaimereinél a projektben.)

## 4. Technikai architektúra

### 4.1. API route — `app/api/ai/scan-defect/route.ts`

Pontosan a `scan-vin`/`scan-service-doc` route-ok mintáját követi:

- **Bemenet:** `POST { image: string /* data URL vagy nyers Base64 */, mimeType?: string, inspectionId: string }`. A kliens a fotót a meglévő, megosztott `compressImageForAiScan` (`lib/inspections/aiImageCompression.ts`) függvénnyel tömöríti feltöltés előtt — ugyanaz az 1600px/0.82 JPEG minta, mint a másik 3 fotó-alapú route-nál.
- **Videó KIZÁRVA:** a `DefectMediaUpload` videó-fájlnál az "AI elemzés" gomb NEM jelenik meg (a Gemini Vision `inlineData` bemenet ehhez a route-hoz KIZÁRÓLAG állóképet fogad — ugyanaz a `MAX_IMAGE_BYTES`/`ALLOWED_MIME_TYPES` védelmi minta, mint a másik 3 route-nál).
- **Autentikáció + kredit-védelem:** 1:1 a `parse-equipment/route.ts` JSDoc "Autentikáció + kredit-védelem" (kanonikus) mintája — `auth.getUser()` → 401 ha nincs bejelentkezve → `hasInspectionClaimedAiCredit` → ha még nincs claim-elve, `checkAiQuota` → 402 `INSUFFICIENT_AI_QUOTA` ha elfogyott → Gemini-hívás → SIKERES ÉS VALIDÁLT válasz UTÁN `claimInspectionAiCredit` + `consumeAiQuota`.
- **Modell-fallback lánc:** ugyanaz, mint a másik 4 route-nál — `MODEL_CANDIDATES = ['gemini-2.0-flash', 'gemini-flash-latest']`, majd a dinamikus `ai.models.list()` "flash" névkeresés végső biztonsági hálóként. `runtime = 'nodejs'`.
- **`responseSchema` (Gemini strukturált kimenet, `temperature: 0`):**
  ```ts
  {
    type: Type.OBJECT,
    properties: {
      defectDetected: { type: Type.BOOLEAN },
      confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
      category: { type: Type.STRING, enum: DEFECT_CATEGORIES },
      description: { type: Type.STRING },
    },
    propertyOrdering: ['defectDetected', 'confidence', 'category', 'description'],
    required: ['defectDetected', 'confidence'],
  }
  ```
  (`category`/`description` NEM `required` — a modell `defectDetected: false` esetén jogosan hagyja ki őket.)
- **Szerver-oldali "MÉG EGYSZER" validáció (`sanitizeScanDefectResponse()`), a projekt minden Vision route-jánál bevált elv szerint — a séma-megfelelés ÖNMAGÁBAN nem elég:**
  1. Ha `defectDetected !== true`, a válasz `{ defectDetected: false }` — `category`/`description` mezőt EGYÁLTALÁN NEM adunk tovább a kliensnek, még akkor sem, ha a modell tévedésből mellékelte volna.
  2. Ha `defectDetected === true`, de `category` NEM pontosan a `DEFECT_CATEGORIES` egyike → a teljes válasz `{ defectDetected: false }`-ra esik vissza (lásd 3.1 — nincs "legközelebbi találat" kerekítés).
  3. `description`: kötelező nem-üres string, `.trim()`, max. hossz-limit (pl. 300 karakter — ugyanaz a védelmi elv, mint a `scan-service-doc` `MAX_NOTES_LENGTH`-jénél), ha üres → `defectDetected: false`.
  4. Ha `confidence` nem a 3 megengedett érték egyike → `502` hiba (ugyanaz, mint a másik route-oknál — ez sémahiba, nem tartalmi bizonytalanság).
- **Hibaválasz:** ugyanaz az `{ success: false, error, details?, code? }` alak, `details` KIZÁRÓLAG az elsődleges modell hibáját mutatja (lásd `primaryError` minta).

### 4.2. Rendszerutasítás (`buildSystemInstruction()`, magyar, végleges szöveg implementációkor finomítandó)

```
Te egy magyar nyelvű autóvizsgálati hiba-felismerő asszisztens vagy. A feladatod, hogy a
felhasználó által feltöltött fotóról (egy autó-alkatrész vagy karosszéria-részlet közeli
képe) megállapítsd, látható-e rajta EGYÉRTELMŰ mechanikai/elektronikai/beltéri hiba vagy
sérülés, és ha igen, tömören leírd, amit TÉNYLEGESEN látsz.

SZIGORÚ SZABÁLYOK:
1. KIZÁRÓLAG azt írd le, ami a képen ténylegesen látható: a hiba/sérülés típusa, helye,
   kiterjedése, ha ez vizuálisan megállapítható.
2. SOHA ne találj ki, ne feltételezz olyan információt, ami NEM látható a képen: ne adj meg
   konkrét alkatrész-márkát/típust, ne adj okot vagy diagnózist, ne adj javítási javaslatot,
   ne adj költségbecslést, ne minősítsd szavakkal a súlyosságot (pl. "veszélyes",
   "azonnal javítandó").
3. Ha nem vagy egyértelműen biztos abban, hogy mit látsz, VAGY a kép nem alkalmas hiba
   azonosítására (homályos, rossz szög, nem releváns tárgy, vagy egyszerűen nem látszik
   rajta semmi problémás), a "defectDetected" mezőt ÁLLÍTSD "false"-ra, és NE adj vissza
   "category"/"description" mezőt. A bizonytalan esetben MINDIG a visszafogottabb válasz a
   helyes, SOHA ne "találgass csak azért, hogy legyen mit visszaadni".
4. Ha "defectDetected: true", a "category" mező KIZÁRÓLAG az alábbi 5 érték egyike lehet,
   PONTOSAN ebben az írásmódban: "Motor", "Váltó", "Beltér", "Fék/Futómű", "Egyéb". Ha egyik
   sem illik egyértelműen, használd az "Egyéb"-et.
5. A "description" tömör, magyar, tényszerű mondat legyen (max kb. 2 mondat), amit egy
   autóvizsgáló szakember a saját jegyzeteként írna le, pl. "Kb. 8 cm-es karcolás a jobb
   hátsó ajtón, a festékig hatol." vagy "Repedt a hátsó lökhárító bal alsó sarka."
6. A "confidence" mező a SAJÁT bizonyosságod: "high" (egyértelmű, tisztán látható hiba),
   "medium" (valószínű hiba, de a kép minősége/szöge miatt van bizonytalanság), "low" (a kép
   rossz minőségű, vagy csak részben látszik a hiba).

Kizárólag a megadott JSON séma szerinti választ add — semmi mást.
```

### 4.3. Kliens-oldali változások

- **`DefectMediaUpload.tsx` bővítése:** kép (NEM videó) kiválasztása után egy "✨ AI elemzés" gomb jelenik meg a fotó-előnézet alatt/mellett, `onAnalyze` callback-kel (a szülő `StepDefects.tsx` hívja a route-ot, ugyanúgy, ahogy a `StepCarInfo.tsx`/`StepServiceHistory.tsx` már kezeli a saját fotó-alapú AI hívásait).
- **`StepDefects.tsx` új állapota hiba-kártyánként:** `aiSuggestion: { category, description, confidence } | null`, `isAnalyzing: boolean`, `analyzeError: string | null`.
- **"AI javaslat" kártya** (csak ha `aiSuggestion !== null`): szaggatott kerettel elkülönítve, mutatja a javasolt kategóriát + leírást, a 3.7 pont szerinti disclaimer felirattal, `low` confidence esetén extra figyelmeztetéssel (3.2), és két gombbal: "Elfogadom" (a hiba-kártya `category`/`description` mezőjét felülírja a javaslattal, `aiSuggestion` törlődik) / "Elvetem" (`aiSuggestion` törlődik, a mezők változatlanok maradnak).
- Ha a válasz `defectDetected: false`, NEM jelenik meg elfogadható kártya, csak egy semleges, nem hiba-jellegű üzenet: *"Az AI nem ismert fel egyértelmű hibát ezen a képen — töltsd ki kézzel."*
- 402 (`INSUFFICIENT_AI_QUOTA`) esetén ugyanaz a globális `useInsufficientCredits().notifyInsufficientCredits()` minta, mint a többi AI-hívásnál.
- Hálózati/szerver hiba esetén csendes, nem blokkoló hibaüzenet a kártyán (a kézi kitöltés lehetősége mindig megmarad — egy sikertelen AI-hívás SOSE okoz adatvesztést vagy blokkolást, ugyanaz az elv, mint a `VoiceInputButton`-nál).

### 4.4. Kredit-dashboard / label

`FEATURE_NAME = 'defect_scan'` bekerül a `usage_logs.feature_name` értékek közé — a `components/credits/CreditDashboardModal.tsx` megfelelő címke-térképét (ha van ilyen, pl. `FEATURE_NAME_LABELS`-szerű struktúra a kredit-történet táblázathoz) bővíteni kell egy magyar megnevezéssel (pl. "Hiba-felismerés fotóból"), hogy a Kredit Dashboard ne a nyers kódot mutassa.

## 5. UI terv

A `StepDefects.tsx` (Linear Design System) meglévő hiba-kártya-elrendezéséhez illeszkedik: a `DefectMediaUpload` mellett/alatt jelenik meg az "AI elemzés" gomb és — siker esetén — az "AI javaslat" panel, ugyanazokkal a Linear-tokenekkel (`rounded-md`, `border-linear-hairline`, `bg-linear-surface-2`), mint a projekt többi AI-felülete (pl. `StepFinalAssessment.tsx` "✨ Automatikus összefoglaló írása" gombja) — nem szükséges új vizuális minta.

## 6. Elfogadási kritériumok (implementáció végén ellenőrizendő)

Az általános kritériumok (modell-fallback élesben tesztelve, kvóta-blokkolás tesztelve, `npx tsc --noEmit` szinkron egyetlen bash-hívásban hibamentes, `status.md` frissítve) MELLETT — ez a route-specifikus, a hallucináció-védelemre fókuszáló teszt-lista a KÖTELEZŐ minimum, kézi teszteléssel:

1. **Egyértelmű, éles fotó egy konkrét sérülésről** (pl. karcolás, horpadás) → helyes kategória + a képen ténylegesen látható tartalmú leírás, `high`/`medium` confidence.
2. **Teljesen irreleváns fotó** (pl. égbolt, szoba, random tárgy) → `defectDetected: false`, a UI a "nem ismert fel hibát" üzenetet mutatja, SEMMILYEN mező nem töltődik ki.
3. **Homályos/rossz minőségű/rosszul megvilágított fotó egy valódi sérülésről** → vagy `defectDetected: false`, vagy `low` confidence + jól látható figyelmeztetés a UI-ban — NEM `high`/`medium` confidence-szel átcsúszó, hamisan magabiztos válasz.
4. **Kézi átolvasás (legalább 10 különböző teszt-fotóra) annak ellenőrzésére, hogy a `description` NEM tartalmaz a képen nem látható, kitalált adatot** — konkrétan: nincs benne kitalált alkatrész-márka/típus, nincs benne diagnózis/ok, nincs benne javítási javaslat, nincs benne súlyosság-minősítés, nincs benne költség. Ez a kritérium NEM automatizálható, minden implementáció-lezáró review-nál manuálisan kell ellenőrizni.
5. Egy hiba-kártyán az "Elvetem" gomb megnyomása után a `category`/`description` mező garantáltan VÁLTOZATLAN marad (a javaslat nem szivároghat be semmilyen módon a mentett adatba elfogadás nélkül).
6. Egy már korábban kézzel kitöltött hiba-kártyán az "AI elemzés" lefuttatása és "Elvetem" gombja NEM írja felül a meglévő kézi tartalmat.
7. Videó-fájl kiválasztásakor az "AI elemzés" gomb nem jelenik meg, és a route direkt hívása videó MIME-típussal `400`-at ad vissza.

## 7. Visszaélés elleni védelem / védelmi rétegek összefoglalva

Ugyanazok az általános védelmek, mint a másik 4 fotó-alapú route-nál: `MAX_IMAGE_BYTES` (~4 MB, a Vercel ~4,5 MB-os request body korlátja alatt), `ALLOWED_MIME_TYPES` (`image/jpeg`, `image/png`, `image/webp`), kliens-oldali kép-tömörítés (`compressImageForAiScan`), autentikáció + "1 AI kredit = 1 vizsgálat" keret.

## 8. Nyitott döntések a felhasználóval, MIELŐTT a kódolás elkezdődik

- **Súlyosság-becslés (lásd 3.4):** a jelenlegi terv KIHAGYJA a v1 hatóköréből, biztonsági/jogi megfontolásból. Ha ez mégis kell, az egy KÜLÖN döntés + `DefectState` típus- és DB-séma bővítés (a `defects` JSONB-ben egy új `severity` mező, migráció, `DefectsGallery.tsx` publikus riport-megjelenítés bővítése) — nem ennek a tervnek a hatóköre. Kérdés a felhasználónak: kell-e ez egyáltalán, és ha igen, kizárólag LEÍRÓ (pl. "enyhe"/"közepes"/"jelentős" — SOHA numerikus pontszám) formában?
- **"Elfogadom" kötelezővé tétele (3.5):** a terv szerint az AI-javaslat SOHA nem írja felül automatikusan a mezőket, mindig explicit elfogadás kell. Egyetért-e ezzel a felhasználó, vagy elfogadható lenne egy gyorsabb, de kockázatosabb "azonnal kitölti, utólag szerkesztheted" minta (mint pl. a `scan-vin`-nél)? **Javaslat: maradjon a kötelező elfogadás**, mert itt — a többi route-tal ellentétben — nincs zárt, ellenőrizhető forrásdokumentum, amihez a modell kimenete mérhető lenne.
- **1 hiba / fotó, vagy több hiba egy fotón (mint a `scan-service-doc`-nál)?** A jelenlegi `StepDefects.tsx` adatmodellje (1 hiba-kártya = 1 fotó) alapján a terv **1 hiba/fotó** hatókört javasol v1-ben — egy fotón több, egyszerre látható hiba felismerése (pl. egy táblázatos autó-áttekintő képen) külön, nagyobb terv legyen, ha igény van rá.
- **Végleges Gemini modell-név + a hozzá tartozó ingyenes-csomag limitek** implementáció idején ellenőrizendők (`ai.google.dev/pricing`), ugyanaz a fenntartás, mint a `PLAN_ai_report_chat.md` 7. pontjában.
