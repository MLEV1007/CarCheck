# TERV — Videó-tömörítés a médiafeltöltésnél + QR-kódos telefonos feltöltés a wizardból

_Ez egy FEJLESZTÉSI UTASÍTÁS/SPEC egy jövőbeli implementációs lépéshez, a `PLAN_ai_scan_defect.md`/`PLAN_ai_report_chat.md` konvenciója szerint. A felhasználó explicit kérése (2026-08-21): "kérlek... először írj egy PLAN_video_qr_upload.md-t, amit jóváhagyás után implementálunk." Ez a fájl a tényleges fejlesztés indulásakor követendő. MÉG NINCS MEGVALÓSÍTVA — a kódolás a felhasználó explicit jóváhagyása UTÁN kezdődik._

_Ez a terv 2026-08-21-i élő adatbázis-ellenőrzés (Supabase MCP, `nsejmkcwvksbwxscvrvb` projekt) alapján készült — a lenti sémareferenciák (storage policy-k pontos szövege, `inspections`/`user_credits` oszloplista, `inspection-media` bucket állapota) a TÉNYLEGES éles állapotot tükrözik, nem feltételezést._

## 1. Cél és hatókör

Két, egymáshoz szorosan kapcsolódó funkció:

1. **Kliens-oldali videó-tömörítés** minden feltöltött videónál (közvetlen kameráról, galériából, számítógépről csatolva, VAGY a QR-folyamaton át) — a jelenlegi, tömörítés/méretkorlát NÉLKÜLI (`supabase.storage.from('inspection-media').upload(path, file, {upsert:true})`) feltöltés helyett.
2. **QR-kódos telefonos média-feltöltés** a wizard Általános fotók és Hiba-média lépésein — asztali gépen kitöltő szakértő a saját telefonjával, bejelentkezés nélkül, egy rövid életű tokennel tud fotót/videót feltölteni, ami élőben megjelenik a wizard képernyőjén.
3. **Csomag-jogosultság**: a videó-csatolás (mindkét úton) kizárólag Profi/Business (`user_credits.plan_tier IN ('pro','business')`) szervezeteknek jár, szerver-oldalon KIKÉNYSZERÍTVE, nem csak kliens-oldalon elrejtve.

## 2. Élő séma-ellenőrzés eredménye (2026-08-21, MCP `execute_sql`)

Ez a szakasz azokat a feltételezéseket erősíti meg (vagy cáfolja), amikre a lenti terv épül — implementáció előtt NEM kell újra megnézni, csak ha a kódolás és e terv írása között érdemi idő telik el.

- **`storage.buckets` — `inspection-media`**: `public = true`, `file_size_limit = null`, `allowed_mime_types = null`. **Megerősítve: nincs védőháló.**
- **`storage.objects` policy-k** (a `20260731`-i "RLS SELECT policy hiányzott" éles hibajegy óta, lásd `status.md` — ez a séma NINCS a `supabase/migrations/` mappában, csak élesben létezik):
  ```
  inspection_media_authenticated_upload  (INSERT)  with_check: bucket_id = 'inspection-media' AND (storage.foldername(name))[1] = auth.uid()::text
  inspection_media_authenticated_select  (SELECT)  using:      ugyanaz
  inspection_media_authenticated_update  (UPDATE)  using+check: ugyanaz
  inspection_media_authenticated_delete  (DELETE)  using:      ugyanaz
  ```
  Vagyis a feltöltési útvonal ELSŐ szegmense (`{userId}/...`) `auth.uid()`-hoz van kötve — ez **kritikus architektúrális korlát a QR-folyamatra nézve, lásd 5.3 pont**: egy bejelentkezés NÉLKÜLI telefon-kliens SOHA nem tud közvetlenül, saját Supabase-hívással írni ebbe a bucketbe, mert nincs `auth.uid()`-ja, ami megegyezne a szakértő mappájával. Ez ELSŐRE korlátozásnak tűnik, valójában viszont **erős, ingyenes biztonsági garancia**: a QR-kliens fizikailag nem tudja megkerülni a szerver-oldali aláírt-URL végpontot, mert nincs más módja az írásra.
- **`inspections` tábla**: tartalmazza a tervhez releváns oszlopokat — `organization_id uuid not null`, `created_by uuid`, `public_token uuid not null default gen_random_uuid()`, `general_photos text[]`. Nincs FK a leendő QR-táblákból erre (lásd 5.1 pont, ugyanaz az elv, mint `inspection_ai_credit_usage`-nál).
- **`user_credits` tábla**: `organization_id uuid not null unique`, `plan_tier varchar not null default 'free'` (CHECK: `starter|pro|growth|business`, `free` a `20260807_free_tier_default_quota.sql` óta is engedélyezett érték — ellenőrizve: a jelenlegi CHECK constraint-listát a `20260806_pricing_tiers...sql` írja felül `('starter','pro','growth','business')`-re, tehát a `free` érték élesben egy KÉSŐBBI migrációval kerülhetett vissza az engedélyezett listába — ez rendben van, `lib/quotas.ts` `toPlanTier()` `'free'`-t is kezel). **A felhasználó feltételezése megerősítve**: `profiles.plan_tier` (`free|starter|pro|enterprise`, `lib/credits.ts` `getUserPlanTier()`) és `user_credits.plan_tier` (`free|starter|growth|pro|business`, `lib/quotas.ts` `getOrganizationQuotaBalance()`) **még mindig két különálló, nem szinkronizált mező** — a duplikáció NEM szűnt meg. A videó-jogosultságot **kizárólag** `user_credits.plan_tier`-re kell alapozni, lásd 6. pont.
- **SECURITY DEFINER helper függvények már léteznek**: `current_user_organization_id()`, `current_user_role()`, `get_public_report(uuid)` — az új RPC-k/policy-k ugyanezt a bevált mintát követik.
- **Supabase Realtime**: a projektben (a `status.md` teljes szövegében) **eddig SEHOL nincs használva** — ez az ELSŐ Realtime-integráció a projektben, lásd 5.4 pont kockázat-jegyzetét.
- **`@supabase/supabase-js`/`@supabase/storage-js` verzió**: `2.111.0` — `createSignedUploadUrl()`/`uploadToSignedUrl()` MÁR ELÉRHETŐ ebben a verzióban (ellenőrizve a `node_modules`-ban), **nem kell hozzá csomag-frissítés**. Valódi TUS-alapú (chunkolt, megszakítás után folytatható) feltöltéshez viszont a `tus-js-client` csomag **jelenleg NINCS telepítve** — ez ÚJ függőség, lásd 4.2 pont.

## 3. Feature A — Kliens-oldali videó-tömörítés

### 3.1. Új modul: `lib/inspections/videoCompression.ts`

Az `aiImageCompression.ts` JSDoc-stílusát és elhelyezését követi (fájl tetején hosszú "miért kell ez" magyarázat, exportált konstansok dokumentálva, a fő függvény a végén). A KÜLÖNBSÉG: az `aiImageCompression.ts` egy ÁTMENETI, csak az AI-hívásnak szánt másolatot készít (a ténylegesen tárolt fotót nem érinti) — ez az új modul viszont a TÉNYLEGESEN Storage-ba kerülő, végleges fájlt állítja elő.

- **Motor: `ffmpeg.wasm`** (`@ffmpeg/ffmpeg` + `@ffmpeg/util` csomagok, `@ffmpeg/core` — egyszálas — alapértelmezett, `@ffmpeg/core-mt` — többszálas — csak akkor töltve be dinamikusan, ha `self.crossOriginIsolated === true`, lásd 3.3 pont). **A pontos csomagverziókat implementáció idején kell megerősíteni** (`npm view @ffmpeg/ffmpeg versions`, `ai.google.dev`-hez hasonlóan gyorsan változó ökoszisztéma) — ugyanaz a fenntartás, mint a projekt többi tervében a Gemini modellnevekhez.
- **Célparaméterek** (a felhasználó saját javaslata, MEGERŐSÍTVE ebben a tervben, implementáció előtt még egyszer egyeztetve a felhasználóval a 8. pont szerint):
  - Felbontás: max. 1280×720 (hosszabb oldal 1280px-re skálázva, ha az eredeti nagyobb — álló videónál a magasság a korlátozott oldal).
  - Videó bitráta: ~2 Mbps (a javasolt 1,5–2,5 Mbps sáv középértéke), hang: 128 kbps AAC.
  - Konténer/kodek: H.264 (`libx264`) + AAC MP4 — a legszélesebb böngésző-lejátszási kompatibilitás (a publikus riport `<video>` elemének, `MediaLightbox.tsx`/`DefectsGallery.tsx`, natívan kell lejátszania, plugin nélkül).
  - Max. hossz: 90 másodperc. Ha a kiválasztott videó ennél hosszabb (a HTML5 `<video>` elem `loadedmetadata` eseményéből `duration` — ELŐSZÖR ezzel, ffmpeg indítása NÉLKÜL derítjük ki, hogy ne induljon feleslegesen a nehéz WASM-betöltés egy úgyis elutasítandó fájlnál), egy magyar megerősítő dialógus jelenik meg: *"A videó X másodperc hosszú — ez hosszabb a javasolt 90 másodpercnél. Vágjuk az első 90 másodpercre, vagy válassz másik fájlt?"*, két gombbal ("Vágás 90 másodpercre" / "Másik fájl választása"). **v1 hatókör-korlátozás**: kizárólag "vágás az ELSŐ 90 másodpercre" opció van, NINCS kliens-oldali scrubber/tartomány-kiválasztó vágóeszköz — ez egy tudatos v1 egyszerűsítés, lásd 8. pont.
- **Progress UI**: az `ffmpeg.wasm` `ffmpeg.on('progress', ({ progress }) => ...)` eseményét egy magyar nyelvű, %-os vagy határozatlan (ha a progress API megbízhatatlan egy adott inputnál) folyamatjelzőre kötve — ugyanazokkal a Linear design tokenekkel (`bg-linear-surface-2`, `border-linear-hairline`), mint a projekt többi betöltés-állapota (pl. `StepFinalAssessment.tsx` "Összefoglaló írása…" mintája). A UI explicit jelzi, hogy ez 10-30 másodpercig is tarthat gyengébb telefonon, hogy a felhasználó ne higyje lefagyottnak az oldalt.
- **Hiba esetén — SOHA csendes visszaesés a tömörítetlen fájlra.** Ha a `ffmpeg.wasm` inicializálása vagy a tömörítés bármilyen okból hibázik (régi böngésző, WASM nem támogatott, memóriahiba nagy fájlnál stb.), egyértelmű magyar hibaüzenet: *"A videó tömörítése nem sikerült ezen az eszközön/böngészőben. Próbáld egy másik böngészővel/eszközzel, vagy válassz rövidebb/kisebb felbontású videót."* — a fájl NEM kerül feltöltésre tömörítetlenül. Ez explicit, szándékos eltérés a projekt más AI-funkcióinak "sikertelen hívás sose blokkoljon" elvétől (pl. `VoiceInputButton`) — itt a tömörítés a funkció LÉNYEGE (méretkorlátozás), nem egy kényelmi kiegészítő.
- **Exportált fő függvény**: `compressVideoForUpload(file: File, onProgress?: (ratio: number) => void): Promise<File>` — a bemenettel megegyező `name`-mel (kiterjesztés `.mp4`-re cserélve, ha szükséges), a `DefectMediaUpload.tsx`/`StepGeneralPhotos.tsx`/a QR-oldal ugyanazt a `File`-alapú `onSelect`-mintát kapja vissza, amit ma is használnak — a hívó oldalak NEM az egyedi tömörített-blob-kezelést látják, csak egy (lassabb, progress-szel kísért) `File`-t.

### 3.2. Hívási pontok — MINDHÁROM útvonal

1. **`DefectMediaUpload.tsx`** — a `type="file" accept="image/*,video/*"` `onChange`-ében, videó MIME-típus esetén a jelenlegi közvetlen `onSelect(selected)` elé beékelődik a tömörítés (async, progress state a szülő `StepDefects.tsx`-ben, hasonlóan a meglévő `DefectAiState`-hez).
2. **`StepGeneralPhotos.tsx`** — jelenleg `accept="image/*"`, KIZÁRÓLAG képet fogad. A videó-opció bővítés **csomag-jogosultsághoz kötött** (lásd 6. pont) — a `accept` attribútum Profi/Business szervezetnél `image/*,video/*"`-re bővül, más csomagnál `image/*"` marad (VAGY marad `image/*,video/*`, de kattintásra a nem-kép fájl kliens-oldalon elutasítva + upsell — lásd 6.3 pont a pontos UX-döntésről).
3. **QR-feltöltő oldal** (`app/qr-upload/[token]/page.tsx`, lásd 5. pont) — UGYANEZ a `compressVideoForUpload()` fut le a TELEFONON, mielőtt a fájl elindulna a signed-URL feltöltés felé. **Kockázat, amit a 8. pontban nyitva hagyok**: a `ffmpeg.wasm` WASM-core (~30 MB) betöltése egy gyengébb/régebbi telefonon érdemben lassabb/megbízhatatlanabb lehet, mint egy asztali gépen — a fenti "sose essen vissza csendben tömörítetlenre" szabály itt ugyanúgy érvényes, tehát egy sikertelen tömörítés a telefonon is egyértelmű hibaüzenettel + "próbálj másik eszközt" javaslattal zárul, NEM egy tömörítetlen feltöltéssel.

### 3.3. `next.config.mjs` — COOP/COEP fejlécek, SZŰKEN skópolva

A többszálas (gyors) `ffmpeg.wasm` build `SharedArrayBuffer`-t igényel, ami `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` fejléceket követel. **Kritikus tervezési döntés**: ezeket a fejléceket **NEM szabad globálisan** (minden route-ra) beállítani — a `COEP: require-corp` minden kereszt-eredetű erőforrást (pl. a `next.config.mjs` `remotePatterns`-ben már engedélyezett `*.supabase.co` Storage képeket/videókat a publikus BMW-riporton, `/report/[public_token]`) `crossorigin` attribútum és megfelelő CORS-fejléc nélkül BLOKKOLNA — ez eltörné a publikus riport fotógalériáját. A `next.config.mjs` `headers()` függvényében a `source` mintát **kizárólag** a wizard útvonalakra (`/inspections/new`, `/inspections/:id`) ÉS az új QR-oldalra (`/qr-upload/:token`) kell szűkíteni, pl.:
```js
async headers() {
  return [
    {
      source: '/inspections/:path*',
      headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
      ],
    },
    { source: '/qr-upload/:path*', headers: [ /* ugyanaz */ ] },
  ];
}
```
**`credentialless`, NEM `require-corp`** — a `COEP: credentialless` (újabb, szélesebb böngésző-támogatottságú mód) engedi a kereszt-eredetű erőforrások betöltését anélkül, hogy azoknak explicit CORP-fejlécet kellene küldeniük, amíg nem hitelesítő adatokkal (cookie) töltődnek be — ez valószínűleg elég a Supabase Storage publikus képeihez/az `next/image` `remotePatterns`-hez is, de **implementáció idején böngészőben ténylegesen letesztelendő** (Safari-támogatottság `credentialless`-nél történetileg later jött, mint Chrome-nál — ellenőrizendő). Ha `credentialless` valamiért nem működne kielégítően, a biztonsági háló ugyanúgy megvan: a `self.crossOriginIsolated` feature-detect miatt a kód ilyenkor egyszerűen az egyszálas `@ffmpeg/core`-ra esik vissza (lassabb, de fejléc NÉLKÜL is működik) — ez a felhasználó által is kért, kötelező fallback.

## 4. Feature A (folyt.) — Tárolási védőháló + resumable feltöltés

### 4.1. `inspection-media` bucket `file_size_limit`

Jelenleg `null` (élőben ellenőrizve, lásd 2. pont). Beállítandó egy konkrét, a tömörítési célparaméterekhez igazodó értékre: egy 90 másodperces, ~2,1 Mbps összbitrátájú (2 Mbps videó + 128 kbps hang) klip elméleti mérete kb. **24 MB** — a valós ffmpeg CBR/VBR ingadozása és a nem-videó fájlok (PDF-ek, fotók) miatt **50 MB**-os bucket-szintű `file_size_limit` javasolt védőhálóként (bőven a tömörített cél felett, de blokkolja a nyilvánvalóan elszabadult/hibás feltöltéseket). Ez a `storage.buckets` tábla egy sima UPDATE-je (a Supabase Dashboard "Edit bucket" felületén VAGY egy `apply_migration` SQL-lel, ugyanúgy, mint a projekt eddigi minden sémaváltása) — **implementáció előtt egyeztetendő a konkrét számérték**, lásd 8. pont.

### 4.2. Resumable (TUS) feltöltés minden ≥6 MB fájlnál

A Supabase saját ajánlása (implementáció idején `supabase.com/docs/guides/storage`-on ismét ellenőrizendő, mert ez azóta változhatott) a **TUS protokoll** használata 6 MB feletti fájloknál — ez VALÓDI, chunkolt, hálózat-megszakítás után folytatható feltöltés, szemben a jelenlegi, egylövéses `.upload()`-dal (ami egy műhelyi/terepi, gyenge mobilnetes környezetben — pontosan ahol ez a termék él — egyetlen csomagvesztésnél a TELJES fájlt újraküldeti).

- **Új függőség**: `tus-js-client` (NINCS telepítve, lásd 2. pont) — hozzáadandó a `package.json`-hoz.
- **A TUS-feltöltés maga NEM a felhasználó saját Supabase JWT-jével hitelesít** (bár technikailag támogatott lenne az asztali, bejelentkezett wizard-felhasználónál) — ehelyett **egységesen** egy szerver által kiadott **aláírt feltöltési tokent** (`createSignedUploadUrl()`) használunk MINDKÉT útvonalon (asztali ÉS QR), lásd 4.3 pont — ez az egyetlen konzisztens megoldás, mert a QR-telefonnak amúgy sincs Supabase JWT-je (lásd 2. pont RLS-korlátja), tehát a signed-URL/token mindenképp KELL a QR-úthoz, és ugyanazt az elvet követve az asztali útvonalon is egyszerűbb ugyanazt a mechanizmust újrahasználni 6 MB felett, mintsem két KÜLÖNBÖZŐ hitelesítési sémát fenntartani.
- A Supabase resumable (TUS) végpont (`{SUPABASE_URL}/storage/v1/upload/resumable`) a `createSignedUploadUrl()`-ból kapott tokent `metadata: { bucketName, objectName, contentType }` + `Authorization: Bearer <anon key>` fejléccel + a token external azonosítójaként fogadja — **a pontos header/metadata-kontraktust implementáció idején a Supabase aktuális TUS-dokumentációjából kell megerősíteni**, mert ez egy viszonylag ritkán használt API-felület, a projekt eddig sosem használta.

### 4.3. Megosztott feltöltés-orkesztráló: `lib/inspections/mediaUpload.ts` (kliens)

Egyetlen, megosztott kliens-oldali segédfüggvény, amit MIND az `InspectionWizard.tsx` (asztali, hitelesített), MIND a QR-oldal (telefon, token-alapú) használ — elkerülve, hogy a feltöltési logika (méret-alapú `.upload()` vs. signed-URL+TUS elágazás) duplikálódjon:

```ts
uploadInspectionMedia(params: {
  file: File;
  category: 'general' | 'service' | 'equipment' | 'damages' | 'defect';
  // Asztali (hitelesített) híváskor: a meglévő supabase-js kliens + userId/inspectionId.
  // QR híváskor: NINCS supabase-js session -- helyette a qrToken.
  authMode: { type: 'session'; userId: string; inspectionId: string } | { type: 'qrToken'; token: string };
}): Promise<{ publicUrl: string }>
```
- **Kép, `authMode: 'session'`, <6 MB**: VÁLTOZATLAN, a jelenlegi közvetlen `supabase.storage.from('inspection-media').upload(...)` (a meglévő `{userId}/{inspectionId}/{category}/...` útvonal-mintát megtartva) — ez a leggyakoribb eset, NEM éri meg felesleges szerver-kört bevezetni.
- **Bármi ≥6 MB VAGY videó VAGY `authMode: 'qrToken'`**: a megfelelő szerver-végpont hívása (lásd 4.4/5.2 pont) egy aláírt feltöltési tokenért, majd `tus-js-client`-tel feltöltés. Videónál MINDIG ez az ág fut, MÉG akkor is, ha a tömörített fájl véletlenül 6 MB alatt maradna — a csomag-jogosultsági kapu (6. pont) csak ezen az ágon érvényesíthető, tehát a konzisztencia kedvéért a méret-küszöbtől függetlenül minden videó ide tartozik.

### 4.4. Szerver-oldali aláírt-URL végpont — asztali (hitelesített) út

`app/api/inspections/media-upload-url/route.ts`, `POST { fileName, mimeType, category, inspectionId }`:
- `auth.getUser()` → 401, ha nincs bejelentkezve — UGYANAZ a minta, mint az `/api/ai/*` route-ok.
- `getUserRoleContext()`-tel szervezet-feloldás (ugyanaz, mint `lib/credits.ts`/`lib/quotas.ts` `resolveOrganizationId`).
- **Videó-mimetype-nál**: `getOrganizationQuotaBalance(organizationId).planTier`-t ellenőrzi — ha NEM `pro`/`business`, `403` (kód: `VIDEO_REQUIRES_PRO_PLAN`), mielőtt bármilyen URL-t kiadna (lásd 6.4 pont a pontos kontraktusról).
- A megosztott `lib/inspections/mediaUploadServer.ts` `issueSignedUploadPath({ userId, inspectionId, category, fileName })` hívása — ez építi az útvonalat (`{userId}/{inspectionId}/{category}/{uuid}-{safeName}`, UGYANAZ a minta, mint a mai `InspectionWizard.tsx` inline logikája, csak szerverre költöztetve ehhez az ághoz) és hívja a Supabase **admin** (service-role) kliens `storage.from('inspection-media').createSignedUploadUrl(path)`-ját.
- Válasz: `{ path, token, signedUrl }` — a kliens ebből építi a TUS-feltöltést.

## 5. Feature B — QR-kódos telefonos média-feltöltés

### 5.1. Adatbázis-tervezet

**`qr_upload_sessions`** — egyetlen "Feltöltés telefonról" kattintás = egyetlen sor (a wizard minden médiafeltöltési slot-hoz KÜLÖN QR-t generál — Általános fotók, VAGY egy adott hiba-kártya):
```sql
create table public.qr_upload_sessions (
  token uuid primary key default gen_random_uuid(),
  inspection_id uuid not null,       -- NINCS FK -- lásd inspection_ai_credit_usage.sql indoklását:
                                      -- a wizard inspectionId-ja a wizard megnyitásakor generálódik,
                                      -- MIELŐTT az inspections sor létrejönne.
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  target text not null,              -- 'general' VAGY 'defect:<clientId>' -- a wizard SAJÁT, kliens-oldali
                                      -- állapot-kulcsa, hogy a desktop tudja, a beérkező elemet hova illessze.
                                      -- A szerver ezt csak átlátszóan tárolja/adja vissza, nem értelmezi.
  expires_at timestamptz not null,   -- created_at + kb. 20 perc
  claimed_at timestamptz,            -- az ELSŐ sikeres telefon-oldali "session lekérdezés" időpontja --
                                      -- lásd lent az "egyszer használatos" pontos jelentését.
  created_at timestamptz not null default now()
);
```
**`qr_uploads`** — egyetlen sikeresen feltöltött médiaelem = egyetlen sor (ez triggereli a Realtime broadcastot a desktopnak):
```sql
create table public.qr_uploads (
  id uuid primary key default gen_random_uuid(),
  session_token uuid not null references public.qr_upload_sessions(token) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('photo', 'video')),
  created_at timestamptz not null default now()
);
```
`qr_uploads.session_token`-nek LEHET FK-ja (`qr_upload_sessions.token`-re) — ez, a `inspection_ai_credit_usage`/leendő session-táblákkal ellentétben, biztonságosan FK-zható, mert egy feltöltés SOSE előzheti meg a saját session-ének létrejöttét (a session mindig a desktopon jön létre ELSŐKÉNT, a QR-kód csak utána generálódik).

### 5.2. RLS + SECURITY DEFINER RPC-k (ugyanaz a minta, mint `get_public_report`)

- **`qr_upload_sessions`**: RLS bekapcsolva. `insert`/`select` policy: `organization_id = current_user_organization_id()` (a desktop, bejelentkezett szakértő hozza létre és nézi meg a SAJÁT szervezete session-jeit) — **NINCS `anon`/publikus SELECT policy** a táblán, a telefon SOSE olvassa közvetlenül.
- **`qr_uploads`**: RLS bekapcsolva. `select` policy: `organization_id = current_user_organization_id()` (ez KELL a Realtime-hoz is, lásd 5.4 pont — a Postgres Realtime a `postgres_changes` broadcastot a hallgató kliens RLS-jogosultságán keresztül szűri). **NINCS kliens-oldali (sem `anon`, sem `authenticated`) INSERT policy** — a telefon SOSE ír közvetlenül a táblába, kizárólag egy szerver route (service-role) insertál, MIUTÁN a tényleges Storage-feltöltés sikeres volt és a QR-token újra validálva lett (lásd 5.3 "megerősítő" végpont) — defense-in-depth, ugyanaz az elv, mint a `usage_logs` "szándékosan nincs update/delete policy" mintája.
- **`public.resolve_qr_upload_session(p_token uuid)`** — SECURITY DEFINER RPC, `anon`-nak grantolva (ugyanaz a minta, mint `get_public_report`): visszaadja `{ inspectionId, organizationId, target, videoAllowed, validUntil }`-t, HA a token létezik ÉS `expires_at > now()`. Ha lejárt/nem létezik, `null`/hibát ad, amit a telefon-oldal "A link lejárt, kérj újat a szakértőtől" üzenetre képez le. **`videoAllowed`**: a `user_credits.plan_tier` alapján SZERVEREN belül számolva (lásd 6.2 pont) — a telefon-kliens SOSE dönt erről saját maga. Ez a hívás UGYANAKKOR állítja be a `claimed_at`-et is, HA még `null` volt (első hívás "claim-eli" a sessiont) — lásd az "egyszer használatos" pontos jelentését alább.
- **"Egyszer használatos" jelentése — NYITOTT DÖNTÉS, lásd 8. pont**: a felhasználó eredeti kérése "egyszer használatos, az adott vizsgálathoz kötött, aláírt tokent" mondott. Ez a terv úgy értelmezi, hogy **a TOKEN egy telefon számára "foglalható le" (claimed_at), utána MÁS eszköz ugyanazzal a QR-kóddal/linkkel MÁR NEM tud csatlakozni** (megakadályozza, hogy egy elfogott/megosztott link egy MÁSIK telefonon is használható legyen) — DE az a telefon, ami elsőként claim-elte, a `expires_at`-ig TÖBB fájlt is feltölthet (nem szó szerint "1 fájl/token", mert a felhasználói UX egyértelműen egy folyamatos "tölts fel amennyit akarsz, amíg a wizard-lépésen vagy" élményt ír le). **Ezt az értelmezést a kódolás megkezdése előtt meg kell erősíteni a felhasználóval** — lásd 8. pont.

### 5.3. Szerver-végpontok (QR/publikus oldal)

- **`app/api/qr-upload/session/route.ts`** (`POST`, HITELESÍTETT — a desktop hívja): `{ inspectionId, target }` → létrehozza a `qr_upload_sessions` sort, visszaadja a `token`-t + `expiresAt`-et. A QR-kép maga KLIENS-OLDALON generálódik (lásd 5.5 pont) — nem kell a szervernek képet renderelnie.
- **`app/api/qr-upload/[token]/route.ts`** (`GET`, PUBLIKUS): a `resolve_qr_upload_session` RPC-t hívja, ezt adja vissza a telefon-oldali oldalnak induláskor (érvényesség + `videoAllowed` + `target` megjelenítéséhez, pl. "Fotók/videók feltöltése — Általános autó fotók" vs. "Fotók/videók feltöltése — Hiba: Motor").
- **`app/api/qr-upload/[token]/media-upload-url/route.ts`** (`POST`, PUBLIKUS, token-gate-elt): a 4.4 pont asztali végpontjával **azonos belső logikát** hívja (`lib/inspections/mediaUploadServer.ts` `issueSignedUploadPath`/videó-gate), csak a hitelesítés forrása más: `auth.getUser()` helyett a `resolve_qr_upload_session(token)` sikeres validálása adja az `organizationId`/`userId` (a `qr_upload_sessions.created_by` a "tulajdonos" felhasználó, akinek mappájába az útvonal kerül — így a feltöltött média UGYANABBA a `{userId}/{inspectionId}/...}` mappastruktúrába kerül, mint amit a szakértő közvetlen feltöltésénél is látnánk, konzisztensen a meglévő storage.objects RLS-sel).
- **`app/api/qr-upload/[token]/confirm/route.ts`** (`POST`, PUBLIKUS, token-gate-elt): `{ mediaUrl, mediaType }` — a TUS/signed-URL feltöltés SIKERES befejezése UTÁN a telefon ezt hívja, ami (service-role kliensen keresztül) beszúr egy sort a `qr_uploads`-ba — EZ triggereli a Realtime broadcastot a desktop felé (lásd 5.4 pont). A token újra-validálva (nem lejárt-e időközben).

### 5.4. Élő szinkron a desktop felé — Supabase Realtime (ELSŐ használat a projektben!)

**Kockázat-jegyzet**: a `status.md` teljes szövegében (23+ szakasz, 2026 júliustól) Realtime SEHOL nem szerepel — ez egy vadonatúj architektúrális felület a projektben, alaposan letesztelendő implementáció közben (RLS-szel kombinált `postgres_changes` szűrés némileg trükkös tud lenni: a `filter` paraméter csak EGYENLŐSÉG-alapú szűrést támogat megbízhatóan, és a Realtime szerver a saját, néha késleltetett publikáció-frissítési ciklusán megy át egy új tábla hozzáadásakor).

- A `qr_uploads` táblát fel kell venni a `supabase_realtime` publikációba (`alter publication supabase_realtime add table public.qr_uploads;` — implementáció idején migrációval VAGY Dashboard-kapcsolóval, a projekt eddigi "MCP `apply_migration`" konvenciója szerint).
- A desktop (`QrUploadPanel.tsx`, lásd 5.6 pont) a saját, hitelesített supabase-js kliensével (`createClient()` a `@/lib/supabase/client`-ből, ugyanaz, mint `InspectionWizard.tsx` `handleSubmit`-ja) feliratkozik:
  ```ts
  supabase
    .channel(`qr-uploads-${token}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qr_uploads', filter: `session_token=eq.${token}` }, (payload) => { /* append to wizard state */ })
    .subscribe();
  ```
  Ez a hitelesített felhasználó saját `organization_id`-jára szűkített RLS SELECT policy-n keresztül fut — más szervezet feltöltése SOSE érkezhet meg ezen a csatornán, MÉG akkor sem, ha valaki (elméletileg) kitalálná egy másik szervezet `session_token`-jét, mert a `qr_uploads_select_org` policy az `organization_id`-t is ellenőrzi.
- **Dokumentált fallback, HA a Realtime implementáció közben megbízhatatlannak bizonyul**: egyszerű kliens-oldali polling (`setInterval`, kb. 3 másodpercenként `GET /api/qr-upload/session/{token}/items`, amíg a panel nyitva van) — a felhasználó explicit Realtime-ot kért ("azonnal, élőben (Supabase Realtime)"), ez MARAD az elsődleges terv, de a pollos fallback dokumentálva van, ha a kódolás során technikai akadály merülne fel.

### 5.5. Telefon-oldali publikus oldal — `app/qr-upload/[token]/page.tsx`

- **Design rendszer: Linear** (`linear.md`) — ahogy a felhasználó a kérésében maga is levezette: a PROJEKT_INSTRUKCIOK.md 4.2 pontja explicit "fotófeltöltés"-t sorol a Linear ("Szakértői Munkaterület") kategóriába, NEM a BMW (publikus ügyfélriport) alá — annak ellenére, hogy ez az oldal bejelentkezés nélkül nyílik meg, a KONTEXTUSA (a szakértő terepi munkafolyamatának egy kiterjesztése, nem az ügyfélnek szánt riport) dönt, nem az auth-állapot. **Ez a terv elfogadja ezt az indoklást, nem nyitott kérdés.**
- Betöltéskor `GET /api/qr-upload/[token]` — érvénytelen/lejárt tokennél egyértelmű üzenet ("A link lejárt vagy érvénytelen — kérj újat a szakértőtől"), NEM egy törött/üres oldal.
- Fájlválasztó `capture` attribútummal (`<input type="file" accept={videoAllowed ? "image/*,video/*" : "image/*"} capture="environment" />`) — ez natívan felkínálja a "Fénykép/videó készítése" ÉS "Fotókönyvtár" opciót is (a projekt `status.md` 2272-2293. szakaszaiban már dokumentált, jól bevált mobil-böngésző minta, amit a `DefectMediaUpload.tsx` is használ).
- Videónál: ugyanaz a `compressVideoForUpload()` fut (lásd 3.2/3), majd `uploadInspectionMedia({ authMode: { type: 'qrToken', token } })`.
- Sikeres feltöltés UTÁN a `confirm` végpont hívása (lásd 5.3), majd a feltöltött elem megjelenik EGY, a telefonon is látható "Feltöltve" listában (visszajelzés a szakértőnek a telefonon is, hogy tudja, mikor fejezte be és teheti el a telefont).
- **Nincs bejelentkezés, nincs navigáció más oldalra** — ez egy önálló, minimális, "csak feltöltés" felület.

### 5.6. Desktop-oldali integráció — `QrUploadButton.tsx` + `QrUploadPanel.tsx`

- **"Feltöltés telefonról" gomb** a `StepGeneralPhotos.tsx` fájlválasztója MELLETT, ÉS minden `DefectMediaUpload.tsx` kártya mellett (`StepDefects.tsx`-ben, a 256-261. sorban lévő `<DefectMediaUpload />` hívás mellé) — Tailwind `hidden md:flex` reszponzív osztállyal, a felhasználó explicit kérése szerint (NEM user-agent sniffelés).
- Kattintásra: `POST /api/qr-upload/session` a megfelelő `target`-tel (`'general'` VAGY `` `defect:${defect.clientId}` ``), majd egy panel/popover nyílik a `qrcode` npm csomaggal kliens-oldalon renderelt QR-kóddal (data URL `<img>`, nincs szerver-oldali képgenerálás) + a Realtime-feliratkozás (5.4 pont) elindul.
- Beérkező elemnél (`qr_uploads` INSERT) a wizard state a **MEGLÉVŐ, `draftPersistence.ts`-ben már kezelt "már feltöltött Storage URL, `file: null`" alakba** illeszti be az új elemet — PONTOSAN úgy, ahogy egy piszkozat-szerkesztésnél egy korábban feltöltött kép viselkedik (`previewUrl` = a Storage publikus URL, `file` = `null`) — **nincs új adatstruktúra**, a felhasználó explicit kérése szerint. `general` targetnél: `setGeneralPhotos([...generalPhotos, { clientId: crypto.randomUUID(), file: null, previewUrl: mediaUrl }])`. `defect:<clientId>` targetnél: a megfelelő `DefectState`-et frissíti `updateDefect(clientId, { file: null, previewUrl: mediaUrl })`-vel (a meglévő `StepDefects.tsx` `updateDefect` függvénye).
- A panel bezárásakor (vagy a wizard-lépés elhagyásakor) a Realtime-feliratkozás leiratkozik (`channel.unsubscribe()`), a session TOVÁBBRA IS érvényes marad `expires_at`-ig (a felhasználó visszatérhet, újranyithatja a panelt — bár a v1-ben az egyszerűség kedvéért egy ÚJ gombnyomás egyszerűen ÚJ session-t hoz létre, nem próbálja visszaállítani a régit, lásd 8. pont).

## 6. Csomag-jogosultsági kikényszerítés (mindkét funkcióra)

### 6.1. Forrás igazság: `user_credits.plan_tier`

Lásd 2. pont — élőben megerősítve, hogy a duplikáció (`profiles.plan_tier` vs. `user_credits.plan_tier`) MÉG FENNÁLL. **Minden videó-jogosultsági döntés `getOrganizationQuotaBalance(organizationId).planTier`-en (`lib/quotas.ts`) alapul**, `planTier === 'pro' || planTier === 'business'`. A `profiles.plan_tier`-hez (`lib/credits.ts` `getUserPlanTier`) **NEM szabad hozzányúlni** ehhez a döntéshez.

### 6.2. Szerver-oldali kikényszerítés (elsődleges védelmi vonal)

A 4.4/5.3 pontban leírt aláírt-URL-kiadó végpontok (`media-upload-url`, mindkét variáns) MIELŐTT bármilyen tokent kiadnának, videó MIME-típusnál ellenőrzik a plan_tier-t — `403` (`{ success: false, code: 'VIDEO_REQUIRES_PRO_PLAN' }`) Free/Starter/Growth esetén. **Ez a fő védelmi vonal**, mert a kép-feltöltéssel ellentétben a videó MINDIG ezen az ágon megy át (lásd 4.3 pont), tehát ez a kapu SOSE megkerülhető pusztán a `accept` attribútum kliens-oldali módosításával.

### 6.3. Kliens-oldali UX — új `VideoUpsellModal`/`VideoUpsellProvider`

**Kövesse 1:1 a meglévő `InsufficientCreditsModal.tsx`/`InsufficientCreditsProvider.tsx` mintát** (a felhasználó explicit kérése) — `components/credits/VideoUpsellModal.tsx` + `VideoUpsellProvider.tsx`, a gyökér layoutban (`app/layout.tsx`) a meglévő `InsufficientCreditsProvider` MELLÉ (nem helyette) felvéve. `useVideoUpsell().notifyVideoUpsell()` bárhonnan hívható. A modal szövege: *"A videó-csatolás a Profi és Business csomagoknál érhető el. Válts csomagot a Beállítások > Előfizetés oldalon."*, "Ugrás az Előfizetéshez" gombbal `/settings/billing`-re (csak Menedzsernek, ugyanaz a szerepkör-tudatos elrejtés, mint az `InsufficientCreditsModal`-nál — `/api/quotas/summary` már ma is visszaadja a szerepkört).
- **UX-döntés (a felhasználó explicit felvetette mindkét opciót, lásd 8. pont)**: ez a terv a **"látszik, de kattintásra upsell"** irányt javasolja (jobb konverzió, ahogy a felhasználó is preferálta) — a videó-opció (fájlválasztó `accept`-je VAGY egy külön "Videó csatolása" gomb) MINDIG látszik, de nem-jogosult szervezetnél kattintás/kiválasztás esetén azonnal `notifyVideoUpsell()` fut, a fájl NEM kerül kiválasztásra/tömörítésre.
- A **QR-telefon-oldalon** nincs "Ugrás az Előfizetéshez" link értelme (nincs bejelentkezés) — ott a `videoAllowed: false` esetén egyszerűen `accept="image/*"` (csak kép), egy rövid, nem-kattintható magyar szöveggel: *"Videó-feltöltés csak Profi/Business csomagnál elérhető — kérd meg a szakértőt, hogy váltson csomagot a Beállításokban."*

### 6.4. RLS második védelmi vonal (`storage.objects`) — csak a KÖZVETLEN, hitelesített útra releváns

Fontos, PONTOS architektúrális megjegyzés, amit a felhasználó "ha van rá kapacitásod" kérésére válaszul tisztázni kell: a `createSignedUploadUrl()`-t a szerver **admin (service-role) kliensen** keresztül hívja (lásd 4.4/5.3) — a service-role **megkerüli az RLS-t**, tehát egy `storage.objects` szintű videó-check a signed-URL-es ágon **NEM releváns védelem** (azt az ágat kizárólag az alkalmazás-kódos 6.2 pont védi). A `storage.objects` RLS-bővítés **kizárólag** azt az elméleti rést zárja be, hogy egy Growth-előfizető szakértő a SAJÁT, bejelentkezett Supabase-session-jével, a wizard kódját megkerülve, KÖZVETLENÜL hívja a `supabase.storage.from('inspection-media').upload(...)`-ot egy videó fájllal (ez MA, a jelenlegi policy-kkel simán sikerülne, mert a policy csak a `{userId}/...` mappa-tulajdonlást nézi, MIME-típust nem). Ezért:
```sql
create or replace function public.current_user_can_upload_video()
returns boolean
language sql
security definer
stable
set search_path = 'public'
as $$
  select coalesce(
    (select plan_tier in ('pro', 'business')
     from public.user_credits
     where organization_id = public.current_user_organization_id()),
    false
  );
$$;

-- inspection_media_authenticated_upload / _update policy with_check bővítése:
--   ... AND (NOT (name ~* '\.(mp4|mov|webm|m4v|avi)$') OR public.current_user_can_upload_video())
```
Ez a policy-bővítés **csak a közvetlen, hitelesített JWT-s feltöltési utat érinti** — a QR-utat a service-role-os signed-URL miatt NEM, és nem is kell, mert ott a 6.2 pont már a token kiadása ELŐTT blokkol.

## 7. Elfogadási kritériumok (implementáció végén ellenőrizendő)

1. `npx tsc --noEmit` szinkron, egyetlen bash-hívásban, hibamentes (lásd a projekt memóriájában rögzített "sose backgroundolva" szabályt).
2. Egy Free/Starter/Growth szervezet szakértője SEM a wizardból, SEM a QR-telefonos oldalról nem tud videót ténylegesen feltölteni — a `media-upload-url` végpont mindkét variánsa `403`-at ad, ÉS (közvetlen `.upload()` megkerülő kísérletnél) a `storage.objects` policy is elutasítja.
3. Egy Profi/Business szervezetnél egy ~2 perces, natív telefon-felvételű videó a wizardból feltöltve: (a) a megerősítő "vágjuk 90 mp-re?" dialógus megjelenik, (b) vágás után a tömörített fájl ~1280×720, néhány MB-os (nem 20-30+ MB-os natív méret), (c) sikeresen megjelenik a publikus riport `DefectsGallery`/`MediaLightbox` lejátszójában.
4. Egy régi/nem támogatott böngészőben (vagy szimulált `ffmpeg.wasm`-hiba) a videó-tömörítés hibája egyértelmű magyar üzenetet ad, és a fájl **NEM** kerül feltöltésre tömörítetlenül.
5. QR-folyamat kézi tesztje: desktopon "Feltöltés telefonról" → QR beolvasása külön eszközzel → telefonon fotó feltöltése → a kép **Realtime-on keresztül, kézi frissítés NÉLKÜL** megjelenik a desktop wizard adott lépésén (Általános fotók VAGY a helyes hiba-kártya) kb. néhány másodpercen belül.
6. Egy MÁSIK szervezet szakértője (más böngésző-session) NEM tud csatlakozni egy idegen QR-linkkel (lejárt/idegen token → egyértelmű hibaüzenet a telefonon, és a desktop Realtime-csatornáján SOSE jelenik meg idegen szervezet feltöltése).
7. Lejárt (>20 perc) QR-token a telefonon egyértelmű "lejárt link" üzenetet ad, nem törött oldalt.
8. `inspection-media` bucket `file_size_limit` ténylegesen blokkol egy mesterségesen 50 MB feletti feltöltési kísérletet.
9. `status.md` frissítve az új szakasszal, a jelen fájl konvenciója szerint.

## 8. Nyitott döntések a felhasználóval, MIELŐTT a kódolás elkezdődik

- **QR-token "egyszer használatos" pontos jelentése (5.2 pont)**: ez a terv a "session-szintű, első claim dönt, utána a session végéig több fájl is feltölthető ugyanarról a telefonról" értelmezést javasolja. Egyetért-e ezzel a felhasználó, vagy szigorúbb (ténylegesen egy fájl/token, minden fájlhoz új QR) mintát szeretne?
- **Videó célparaméterek (3.1 pont)**: 1280×720 / ~2 Mbps videó + 128 kbps hang / max. 90 mp — a felhasználó saját javaslata, ebben a tervben megerősítve, de implementáció előtt még egy kör egyeztetés javasolt, ha él más preferencia (pl. alacsonyabb bitráta a még kisebb fájlméretért).
- **`file_size_limit` konkrét értéke (4.1 pont)**: 50 MB javasolt — elfogadható, vagy legyen szigorúbb/lazább?
- **Videó-opció megjelenítése nem-jogosult csomagnál (6.3 pont)**: ez a terv a "mindig látszik, kattintásra upsell" irányt javasolja (jobb konverzió) — megerősítendő.
- **`ffmpeg.wasm` pontos csomagverzió + a `COEP: credentialless` tényleges böngésző-kompatibilitása (3.1/3.3 pont)**: implementáció idején friss forrásból ellenőrizendő, ugyanaz a fenntartás, mint a projekt más terveiben a gyorsan változó külső API-knál/csomagoknál.
- **QR-panel újranyitása (5.6 pont)**: v1-ben egy új gombnyomás mindig ÚJ session-t hoz létre (a régi érvényben marad, de a UI nem térne vissza rá) — elfogadható-e ez az egyszerűsítés, vagy legyen a panel újranyitásakor a MÉG érvényes, ugyanahhoz a target-hez tartozó session újrahasznosítva?
- **Realtime megbízhatósága (5.4 pont)**: ez az első Realtime-integráció a projektben — ha implementáció közben megbízhatatlannak bizonyul, a dokumentált polling-fallback (3 mp-enkénti lekérdezés) bevezethető-e helyette/mellette, vagy ragaszkodjunk a tiszta Realtime-hoz és inkább hibakeressünk tovább?
