/**
 * Kliens-oldali, 100%-ig ingyenes VIN (alvázszám) felismerés fotóról -- Tesseract.js
 * OCR motorral, AI API-k (és API-kulcsok/díjak) nélkül. A teljes felismerés a
 * felhasználó böngészőjében/telefonján fut le (`components/inspections/wizard/StepCarInfo.tsx`
 * hívja meg "VIN beolvasása fotóról" gombra kattintva).
 *
 * A szabványos VIN pontosan 17 karakter, és SOHA nem tartalmazza az I, O, Q betűket
 * (könnyű összetéveszteni az 1/0-val) -- ezt a `VIN_PATTERN` is kikényszeríti.
 *
 * PONTOSSÁG-OPTIMALIZÁCIÓ, 2 KÖRBEN:
 *
 * v1-v2 (kép-előfeldolgozás -- lásd `preprocessImageForOcr`): karakter-whitelist a
 * Tesseract worker-en, Canvas-alapú felskálázás/szürkeárnyalat/kontraszt-nyújtás/
 * binarizálás, és egy egyszerű "tisztítsd meg a teljes szöveget, keresd az első 17
 * karakteres mintát" utófeldolgozás.
 *
 * v3 -- JELÖLT-ALAPÚ KINYERÉS (ez a fájl gerince, mert a v1-v2 "első találat a teljes,
 * összefésült szövegben" logikája hibára hajlamos, ha a fotón MÁS ADATOK IS szerepelnek
 * (pl. teljes forgalmi engedély sok mezővel) -- ott a más mezők karakterei szóköz-eltávolítás
 * után véletlenül is kiadhatnak egy hamis 17 karakteres találatot, ami előbb áll a
 * szövegben, mint a valódi VIN):
 *  1. JELÖLT-GYŰJTÉS SORONKÉNT/SZAVANKÉNT (`extractCandidatesFromPage`) -- a Tesseract
 *     `blocks: true` kimenete szó-/sor-/karakterszintű `confidence` és pozíció-adatot is ad.
 *     Mivel egy VALÓDI VIN karakterei fizikailag egymás mellett, egy sorban vannak, a
 *     jelölteket SORON BELÜL keressük (nem az egész, összefésült oldalszövegben) -- ez
 *     strukturálisan kizárja, hogy két, egymástól távoli dokumentum-mező összecsússzon
 *     egyetlen hamis 17 karakteres találattá.
 *  2. PONTSZÁM-ALAPÚ KIVÁLASZTÁS (`scoreCandidate`) -- minden jelölt kap egy pontszámot a
 *     Tesseract-konfidenciából, egy bónuszból, ha a Tesseract EGYETLEN, egybefüggő "szóként"
 *     ismerte fel (strukturálisan erősebb jel, mint egy több szóból összefésült találat), és
 *     egy bónuszból, ha érvényes az ISO 3779 ellenőrzőszáma (lásd `hasValidVinCheckDigit`).
 *     A LEGMAGASABB PONTSZÁMÚ jelölt nyer -- nem az, amelyik elsőként áll a szövegben.
 *  3. KÉT MENETES FELISMERÉS ELTÉRŐ PSM-MEL (`OCR_PASSES`) -- a Tesseract alapértelmezett
 *     "teljes oldal" szegmentálása (`PSM.AUTO`) egy zsúfolt dokumentumfotónál más eredményt
 *     ad, mint a "szórt szöveg" mód (`PSM.SPARSE_TEXT`); mindkét menetből összegyűjtött
 *     jelöltek közül választunk, hogy egyik mód gyengeségét a másik kompenzálhassa.
 *  4. UTOLSÓ MENTSVÁR (`extractVinFromText`) -- ha egyik menetben sem talált a Tesseract
 *     szó-/sor-szintű struktúrát (pl. a `blocks` váratlanul üres), visszaesünk a korábbi
 *     (v1-v2) "teljes, összefésült szöveg" regex-ellenőrzésére, hogy ne veszítsünk el egy
 *     amúgy sikeres felismerést egy szokatlan Tesseract-szegmentálás miatt.
 */

import { createWorker, PSM } from 'tesseract.js';
import type { Line, Page } from 'tesseract.js';

/** Szabványos VIN-ábécé karakterosztálya: A-H/J-N/P/R-Z betűk (I, O, Q kizárva) + számjegyek. */
const VIN_CHARSET = 'A-HJ-NPR-Z0-9';
/** Egyetlen, első találat kereséséhez (pl. a v1-v2-es "utolsó mentsvár" ághoz). */
const VIN_PATTERN = new RegExp(`[${VIN_CHARSET}]{17}`);
/** Az ADOTT STRING TELJES EGÉSZÉBEN egy érvényes 17 karakteres VIN-forma-e (nem részlet).
 * KRITIKUS: ezt a mintát a jelölt-kinyerés (`extractLineCandidates`) SOSEM egy nagyobb,
 * több szóból összefésült sztringen belüli RÉSZLET-keresésre használja, csak TELJES
 * szó-konkatenációkra -- lásd a `MAX_MERGE_WORDS` kommentjét arról, miért fontos ez. */
const VIN_EXACT_PATTERN = new RegExp(`^[${VIN_CHARSET}]{17}$`);

/** Ugyanez az ábécé whitelist-formában a Tesseract `tessedit_char_whitelist` paraméteréhez
 * (a motor ettől eleve nem is próbál I/O/Q-t vagy írásjelet felismerni). */
const VIN_CHAR_WHITELIST = '0123456789ABCDEFGHJKLMNPRSTUVWXYZ';

/** A kép felskálázási aránya az előfeldolgozás során -- a Tesseract nagyobb felbontású,
 * élesebb szöveget pontosabban olvas, mint egy kis felbontású telefonfotó-kivágást. */
const PREPROCESS_SCALE = 2;

const VIN_LENGTH = 17;
/** A VIN ellenőrzőszáma a 9. karakter -- 0-indexelt tömbben index 8. */
const CHECK_DIGIT_POSITION = 8;

/** Két menetben futtatjuk a felismerést eltérő Page Segmentation Mode-dal (lásd a fájl
 * tetején lévő kommentet, "3. KÉT MENETES FELISMERÉS") -- `AUTO` egy teljes, több mezőt
 * tartalmazó dokumentumfotónál, `SPARSE_TEXT` egy szórt/kevésbé strukturált elrendezésnél
 * (pl. VIN-matrica közeli fotója más háttér-elemekkel) teljesíthet jobban; a kettő közül
 * a jelölt-pontozás dönti el végül, melyik menet eredménye a megbízhatóbb. */
const OCR_PASSES: PSM[] = [PSM.AUTO, PSM.SPARSE_TEXT];

/** Hány EGYMÁS UTÁNI, TELJES Tesseract-szót próbálunk összefűzni a "B szintű" (több szóra
 * darabolt VIN) jelölt-kereséskor -- lásd `extractLineCandidates` kommentjét. Kicsi értéken
 * tartva (egy VIN reálisan legfeljebb 2-3 tokenre eshet szét egy kötőjel/betűköz miatt). */
const MAX_MERGE_WORDS = 3;

/** Bónusz-pontszám, ha a Tesseract a jelöltet EGYETLEN, egybefüggő "szóként" ismerte fel
 * (nem több szó összefésüléséből állt elő) -- strukturálisan erősebb jel, mert egy valódi
 * VIN-t a Tesseract jellemzően egy tokenként szegmentál, míg egy véletlen egybecsúszás
 * több szó/mező határán jön létre. */
const WORD_EXACT_MATCH_BONUS = 15;
/** Bónusz-pontszám érvényes ISO 3779 ellenőrzőszám esetén -- lásd `hasValidVinCheckDigit`
 * dokumentációját arról, miért csak bónusz és nem kizáró feltétel. */
const VALID_CHECK_DIGIT_BONUS = 20;

export interface VinOcrResult {
  success: boolean;
  /** A megtalált, nagybetűs 17 karakteres VIN -- csak `success: true` esetén van értéke. */
  vin: string | null;
  /** A Tesseract nyers, fel nem dolgozott kimenete (mindkét OCR-menetből összefűzve) --
   * hibakereséshez/naplózáshoz. */
  rawText: string;
  /** A választott jelölt 0-100 közötti pontszáma (Tesseract-konfidencia + bónuszok) --
   * jövőbeli UX-finomításhoz (pl. alacsony pontszámnál figyelmeztető toast) hasznos lehet,
   * jelenleg a `StepCarInfo.tsx` nem használja fel közvetlenül. `undefined`, ha a jelölt
   * a "utolsó mentsvár" fallback-ágból származik (ott nincs megbízható Tesseract-konfidencia). */
  score?: number;
  /** Érvényes-e a jelölt ISO 3779 ellenőrzőszáma -- lásd `hasValidVinCheckDigit`. */
  hasValidCheckDigit?: boolean;
}

interface VinCandidate {
  vin: string;
  score: number;
  confidence: number;
  hasValidCheckDigit: boolean;
}

/** ISO 3779 transzliterációs táblázat -- minden betűhöz egy 0-9 közötti számérték tartozik
 * az ellenőrzőszám-számításhoz (a számjegyek önmagukat érik). I/O/Q nem szerepel, mert a
 * VIN-ábécé eleve kizárja őket. */
const VIN_TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
/** ISO 3779 pozíció-súlyok (1-17. karakter) -- a 9. pozíció (index 8, maga az ellenőrzőszám)
 * súlya 0, mert nem vesz részt a saját maga ellenőrzésére szolgáló összegben. */
const VIN_POSITION_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function vinCharValue(char: string): number {
  if (char >= '0' && char <= '9') return Number(char);
  return VIN_TRANSLITERATION[char] ?? 0;
}

/**
 * Kiszámolja, hogy a megadott 17 karakteres string ISO 3779 szerinti ellenőrzőszáma
 * (a 9. karakter) helyes-e. FONTOS: ez a szabvány elsősorban ÉSZAK-AMERIKAI (NHTSA/
 * FMVSS 115) VIN-eknél KÖTELEZŐ előírás -- EURÓPAI (és sok más régióbeli) VIN-eknél NEM
 * garantált, hogy a gyártó ezt a képletet követi. Emiatt ezt a függvényt SOSEM szabad
 * kizáró szűrőként használni (egy érvényes európai VIN-t tévesen elutasítana) -- kizárólag
 * PONTSZÁM-BÓNUSZKÉNT szabad felhasználni több, hasonlóan jó jelölt közötti döntésnél
 * (lásd `scoreCandidate` / `VALID_CHECK_DIGIT_BONUS`).
 */
export function hasValidVinCheckDigit(vin: string): boolean {
  if (!VIN_EXACT_PATTERN.test(vin)) return false;
  let sum = 0;
  for (let i = 0; i < VIN_LENGTH; i += 1) {
    sum += vinCharValue(vin[i]) * VIN_POSITION_WEIGHTS[i];
  }
  const remainder = sum % 11;
  const expectedCheckDigit = remainder === 10 ? 'X' : String(remainder);
  return vin[CHECK_DIGIT_POSITION] === expectedCheckDigit;
}

function cleanForVinMatch(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * A Tesseract nyers OCR-szövegéből kinyeri az első érvényes, 17 karakteres VIN mintát.
 * Ez a v1-v2-es, "teljes szöveg, első találat" logika -- a v3-as jelölt-alapú kinyerés
 * (`extractCandidatesFromPage`) UTOLSÓ MENTSVÁRAKÉNT hívja, ha a Tesseract `blocks`
 * kimenete valamiért nem ad használható szó-/sor-struktúrát.
 */
export function extractVinFromText(text: string): string | null {
  const cleanText = cleanForVinMatch(text);
  const vinMatch = cleanText.match(VIN_PATTERN);
  return vinMatch ? vinMatch[0] : null;
}

function scoreCandidate(vin: string, confidence: number, isWholeWordMatch: boolean): VinCandidate {
  const validCheckDigit = hasValidVinCheckDigit(vin);
  let score = confidence;
  if (isWholeWordMatch) score += WORD_EXACT_MATCH_BONUS;
  if (validCheckDigit) score += VALID_CHECK_DIGIT_BONUS;
  return { vin, score, confidence, hasValidCheckDigit: validCheckDigit };
}

/**
 * Egy Tesseract-sorból (`Line`) gyűjti ki a lehetséges VIN-jelölteket, KÉT szinten:
 *  A) Erős jelölt -- ha egy önálló Tesseract-"szó" (`word.text`, tisztítás után) PONTOSAN
 *     17, engedélyezett VIN-karakterből áll. Ez azt jelenti, hogy a Tesseract MAGA egyetlen,
 *     egybefüggő tokenként ismerte fel -- strukturálisan valószínűtlen, hogy ez más
 *     dokumentum-mezővel véletlenül összecsúszott volna, ezért `WORD_EXACT_MATCH_BONUS`-t kap.
 *  B) Gyengébb jelölt -- LEGFELJEBB `MAX_MERGE_WORDS` EGYMÁS UTÁNI, TELJES szó összefűzése,
 *     arra az esetre, ha a Tesseract feleslegesen több szóra darabolta a VIN-t (pl. egy
 *     kötőjel vagy stilizált betűköz miatt).
 *
 *     KRITIKUS RÉSZLET (kézzel tesztelve, valódi hibát javítva): a B szint SOSEM keres
 *     17 karakteres ablakot egy nagyobb, szóhatárokat figyelmen kívül hagyó, összefésült
 *     sztringben -- CSAK TELJES szavak összefűzését próbálja, és csak akkor fogad el egy
 *     találatot, ha a szavak összessége PONTOSAN 17 karakterre jön ki. Ennek oka: ha egy
 *     címke ("ALVAZSZAM:") közvetlenül a VIN előtt áll UGYANAZON a soron, egy szóhatárokat
 *     figyelmen kívül hagyó részlet-keresés a címke karaktereit ÉS a VIN elejét összevonva
 *     egy HAMIS, eltolt 17 karakteres találatot adna (pl. "ALVAZSZAM" + a VIN első 8
 *     karaktere) -- ezt egy éles teszttel sikerült is reprodukálni a fejlesztés során. A
 *     TELJES szavas összefűzés emiatt sosem "harap bele" egy szó közepébe: ha egy szó
 *     hozzáadása túllépné a 17 karaktert, az adott kezdőpontból induló ablakot elvetjük.
 */
function extractLineCandidates(line: Line): VinCandidate[] {
  const candidates: VinCandidate[] = [];

  for (const word of line.words) {
    const cleanedWord = cleanForVinMatch(word.text);
    if (VIN_EXACT_PATTERN.test(cleanedWord)) {
      candidates.push(scoreCandidate(cleanedWord, word.confidence, true));
    }
  }

  for (let start = 0; start < line.words.length; start += 1) {
    let merged = '';
    let wordCount = 0;
    let confidenceSum = 0;

    for (let end = start; end < Math.min(start + MAX_MERGE_WORDS, line.words.length); end += 1) {
      const cleanedWord = cleanForVinMatch(line.words[end].text);
      if (cleanedWord === '') continue; // pl. puszta írásjel-token ("-", ":") -- kihagyva, de nem törik meg az ablakot

      if (merged.length + cleanedWord.length > VIN_LENGTH) break; // ez a szó már túllépné a 17 karaktert -- ne harapjunk bele

      merged += cleanedWord;
      wordCount += 1;
      confidenceSum += line.words[end].confidence;

      if (merged.length === VIN_LENGTH) {
        // Csak akkor számít találatnak, ha TÖBB szóból állt össze -- az 1 szavas eset
        // már lefutott a fenti "A" szinten (word-exact-match bónusszal).
        if (wordCount > 1 && VIN_EXACT_PATTERN.test(merged)) {
          candidates.push(scoreCandidate(merged, confidenceSum / wordCount, false));
        }
        break; // pontosan 17-nél megállunk -- további szó hozzáadása már csak túllépné
      }
    }
  }

  return candidates;
}

/** Végigmegy a Tesseract `Page` teljes blokk/bekezdés/sor hierarchiáján, és soronként
 * összegyűjti a jelölteket (`extractLineCandidates`). */
function extractCandidatesFromPage(page: Page): VinCandidate[] {
  const candidates: VinCandidate[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        candidates.push(...extractLineCandidates(line));
      }
    }
  }
  return candidates;
}

/** Ugyanaz a VIN több helyen/menetben is előkerülhet (pl. mindkét PSM-menet megtalálja,
 * vagy egy szó-szintű ÉS egy sor-szintű jelölt is ugyanarra a VIN-re fut ki) -- ilyenkor a
 * legmagasabb pontszámú előfordulást tartjuk meg, hogy a végső listában minden VIN egyszer
 * szerepeljen a rá vonatkozó legjobb bizonyítékkal. */
function dedupeCandidates(candidates: VinCandidate[]): VinCandidate[] {
  const bestByVin = new Map<string, VinCandidate>();
  for (const candidate of candidates) {
    const existing = bestByVin.get(candidate.vin);
    if (!existing || candidate.score > existing.score) {
      bestByVin.set(candidate.vin, candidate);
    }
  }
  return [...bestByVin.values()];
}

function pickBestCandidate(candidates: VinCandidate[]): VinCandidate | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, current) => (current.score > best.score ? current : best));
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
 * Lefuttatja a Tesseract.js OCR-t a megadott képfájlon, és a legjobb VIN-jelöltet adja
 * vissza (lásd a fájl tetején lévő "v3 -- JELÖLT-ALAPÚ KINYERÉS" komment a teljes
 * algoritmusról):
 *  1. Előfeldolgozza a fotót (`preprocessImageForOcr`).
 *  2. Egy angol nyelvi modellel induló, whitelist-elt worker-t hoz létre.
 *  3. Két menetben lefuttatja a felismerést eltérő PSM-mel (`OCR_PASSES`), mindkét
 *     menetből `blocks: true` kimenettel (szó-/sor-/karakterszintű konfidencia+pozíció).
 *  4. Minden menet minden sorából jelölteket gyűjt (`extractCandidatesFromPage`),
 *     deduplikálja (`dedupeCandidates`), és a legmagasabb pontszámú jelöltet választja
 *     (`pickBestCandidate`).
 *  5. Ha egyik menet sem adott jelöltet, az összefésült nyers szövegen még lefut az
 *     "utolsó mentsvár" `extractVinFromText`.
 *
 * A worker a végén (siker vagy hiba esetén egyaránt) `terminate()`-elődik.
 */
export async function recognizeVinFromImage(imageFile: File): Promise<VinOcrResult> {
  const preprocessedImage = await preprocessImageForOcr(imageFile);

  const worker = await createWorker('eng');
  try {
    await worker.setParameters({ tessedit_char_whitelist: VIN_CHAR_WHITELIST });

    const allCandidates: VinCandidate[] = [];
    const rawTextParts: string[] = [];

    for (const psm of OCR_PASSES) {
      // eslint-disable-next-line no-await-in-loop -- a két menetnek szándékosan
      // szekvenciálisan kell futnia, mindkettő ugyanazt a worker-példányt használja.
      await worker.setParameters({ tessedit_pageseg_mode: psm });
      // eslint-disable-next-line no-await-in-loop
      const { data } = await worker.recognize(preprocessedImage, {}, { blocks: true, text: true });
      rawTextParts.push(data.text);
      allCandidates.push(...extractCandidatesFromPage(data));
    }

    const rawText = rawTextParts.join('\n---\n');
    const deduped = dedupeCandidates(allCandidates);
    let best = pickBestCandidate(deduped);

    // Utolsó mentsvár: ha egyik menet sem adott szó-/sor-szintű jelöltet (pl. a `blocks`
    // váratlanul üres egy szokatlan elrendezésű fotónál), essünk vissza a v1-v2-es,
    // "teljes összefésült szöveg, első találat" logikára.
    if (!best) {
      const fallbackVin = extractVinFromText(rawText);
      if (fallbackVin) {
        best = { vin: fallbackVin, score: 0, confidence: 0, hasValidCheckDigit: hasValidVinCheckDigit(fallbackVin) };
      }
    }

    return {
      success: best !== null,
      vin: best ? best.vin : null,
      rawText,
      score: best?.score,
      hasValidCheckDigit: best?.hasValidCheckDigit,
    };
  } finally {
    await worker.terminate();
  }
}
