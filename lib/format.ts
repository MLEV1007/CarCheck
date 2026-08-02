/**
 * Univerzális formázó helperek (PROJEKT_INSTRUKCIOK.md, "Km-állás ezres elválasztó
 * formázás" + "Naptár választó" lépések). Design-rendszer-független, ezért a `lib/`
 * gyökerében él (`lib/utils.ts` `cn()` mintájára), NEM a `lib/inspections/`-ben --
 * bármely jövőbeli modul (nem csak km-állás) használhatja.
 */

/**
 * Km-állás megjelenítése ezres elválasztóval + "km" felirattal (pl. `84 000 km`) --
 * MINDEN olyan helyen ezt kell használni, ahol egy km-értéket a userhez KÖZVETLENÜL
 * (nem beviteli mezőben) jelenítünk meg: Wizard Áttekintés kártyák, Szervizmúlt
 * Idővonal, `/inspections/[id]` adatlap, Publikus Riport. A `hu-HU` locale
 * (`Intl.NumberFormat`) keskeny nem törhető szóközt használ ezres elválasztóként --
 * ez a magyar tipográfiai szabvány, NEM hiba/whitespace-probléma.
 *
 * `km === 0` EGY VALÓS, megjelenítendő érték (0 km-es, vadonatúj autó) -- ezért a
 * `null`/`undefined`/üres string ellenőrzés explicit módon KIZÁRJA a `0`-t.
 */
export function formatKm(km: number | string | null | undefined): string {
  if (!km && km !== 0) return '';
  const num = typeof km === 'string' ? parseInt(km.replace(/\D/g, ''), 10) : km;
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('hu-HU').format(num) + ' km';
}

/**
 * Ugyanaz a formázás, "km" felirat NÉLKÜL -- Wizard beviteli mezők (Km óra állás a
 * "Autó adatok" lépésen, km óra állás a Szervizmúlt idővonal bejegyzéseknél) élő,
 * ezres-elválasztós MEGJELENÍTÉSÉHEZ, amíg a mögöttes React state továbbra is a nyers
 * számjegy-string marad (`sanitizeOdometer`/`sanitizeServiceMileage`). Ez működik
 * kerekítő-kurzor-kezelés nélkül is, mert a sanitize függvények úgyis eltávolítanak
 * minden nem-számjegy karaktert -- a formázott elválasztó szóközök a következő
 * billentyűleütéskor ártalmatlanul lekopnak az `onChange`-ben.
 */
export function formatKmInput(km: string | null | undefined): string {
  if (!km) return '';
  const digits = km.replace(/\D/g, '');
  if (digits === '') return '';
  const num = parseInt(digits, 10);
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('hu-HU').format(num);
}

/**
 * Szervizmúlt idővonal bejegyzés dátumának megjelenítése (PROJEKT_INSTRUKCIOK.md,
 * "Naptár választó" lépés). Az ÚJ bejegyzések natív HTML5 `<input type="date">`-ből
 * mindig "YYYY-MM-DD" formában érkeznek -- ezeket magyar formában ("2024. 06. 15.")
 * jelenítjük meg. A modul bevezetése előtti/RÉGI bejegyzések (amikor a mező még
 * szabad szöveges volt) "csak év" ("YYYY") formában is tárolva lehetnek -- ezeket
 * változatlanul, évszámként jelenítjük meg, hogy ne vesszen el/torzuljon a korábban
 * rögzített adat. Bármilyen más (nem felismert) formátum esetén a nyers érték jelenik meg.
 */
/**
 * Forint (HUF) összeg megjelenítése ezres elválasztóval + "Ft" felirattal (pl.
 * `1 250 000 Ft`) -- a Végső Szakvélemény & Várható Költségek modul min/max becsült
 * szervizköltség mezőihez, ugyanaz az elv, mint a `formatKm`-nél. `null`/`undefined`/üres
 * string esetén üres stringet ad vissza (a hívó dönti el, mit jelenít meg helyette, pl. "—").
 */
export function formatHuf(amount: number | string | null | undefined): string {
  if (!amount && amount !== 0) return '';
  const num = typeof amount === 'string' ? parseInt(amount.replace(/\D/g, ''), 10) : amount;
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('hu-HU').format(num) + ' Ft';
}

/** Ugyanaz, mint a `formatKmInput` -- "Ft" felirat NÉLKÜL, a Végső Szakvélemény wizard-lépés
 * min/max költség beviteli mezőinek élő, ezres-elválasztós megjelenítéséhez, amíg a mögöttes
 * React state továbbra is a nyers számjegy-string marad (`sanitizeCostAmount`). */
export function formatHufInput(amount: string | null | undefined): string {
  if (!amount) return '';
  const digits = amount.replace(/\D/g, '');
  if (digits === '') return '';
  const num = parseInt(digits, 10);
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('hu-HU').format(num);
}

export function formatServiceDate(raw: string | null | undefined): string {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00`);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
  }
  return raw;
}
