/**
 * Kliens-oldali, 100%-ig ingyenes VIN (alvázszám) felismerés fotóról -- Tesseract.js
 * OCR motorral, AI API-k (és API-kulcsok/díjak) nélkül. A teljes felismerés a
 * felhasználó böngészőjében/telefonján fut le (`components/inspections/wizard/StepCarInfo.tsx`
 * hívja meg "VIN beolvasása fotóról" gombra kattintva).
 *
 * A szabványos VIN pontosan 17 karakter, és SOHA nem tartalmazza az I, O, Q betűket
 * (könnyű összetéveszteni az 1/0-val) -- ezt a `VIN_REGEX` is kikényszeríti, hogy a
 * nyers OCR-szövegből csak valóban érvényes formátumú találat kerüljön kiválasztásra.
 *
 * PONTOSSÁG-OPTIMALIZÁCIÓ (3 réteg, mert a nyers, feldolgozás nélküli OCR mobiltelefonos
 * fotóknál -- rossz fény, ferde szög, tükröződő fémlemez -- túl sok hibás karaktert adott):
 *  1. Karakter-whitelist a Tesseract worker-en (`tessedit_char_whitelist`) -- a motor eleve
 *     csak a VIN-ábécé karaktereit "látja", nem tévedhet el írásjelre/ékezetes betűre.
 *  2. Kép-előfeldolgozás Canvas-on (`preprocessImageForOcr`): felskálázás, szürkeárnyalatos
 *     konverzió, kontraszt-nyújtás, majd fekete-fehér binarizálás -- a Tesseract sokkal
 *     megbízhatóbban ismeri fel a karaktereket egy nagy kontrasztú, tiszta fekete-fehér
 *     képen, mint egy nyers, színes, esetleg alulexponált fotón.
 *  3. Utófeldolgozás (`extractVinFromText`): a nyers szövegből MINDEN nem alfanumerikus
 *     karaktert eltávolítunk (a Tesseract gyakran "hallucinál" szóközt/sortörést a
 *     karakterek közé), és csak ez a megtisztított string kerül a VIN RegEx elé.
 */

import { createWorker } from 'tesseract.js';

/** Szabványos VIN minta: 17 karakter, A-H/J-N/P/R-Z betűk (I, O, Q kizárva) + számjegyek. */
const VIN_REGEX = /[A-HJ-NPR-Z0-9]{17}/;

/** Ugyanez az ábécé whitelist-formában a Tesseract `tessedit_char_whitelist` paraméteréhez
 * (a motor ettől eleve nem is próbál I/O/Q-t vagy írásjelet felismerni). */
const VIN_CHAR_WHITELIST = '0123456789ABCDEFGHJKLMNPRSTUVWXYZ';

/** A kép felskálázási aránya az előfeldolgozás során -- a Tesseract nagyobb felbontású,
 * élesebb szöveget pontosabban olvas, mint egy kis felbontású telefonfotó-kivágást. */
const PREPROCESS_SCALE = 2;

export interface VinOcrResult {
  success: boolean;
  /** A megtalált, nagybetűs 17 karakteres VIN -- csak `success: true` esetén van értéke. */
  vin: string | null;
  /** A Tesseract nyers, fel nem dolgozott kimenete -- hibakereséshez/naplózáshoz. */
  rawText: string;
}

/**
 * A Tesseract nyers OCR-szövegéből kinyeri az első érvényes, 17 karakteres VIN mintát.
 * Előbb MINDEN nem alfanumerikus karaktert (szóköz, sortörés, írásjel, a Tesseract által
 * "hallucinált" zaj) eltávolítunk, csak utána fut a RegEx a megtisztított stringen --
 * így egy karakterek közé ékelődött szóköz/sortörés sem töri meg az egybefüggő találatot.
 */
export function extractVinFromText(text: string): string | null {
  const cleanText = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const vinMatch = cleanText.match(VIN_REGEX);
  return vinMatch ? vinMatch[0] : null;
}

/**
 * Előkészíti a fotót a Tesseract számára egy láthatatlan (DOM-hoz sosem csatolt) `<canvas>`-on:
 *  1. Felskálázás (`PREPROCESS_SCALE`, alapból 2x) -- nagyobb felbontású szöveg pontosabb OCR-t ad.
 *  2. Szürkeárnyalatos konverzió (luminancia-súlyozott: 0.299R + 0.587G + 0.114B).
 *  3. Kontraszt-nyújtás (min-max stretch) -- egy fakó/alulexponált fotón is a teljes
 *     0-255 tartományt kihasználja a szürkeárnyalat, mielőtt binarizálnánk.
 *  4. Binarizálás (thresholding) a kontraszt-nyújtott kép ÁTLAGÉRTÉKÉHEZ képest -- a betűk
 *     tiszta feketék, a háttér tiszta fehér lesz, ami a Tesseract-nak a legkönnyebben
 *     olvasható bemenet.
 *
 * A visszaadott `HTMLCanvasElement`-et a Tesseract.js közvetlenül elfogadja bemenetként
 * (`ImageLike` típus), nincs szükség Blob/data-URL konverzióra.
 */
function preprocessImageForOcr(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * PREPROCESS_SCALE);
        canvas.height = Math.round(img.naturalHeight * PREPROCESS_SCALE);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('A böngésző nem támogatja a Canvas 2D kontextust.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = imageData;
        const pixelCount = data.length / 4;

        // 1. lépés: szürkeárnyalat kiszámolása + min/max nyilvántartása a kontraszt-nyújtáshoz.
        const gray = new Uint8ClampedArray(pixelCount);
        let min = 255;
        let max = 0;
        for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
          const value = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          gray[p] = value;
          if (value < min) min = value;
          if (value > max) max = value;
        }

        // 2. lépés: kontraszt-nyújtás (min-max stretch) a teljes 0-255 tartományra,
        // majd az átlagérték kiszámolása -- ez lesz a binarizálási küszöb.
        const range = max - min || 1; // nulla osztás elleni védelem (teljesen egyszínű kép esetén)
        let sum = 0;
        const stretched = new Uint8ClampedArray(pixelCount);
        for (let p = 0; p < pixelCount; p += 1) {
          const value = ((gray[p] - min) * 255) / range;
          stretched[p] = value;
          sum += value;
        }
        const threshold = sum / pixelCount;

        // 3. lépés: binarizálás -- a küszöb feletti pixel tiszta fehér, az alatta lévő tiszta fekete.
        for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
          const value = stretched[p] > threshold ? 255 : 0;
          data[i] = value;
          data[i + 1] = value;
          data[i + 2] = value;
          // data[i + 3] (alpha) érintetlen marad.
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Ismeretlen hiba a kép előfeldolgozása közben.'));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('A kép betöltése sikertelen.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Lefuttatja a Tesseract.js OCR-t a megadott képfájlon:
 *  1. Előfeldolgozza a fotót (`preprocessImageForOcr`) -- felskálázás, szürkeárnyalat,
 *     kontraszt-nyújtás, binarizálás.
 *  2. Egy angol nyelvi modellel induló worker-t hoz létre (a VIN kizárólag latin
 *     betűket/számjegyeket tartalmaz, külön magyar nyelvi csomag nem szükséges), és
 *     `tessedit_char_whitelist`-tel a felismerhető karaktereket a VIN-ábécére szűkíti,
 *     mielőtt a felismerés elindulna.
 *  3. A nyers szövegből (`extractVinFromText`) RegEx-szel kinyeri az érvényes VIN-t.
 *
 * A worker-t (a korábbi, `recognize()` kényelmi függvényt használó verzióval szemben)
 * explicit `createWorker`-rel hozzuk létre, mert a whitelist-paraméter beállításához
 * (`setParameters`) szükség van a worker-példányra a felismerés elindítása ELŐTT --
 * a felismerés végén (siker vagy hiba esetén egyaránt) a worker `terminate()`-elődik.
 */
export async function recognizeVinFromImage(imageFile: File): Promise<VinOcrResult> {
  const preprocessedImage = await preprocessImageForOcr(imageFile);

  const worker = await createWorker('eng');
  try {
    await worker.setParameters({ tessedit_char_whitelist: VIN_CHAR_WHITELIST });
    const {
      data: { text },
    } = await worker.recognize(preprocessedImage);

    const vin = extractVinFromText(text);
    return {
      success: vin !== null,
      vin,
      rawText: text,
    };
  } finally {
    await worker.terminate();
  }
}
