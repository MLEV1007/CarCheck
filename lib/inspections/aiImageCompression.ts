/**
 * Megosztott kliens-oldali kép-tömörítő segédfüggvény MINDEN fotó-alapú Gemini Vision
 * AI-funkcióhoz (`StepCarInfo.tsx` "Forgalmi vagy Alvázszám beszkennelése", `StepServiceHistory.tsx`
 * "Szervizbejegyzés beolvasása AI-val" stb.), korábban `compressImageForAiScan` néven
 * KIZÁRÓLAG a `StepCarInfo.tsx`-ben élt, duplikálva lett volna a második fotó-alapú AI-funkció
 * (`/api/ai/scan-service-doc`) bevezetésekor, ezért ide, egy megosztott helyre került (2026-08-06,
 * "Szervizbejegyzés AI-beolvasás" lépés), `StepCarInfo.tsx` mostantól is EZT importálja,
 * nincs önálló, saját másolata többé.
 *
 * **Miért kellett ez a lépés:** a Vercel Serverless Function-ök request body mérete (a
 * JSON+Base64 kép EGYÜTT) egy kb. 4,5 MB-os, a platform által kikényszerített, nem
 * konfigurálható felső korláttal rendelkezik. Egy natív telefonfotó (jellemzően 2-8 MB,
 * ráadásul Base64 kódolással +33% méretnövekedéssel) simán túllépi ezt, ilyenkor a kérés
 * MÉG A ROUTE MEGHÍVÁSA ELŐTT, Vercel-infrastruktúra szinten elutasításra kerül egy `413`-as
 * (vagy HTML-hibaoldalas, NEM JSON) válasszal. A kliens-oldali tömörítés megelőzi ezt: egy
 * 1600px-es, 0,82 minőségű JPEG szinte mindig jóval 1 MB alatt marad.
 */

/** A kép leghosszabb oldala (px) tömörítés UTÁN, egy Forgalmi Engedély/VIN-matrica/
 * szervizkönyv-oldal szövege bőven olvasható marad ekkora felbontáson is, miközben a
 * fájlméret drasztikusan csökken egy natív telefonfotóhoz (gyakran 3000-4000px+ oldalhosszal)
 * képest. */
export const AI_SCAN_MAX_DIMENSION = 1600;

/** JPEG tömörítési minőség (0-1), 0.82 jó kompromisszum: a szöveg élesen olvasható marad
 * OCR/AI-elemzéshez, a fájlméret mégis a töredéke egy tömörítetlen fotónak. */
export const AI_SCAN_JPEG_QUALITY = 0.82;

/**
 * A kiválasztott fotót Canvas-szal átméretezi (leghosszabb oldal max. `AI_SCAN_MAX_DIMENSION`
 * px-re) és JPEG-ként újratömöríti (`AI_SCAN_JPEG_QUALITY`), mielőtt Base64 data URL-lé
 * alakítaná egy `/api/ai/*` Vision route-nak küldött kéréshez, lásd a fenti fájl-JSDoc-ot.
 */
export function compressImageForAiScan(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const scale = Math.min(1, AI_SCAN_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('A böngésző nem támogatja a Canvas 2D kontextust.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', AI_SCAN_JPEG_QUALITY));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Ismeretlen hiba a kép tömörítése közben.'));
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
