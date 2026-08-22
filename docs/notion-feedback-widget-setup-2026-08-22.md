# Notion-alapú visszajelző widget -- beállítási útmutató

**2026-08-22, frissítve:** a Notion adatbázis már létrehozva/beállítva a Notion MCP
connectorral -- a lenti 1. lépés (Integration Token) és a 3. lépés (adatbázis megosztása
az integrációval) az EGYETLEN, ami még hátravan, és ezt KIZÁRÓLAG te tudod elvégezni (a
Notion Integration Token a saját Notion workspace-edhez tartozik, erre a kódból/session-ből
nincs rálátás -- a Notion MCP connector, amivel az adatbázist építettük, egy MÁSIK,
OAuth-alapú kapcsolat, különbözik attól az Integration Token-től, amit az
`app/api/feedback/route.ts` szerver-kód a `@notionhq/client`-tel használ).

## A kész adatbázis

- Oldal: [Developer Software Feature Tracker](https://app.notion.com/p/2141d261a0aa83d9954901b3703a3cf5) (ezt te hoztad létre egy Notion-sablonból)
- Benne az inline adatbázis, átnevezve: **🎯 CarPass Visszajelzések**
- Adatbázis ID (ez lesz a `NOTION_DATABASE_ID`): `3be1d261a0aa839aa7ed01264d02270b`

Végleges séma (a Notion sablon eredeti mezőiből kiindulva, MCP-vel testre szabva):

| Property neve | Típus | Megjegyzés |
| -------------- | ----------- | ---------- |
| Name | Title | Átnevezve "Feature Name"-ről. |
| Status | **Select** (NEM a Notion beépített "Status" property-típusa) | Opciók: `Új` (minden beküldés ezzel érkezik), `Folyamatban`, `Kész`, `Elutasítva`. Lásd az alábbi "Miért Select, nem Status" szakaszt. |
| Category | Select | Opciók: `Hiba (Bug)`, `Új funkció (Feature)`, `Egyéb` -- lásd `types/feedback.ts` `FEEDBACK_CATEGORY_LABELS`. |
| Description | Text (rich text) | A beküldött leírás szövege. |
| User Email | Text (rich text) | A beküldő email-címe (megjelenítő mező, nem a Notion beépített "Person" típus). |
| Image URL | URL | A csatolt kép publikus Supabase Storage linkje -- csak akkor kerül rá érték, ha a felhasználó csatolt képet. |
| Created time | Created time | A Notion sablonból megmaradt, automatikus, hasznos referencia. |

**Eltávolítva** a sablon eredeti, feleslegessé vált mezői közül: Difficulty, Estimated
Hours, Due Date, User Impact, Priority. **Egy mező maradt, amit NEM sikerült eltávolítani**:
`Target Version` (relation egy másik, a Notion MCP connector számára nem elérhető
adatbázisra -- a Notion API ezt eltávolításkor elutasította: "Cannot update property Target
Version because its related data source is not accessible"). Ártalmatlan, a
`route.ts` sosem ír bele -- ha zavar, a Notion felületén kézzel törölhető (oszlopfejlécre
jobb klikk -> "Delete property").

### Miért Select a "Status", nem a Notion beépített "Status" típusa

A Notion API-n keresztül (MCP-vel élesben leellenőrizve) egy MEGLÉVŐ `status` típusú
property-hez NEM lehet új opciót (pl. "Új") felvenni séma-módosítással -- a rendelkezésre
álló eszköz ehhez a típushoz nem fogad el egyáni opció-listát, csak a Select/Multi-select
típusokhoz. Emiatt a "Status" oszlop itt egy sima **Select** property lett a Notion beépített
Status-board-viselkedése (to-do/in-progress/complete csoportok) helyett -- funkcionálisan
egyenértékű egy Kanban Board nézetnél (lásd lent), csak a "Status" ikon/checkbox-vizuál
hiányzik, sima színes címke van helyette. Az `app/api/feedback/route.ts` ennek megfelelően
`Status: { select: { name: 'Új' } }`-t ír, NEM `{ status: {...} }`-t.

## Board nézet (opcionális, Notionben kézzel)

Az adatbázis jelenleg tábla-nézetben van. Ha Kanban-szerű "Status" oszlopokat szeretnél
(Új / Folyamatban / Kész / Elutasítva), a Notion felületén: adatbázis jobb felső "+" a
nézet-fülek mellett -> "Board" -> "Group by" -> "Status". Ezt a session nem tudta
automatikusan beállítani, mert a nézet-létrehozó eszköz nem volt elérhető ahhoz a
munkamenethez, amiben az adatbázis-sémát módosítottuk.

## Hátralévő lépések (ezeket neked kell elvégezned)

### 1. Notion Integration létrehozása

1. Nyisd meg: <https://www.notion.so/my-integrations>
2. "+ New integration" -> adj neki nevet (pl. "CarPass Visszajelzés"), válaszd ki a
   workspace-et (buildmysite).
3. Capabilities: elég az "Insert content" (write) jogosultság, "Read content" opcionális.
4. Mentés után másold ki az "Internal Integration Secret"-et (`ntn_...` vagy `secret_...`
   kezdetű) -- ez lesz a `NOTION_API_KEY`.

### 2. Az adatbázis megosztása az integrációval

Nyisd meg a "🎯 CarPass Visszajelzések" adatbázist -> jobb felső "..." menü ->
"Connections" (vagy "Add connections") -> válaszd ki a fent létrehozott integrációt.
Enélkül az API `401`/`404`-et ad vissza, még helyes token+ID esetén is -- ez a leggyakoribb
hibaforrás, mert a Notion MCP connector (amivel az adatbázist építettük) és az itt
létrehozandó Integration Token KÉT KÜLÖNBÖZŐ kapcsolat, az egyik hozzáférése nem öröklődik
a másikra.

### 3. Környezeti változók beállítása

Helyi fejlesztéshez másold be a `.env.local`-odba (lásd `.env.local.example`):

```
NOTION_API_KEY=ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=3be1d261a0aa839aa7ed01264d02270b
```

Vercelen: Project -> Settings -> Environment Variables -> mindkettőt "Production" (és ha
szeretnéd, "Preview"/"Development") környezetre bejelölve, majd egy ÚJ deployment (egy már
futó deployment nem veszi fel utólag a módosított változókat -- ugyanaz a figyelmeztetés,
mint a `lib/supabase/admin.ts` `MissingServiceRoleKeyError` JSDoc-jában).

## Supabase Storage bucket

A csatolt kép egy `feedback-attachments` nevű, publikus Supabase Storage bucket-be
töltődik fel (lásd `supabase/migrations/20260822_feedback_widget_storage.sql`) -- ezt már
alkalmaztuk az éles projektre, nincs vele teendőd.

## Ellenőrzés

Miután beállítottad a fenti két környezeti változót és újra deployoltál (vagy `npm run
dev`-et újraindítottad), nyisd meg a Dashboard fejlécének "Visszajelzés" ikonját (vagy
Beállítások > "Visszajelzés" kártya), küldj be egy teszt-visszajelzést, és ellenőrizd, hogy
megjelenik-e egy új sor a "🎯 CarPass Visszajelzések" adatbázisban "Új" státusszal.

Ha `500`-at kapsz "A visszajelző rendszer jelenleg nincs beállítva" üzenettel: hiányzik a
`NOTION_API_KEY`/`NOTION_DATABASE_ID`. Ha `502`-t "Nem sikerült elküldeni a
visszajelzést" üzenettel: nézd meg a szerver logot (Vercel -> Deployments -> Functions) --
tipikusan az 2. lépés hiánya (adatbázis nincs megosztva az integrációval) a hiba oka.
