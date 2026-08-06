# TERV — "Kérdezz az AI-tól" chat a publikus ügyfélriporton (Pro/Business exkluzív)

_Ez egy FEJLESZTÉSI UTASÍTÁS/SPEC volt egy jövőbeli implementációs lépéshez. A felhasználó explicit kérése (2026-08-06): "írj magadnak egy utasítást erre, még ne kezdd el a fejlesztést." Ezt a fájlt kellett elolvasni/követni, amikor a tényleges fejlesztés elindul._

_**MEGVALÓSÍTVA (2026-08-06)** -- lásd `status.md` legfelső szakaszát a teljes megvalósítási jegyzőkönyvért. A 7. pont 2 nyitott döntése (kvóta-modell, GDPR-perzisztencia) `AskUserQuestion`-nel a kódolás MEGKEZDÉSE előtt egyeztetve lett a felhasználóval, a lenti terv ennek megfelelően (A/B pont) valósult meg. A 7. pont 3. (Gemini modell-név `ai.google.dev/pricing`-en való megerősítése) NYITOTT maradt -- a meglévő, éles `gemini-2.0-flash`/`gemini-flash-latest` párt vette át a route. A 6. pont elfogadási kritériumai (kézi tesztek) MÉG NEM lettek élesben végigfuttatva._

## 1. Cél

A publikus ügyfélriport (`/report/[public_token]`, BMW Corporate Design System) kapjon egy interaktív AI chat panelt, ahol a vásárló (a szakit megbízó ügyfél, NEM a szaki) szabad szöveggel kérdezhet a KONKRÉT autó KONKRÉT vizsgálati eredményeiről ("mennyire súlyos ez a gittelt panel a bal hátsó sárvédőn?", "mit jelent, hogy 280 mikron festékvastagság?", "mibe kerülhet nagyjából a fékbetét csere?"). Ez a funkció TISZTÁN Pro és Business csomaghoz kötött üzleti differenciátor -- a szakinak eladható érv, hogy az Ő riportja interaktívabb/prémiumabb, mint egy Starter/Growth csomagos versenytársé.

## 2. Kire vonatkozik (tier-gating)

- Kizárólag `plan_tier IN ('pro', 'business')` szervezetek riportjain jelenik meg a chat UI.
- A `get_public_report(p_token uuid)` SECURITY DEFINER RPC-t bővíteni kell egy `ai_chat_enabled: boolean` mezővel (a szervezet `user_credits.plan_tier`-jéből számolva, SZERVER-oldalon, a publikus RPC-n belül -- a kliens SOSE döntsön erről saját maga, mert egy manipulált frontend-hívás így sem tudná bekapcsolni Starter/Growth riporton).
- Starter/Growth riportokon a chat UI-elem egyáltalán NE renderelődjön (ne "disabled" állapotban látszódjon -- ne adjunk ötletet/reklámot egy funkcióhoz, amit a szaki explicit NEM vásárolt meg, ez később upsell-lehetőségként kezelhető, de ELSŐ körben egyszerűen ne látszódjon).

## 3. Adatkör -- mit "lát" az AI

A chat teljes kontextusa a `get_public_report` RPC által MÁR visszaadott `PublicReportData` (lásd `lib/reports/types.ts`) -- SEMMILYEN más adatforráshoz nem fér hozzá, nincs közvetlen DB-lekérdezés a chat route-ban. Ez eleve biztonságos: a modell fizikailag nem tud más szervezet/más riport adatáról "véletlenül" beszélni, mert a rendszerpromptba KIZÁRÓLAG az adott `public_token`-hez tartozó JSON kerül (autó adatok, festékvastagság-mérések, hibák+leírások, felszereltség, szervizmúlt, diagnosztika, gumiabroncs-adatok, végső szakvélemény).

Rendszerprompt-tervezet (magyar, a végleges szöveg implementációkor finomítandó):
- "Te egy autóvizsgálati riport asszisztense vagy. KIZÁRÓLAG az alábbi JSON-ban szereplő, ehhez a KONKRÉT autóhoz tartozó vizsgálati adatokról válaszolhatsz."
- "Ha a kérdés nem a riport adataihoz kapcsolódik (pl. általános autós tanács, más autó, más téma), udvariasan tereld vissza a beszélgetést a riport tartalmára."
- "Javítási költségre vonatkozó kérdésnél KIZÁRÓLAG durva, tájékoztató jellegű nagyságrendet adj, MINDIG jelezd, hogy ez nem hivatalos árajánlat, és javasold a vizsgálatot végző szakértő vagy egy szerviz megkeresését pontos árért."
- "Ne találj ki adatot, ami nincs a JSON-ban -- ha a kérdésre nincs elég infó a riportban, mondd meg, hogy ez a riport nem tartalmazza ezt az adatot."

## 4. Technikai architektúra

### 4.1. API route
Új, publikus (bejelentkezés NÉLKÜLI) route, pl. `app/api/report-chat/route.ts`, `POST { token: string, message: string, history: {role: 'user'|'model', text: string}[] }`.

- A route ELSŐ lépésben a `token` alapján (ugyanaz a minta, mint a riport-oldal) lekéri a `get_public_report` RPC-t -- ha nincs találat VAGY `ai_chat_enabled === false`, `403`/`404`.
- Mivel Next.js Route Handler-ek statelesek (Vercel serverless), NINCS szerver-oldali, memóriában tartott chat-session -- minden híváskor a kliens küldi vissza a teljes (vagy legutóbbi N üzenetes) beszélgetés-történetet, a szerver ebből építi újra a Gemini multi-turn kontextust (`ai.chats.create({ history })` minta, a `@google/genai` SDK-ban ez natívan támogatott, eddig a projektben sehol nem használt, de a meglévő 5 route egylövéses `generateContent` mintájával azonos SDK-n belül).
- Kövesd a projektben MÁR bevált modell-fallback-lánc mintát (elsődleges modell -> statikus fallback -> `ai.models.list()`-alapú dinamikus biztonsági háló), ugyanúgy, mint az 5 meglévő `/api/ai/*` route-nál.

### 4.2. Modell-választás
A projekt jelenleg (2026-08-06) az 5 meglévő AI route-on a `gemini-2.0-flash` -> `gemini-flash-latest` láncot használja, ami a Google AI Studio ingyenes csomagjában (nincs bankkártya, `GEMINI_API_KEY`) fut. **A chat funkcióhoz a modell-nevet és az aktuális ingyenes-csomag limiteket IMPLEMENTÁCIÓ IDŐPONTJÁBAN kell véglegesíteni** (https://ai.google.dev/pricing ellenőrzésével) -- a Gemini modell-család gyorsan változik (új verziók, kivezetések), egy most rögzített konkrét modellnév a fejlesztés indulásáig elavulhat. Irányelvek:
- Ha van a "Flash-Lite" (vagy azzal ekvivalens, legolcsóbb/leggyorsabb) kategóriájú modell ingyenes csomagban -- azt priorizáld chat-hez, mert sok, rövid oda-vissza váltásból áll, nem egyetlen komplex elemzésből (ellentétben pl. a `generate-summary`-val).
- Ha a Flash-Lite minőség nem elég (pontatlan/félrevezető válaszok élő teszteléskor), essen vissza a normál "Flash" modellre.
- Tartsd meg a projekt meglévő ellenállóképességi mintáját: 2 fix modellnév + 1 dinamikus `models.list()` biztonsági háló, hogy egy jövőbeli Google-oldali kivezetés ne törje el élesben a funkciót (lásd `status.md` 26-29. szakaszait -- ez TÖBBSZÖR okozott már éles hibát ennél a projektnél, amikor egy modellnevet kivezettek).

### 4.3. Kvóta-/költségkontroll -- NYITOTT DÖNTÉS, EGYEZTETENDŐ a felhasználóval implementáció ELŐTT
A meglévő "1 AI-kredit = 1 vizsgálat" modell (`lib/inspectionAiCredit.ts`, `monthly_ai_remaining`/`purchased_ai_remaining`) koncepcionálisan a VIZSGÁLAT-KÉSZÍTÉS fázisára épül, a publikus riport-chat viszont a MÁR PUBLIKÁLT riporthoz, potenciálisan ismeretlen számú, névtelen látogatótól (a vásárló) érkezik -- ez NEM ugyanaz az elszámolási egység. Két lehetséges irány, döntés kell:
- **A) Külön, riportonkénti/napi limit** (pl. napi 20 üzenet / riport, vagy szervezetenkénti havi összesített üzenetszám-plafon) -- EZ AJÁNLOTT, mert egyszerűbb, és nem kavarja össze a meglévő AI-kredit UI-t/mentális modellt a felhasználóknál.
- **B) Beépítés a meglévő AI-kredit poolba** -- bonyolultabb (a szervezet AI-kreditje elfogyhat a saját vizsgálati munkájuktól függetlenül, csak mert sok vásárlói kérdés jött be, ami rossz UX a szakinak).
Akármelyik irány mellett is dönt a felhasználó, a limit-számlálást egy ÚJ SECURITY DEFINER RPC-vel kell megoldani (a `get_public_report` mintájára), mert a hívó NINCS bejelentkezve, `auth.uid()` nem elérhető -- a szervezet-azonosítást a `public_token`-en keresztül kell elvégezni, service-role/SECURITY DEFINER kontextusban.

### 4.4. Visszaélés elleni védelem
- Üzenethossz-limit (pl. max 500 karakter/üzenet).
- Session/riportonkénti üzenetszám-limit (lásd 4.3).
- IP-alapú vagy token-alapú throttling (pl. Vercel Edge Config/Upstash rate-limit, vagy egyszerű DB-alapú számláló -- implementáció idején eldöntendő, mi fér bele egyszerűen a jelenlegi Supabase-only stackbe).
- A rendszerprompt explicit korlátozza a témát (lásd 3. pont) -- ez csökkenti, hogy a publikus végpontot valaki "ingyen ChatGPT"-ként próbálja használni.

## 5. UI terv

- BMW Corporate Design System (0px lekerekítés, `#1c69d4` akció-szín, 700/300 tipográfiai kontraszt) -- lásd `bmw.md` + a meglévő `components/report/*` komponensek stílusát.
- Lebegő/rögzített "Kérdezz az AI szakértőtől" gomb vagy egy dedikált kártya a riport alján (a Defects/Final Assessment szekciók után), kattintásra nyíló chat-panel (nem kell teljes külön oldal).
- Loading állapot Gemini-válaszra várva, hibaállapot (pl. "Jelenleg nem elérhető, próbáld később").
- Kötelező, jól látható disclaimer a panel tetején: "Az AI válaszai tájékoztató jellegűek, a vizsgálatot végző szakértő véleményét nem helyettesítik." (lásd a jogi/pénzügyi tanácsadásra vonatkozó általános elővigyázatosságot -- költségbecslésnél ez különösen fontos).

## 6. Elfogadási kritériumok (implementáció végén ellenőrizendő)

1. Starter/Growth riporton a chat UI egyáltalán nem jelenik meg (sem a gomb, sem a végpont nem hívható eredményesen -- a route is elutasítja, nem csak a UI rejti el).
2. Pro/Business riporton a chat helyesen válaszol a riport konkrét adatai alapján (kézi teszt: legalább 5 különböző kérdéstípus -- festékvastagság-értelmezés, hiba súlyossága, költségbecslés-elutasítás/óvatosság, "nincs ilyen adat a riportban" eset, témán kívüli kérdés visszaterelése).
3. A modell-fallback-lánc élesben tesztelve legalább egy szimulált elsődleges-modell-hiba esetén (ugyanaz a védelmi minta, mint az 5 meglévő route-nál).
4. A kvóta-/rate-limit mechanizmus ténylegesen blokkol egy mesterségesen túlpörgetett teszt-session után.
5. `npx tsc --noEmit` szinkron, egyetlen bash-hívásban, hibamentes.
6. `status.md` frissítve az új szakasszal, a jelen fájl konvenciója szerint.

## 7. Nyitott döntések a felhasználóval, MIELŐTT a kódolás elkezdődik

- 4.3. pont: A) külön riport-chat limit VAGY B) meglévő AI-kredit pool -- melyiket választja a felhasználó?
- Kell-e a beszélgetéseket adatbázisban is perzisztensen tárolni (pl. moderációs/analitikai célból, hogy a szaki lássa, mit kérdeztek az ügyfelei), vagy elég kliens-oldali, session-szintű memória (nem perzisztens, oldal-frissítésnél elvész)?
- Végleges Gemini modell-név + a hozzá tartozó napi/havi ingyenes limit -- implementáció-kori ellenőrzés az `ai.google.dev/pricing` oldalon (2026-08-06-i, kevéssé megbízható, ellentmondásos web-keresési találatok alapján a Flash/Flash-Lite kategória valószínűleg továbbra is ingyenesen elérhető marad, de ezt implementáció idején friss forrásból KELL megerősíteni, nem erre a tervre hagyatkozva).
