/**
 * Kliens-oldali, 100%-ig ingyenes VIN (alvázszám) felismerés fotóról -- Tesseract.js
 * OCR motorral, AI API-k (és API-kulcsok/díjak) nélkül. A teljes felismerés a
 * felhasználó böngészőjében/telefonján fut le (`components/inspections/wizard/StepCarInfo.tsx`
 * hívja meg "VIN beolvasása fotóról" gombra kattintva).
 *
 * A szabványos VIN pontosan 17 karakter, és SOHA nem tartalmazza az I, O, Q betűket
 * (könnyű összetéveszteni az 1/0-val) -- ezt a `VIN_REGEX` is kikényszeríti, hogy a
 * nyers OCR-szövegből csak valóban érvényes formátumú találat kerüljön kiválasztásra.
 */

import { recognize } from 'tesseract.js';

/** Szabványos VIN minta: 17 karakter, A-H/J-N/P/R-Z betűk (I, O, Q kizárva) + számjegyek. */
const VIN_REGEX = /[A-HJ-NPR-Z0-9]{17}/;

export interface VinOcrResult {
  success: boolean;
  /** A megtalált, nagybetűs 17 karakteres VIN -- csak `success: true` esetén van értéke. */
  vin: string | null;
  /** A Tesseract nyers, fel nem dolgozott kimenete -- hibakereséshez/naplózáshoz. */
  rawText: string;
}

/**
 * A Tesseract nyers OCR-szövegéből kinyeri az első érvényes, 17 karakteres VIN mintát.
 * Az esetleges szóközöket/kötőjeleket (amiket az OCR néha tévesen a karakterek közé
 * illeszt, pl. sorváltás vagy zaj miatt) eltávolítjuk kiértékelés előtt.
 */
export function extractVinFromText(text: string): string | null {
  const cleaned = text.toUpperCase().replace(/[\s-]/g, '');
  const match = cleaned.match(VIN_REGEX);
  return match ? match[0] : null;
}

/**
 * Lefuttatja a Tesseract.js OCR-t a megadott képfájlon (angol nyelvi modellel -- a VIN
 * kizárólag latin betűket/számjegyeket tartalmaz, külön magyar nyelvi csomag nem
 * szükséges), majd a nyers szövegből RegEx-szel kinyeri az érvényes VIN-t.
 *
 * A `recognize()` hívás minden alkalommal saját worker-t hoz létre és le is állítja
 * (`Tesseract.js` beépített viselkedése) -- ez egy alkalmi, egyszeri beolvasáshoz
 * (fotó kiválasztása -> eredmény) a legegyszerűbb, nem igényel worker-életciklus-kezelést
 * a komponensben.
 */
export async function recognizeVinFromImage(imageFile: File): Promise<VinOcrResult> {
  const {
    data: { text },
  } = await recognize(imageFile, 'eng');

  const vin = extractVinFromText(text);
  return {
    success: vin !== null,
    vin,
    rawText: text,
  };
}
