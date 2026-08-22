/**
 * Kliens-oldali videó-tömörítés `ffmpeg.wasm`-mel (PLAN_video_qr_upload.md 3. szakasz),
 * MINDEN feltöltött videó (telefonkamera, telefon galéria, asztali fájlválasztó, QR-kódos
 * telefonos feltöltés) ezen a modulon megy át, MIELŐTT a Supabase Storage-ba kerülne. Nincs
 * "csendes" visszaesés a tömörítetlen fájlra, ha a tömörítés BÁRMIÉRT meghiúsul, ez a
 * modul hibát dob, a hívó (`lib/inspections/mediaSelection.ts`) pedig megszakítja a
 * feltöltést, és egyértelmű magyar hibaüzenetet mutat a felhasználónak.
 *
 * **Célparaméterek (a felhasználóval egyeztetve, lásd PLAN_video_qr_upload.md "Nyitott
 * döntések" 5. pontját, "Terv szerinti értékek" lett elfogadva):**
 * - Max. felbontás: 1280px a hosszabb oldalon (kb. 720p), csak KICSINYÍT, sosem nagyít fel.
 * - Videó bitráta: ~2 Mbps, hang: 128 kbps AAC.
 * - Max. hossz: 90 másodperc, ha a kiválasztott videó ennél hosszabb, a hívónak KÜLÖN meg
 *   kell erősíttetnie a felhasználóval a vágást (lásd `mediaSelection.ts`), ez a modul saját
 *   maga SOSE vág csendben.
 *
 * **Motor-betöltés (single- vs. multi-threaded):** a gyorsabb, multi-threaded `@ffmpeg/core-mt`
 * build `SharedArrayBuffer`-t igényel, ami csak "cross-origin isolated" kontextusban érhető
 * el (lásd `next.config.mjs` COOP/COEP fejléceit, `/inspections/*` + `/qr-upload/*`-ra
 * korlátozva). Ha a böngésző `window.crossOriginIsolated !== true` (pl. a fejlécek valamiért
 * nem érvényesülnek, vagy egy régebbi böngésző), az egyszálas `@ffmpeg/core` build-re esünk
 * vissza, ami MINDEN böngészőben működik, csak lassabb. Mindkét build a `postinstall`
 * szkripttel (`scripts/copy-ffmpeg-core.mjs`) kerül a `/public/ffmpeg-core*` alá build-időben.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/** A videó leghosszabb oldala (px) tömörítés UTÁN, lásd a fenti modul-JSDoc-ot. */
export const VIDEO_MAX_DIMENSION = 1280;

/** Cél videó-bitráta kb/s-ban. */
export const VIDEO_BITRATE_KBPS = 2000;

/** Cél hang-bitráta kb/s-ban. */
export const AUDIO_BITRATE_KBPS = 128;

/** Max. megengedett videóhossz másodpercben KÜLÖN felhasználói megerősítés NÉLKÜL, e
 * fölött a hívónak (`mediaSelection.ts`) meg kell kérdeznie a felhasználót, hogy vágja-e
 * a videót erre a hosszra, mielőtt a tömörítés elindulna. */
export const MAX_VIDEO_DURATION_SECONDS = 90;

export interface VideoCompressionProgress {
  phase: 'loading-engine' | 'compressing';
  /** 0 és 1 közötti arány. */
  ratio: number;
  /** Magyar, felhasználónak mutatható állapotszöveg. */
  message: string;
}

export interface CompressVideoOptions {
  /** Ha meg van adva, a tömörített videó ENNYI másodpercre lesz vágva (a videó ELEJÉTŐL),
   * kizárólag a felhasználó explicit megerősítése UTÁN adható meg (lásd `mediaSelection.ts`
   * `MAX_VIDEO_DURATION_SECONDS` melletti trim-megerősítő folyamatát). */
  trimToSeconds?: number;
  onProgress?: (progress: VideoCompressionProgress) => void;
}

export interface CompressedVideoResult {
  blob: Blob;
  durationSeconds: number;
  originalSizeBytes: number;
  compressedSizeBytes: number;
}

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function attemptLoad(instance: FFmpeg, baseURL: string, includeWorker: boolean): Promise<void> {
  const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
  const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
  const loadConfig: { coreURL: string; wasmURL: string; workerURL?: string } = { coreURL, wasmURL };

  if (includeWorker) {
    loadConfig.workerURL = await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript');
  }

  await instance.load(loadConfig);
}

/** Betölti (vagy visszaadja a már betöltött) ffmpeg.wasm motort, lásd a fenti modul-JSDoc
 * "Motor-betöltés" szakaszát a single-/multi-threaded döntési logikáért. Modul-szintű
 * singleton + betöltés-alatti Promise cache-elés, hogy egyidejű (pl. több kártyán egyszerre
 * kiválasztott videó) hívások ne indítsanak több párhuzamos motor-betöltést. */
async function loadFfmpeg(onProgress?: (progress: VideoCompressionProgress) => void): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const instance = new FFmpeg();

    if (process.env.NODE_ENV !== 'production') {
      instance.on('log', ({ message }) => console.debug('[ffmpeg]', message));
    }

    onProgress?.({ phase: 'loading-engine', ratio: 0, message: 'Videó-tömörítő motor betöltése...' });

    const canUseMultiThreaded = typeof window !== 'undefined' && window.crossOriginIsolated === true;

    try {
      if (canUseMultiThreaded) {
        await attemptLoad(instance, '/ffmpeg-core-mt', true);
      } else {
        await attemptLoad(instance, '/ffmpeg-core', false);
      }
    } catch (err) {
      if (canUseMultiThreaded) {
        // Egyszeri, automatikus visszaesés az egyszálas build-re, ha a multi-threaded
        // betöltés bármiért (pl. egy proxy/böngészőbővítmény levágja a COOP/COEP
        // fejléceket) meghiúsulna.
        console.warn('[videoCompression] Multi-threaded ffmpeg betöltés sikertelen, egyszálas motorra váltás:', err);
        try {
          await attemptLoad(instance, '/ffmpeg-core', false);
        } catch (fallbackErr) {
          throw new Error(
            `Nem sikerült betölteni a videó-tömörítő motort: ${
              fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
            }`
          );
        }
      } else {
        throw new Error(
          `Nem sikerült betölteni a videó-tömörítő motort: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    ffmpegInstance = instance;
    return instance;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    // Hiba esetén NEM tartjuk meg a sikertelen Promise-t, egy következő próbálkozás
    // (pl. "Újra" gomb egy hibaüzenet után) friss betöltési kísérletet indíthasson.
    loadPromise = null;
    throw err;
  }
}

/** A fájl kiterjesztése, ha a fájlnévből nem állapítható meg, a MIME típusból tippel,
 * `.mp4`-re esik vissza. Az ffmpeg.wasm virtuális fájlrendszerében a bemeneti fájlnak
 * kiterjesztéssel kell rendelkeznie, hogy a demuxer helyesen ismerje fel a konténer-formátumot. */
function guessInputExtension(file: File): string {
  const fromName = file.name.match(/\.[a-zA-Z0-9]+$/)?.[0];
  if (fromName) return fromName;

  const byMimeType: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'video/x-msvideo': '.avi',
    'video/3gpp': '.3gp',
  };
  return byMimeType[file.type] ?? '.mp4';
}

/** A videó hosszát adja vissza másodpercben, a natív `<video>` elem metaadat-betöltésén
 * keresztül (NEM az ffmpeg.wasm-en, ez lényegesen gyorsabb, mert nem igényli a motor
 * betöltését, és a felhasználónak MÉG a tömörítés elindulása ELŐTT eldönthetjük, hogy kell-e
 * vágás-megerősítést kérni, lásd `MAX_VIDEO_DURATION_SECONDS`). */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';

    videoEl.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      if (!Number.isFinite(videoEl.duration) || videoEl.duration <= 0) {
        reject(new Error('Nem sikerült meghatározni a videó hosszát.'));
        return;
      }
      resolve(videoEl.duration);
    };

    videoEl.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('A videó betöltése sikertelen (hibás vagy nem támogatott formátum).'));
    };

    videoEl.src = objectUrl;
  });
}

/**
 * Tömöríti a megadott videófájlt a fenti célparaméterekre (1280px/2 Mbps/128 kbps AAC MP4),
 * opcionálisan a megadott hosszra vágva. Lásd a modul-JSDoc-ot: BÁRMILYEN hiba esetén dob,
 * SOSE ad vissza a tömörítetlen eredeti helyett bármit.
 */
export async function compressVideo(file: File, options: CompressVideoOptions = {}): Promise<CompressedVideoResult> {
  const { trimToSeconds, onProgress } = options;

  if (!file.type.startsWith('video/')) {
    throw new Error('A megadott fájl nem videó.');
  }

  const ffmpeg = await loadFfmpeg(onProgress);

  const progressHandler = ({ progress }: { progress: number; time: number }) => {
    const ratio = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
    onProgress?.({ phase: 'compressing', ratio, message: `Videó tömörítése... ${Math.round(ratio * 100)}%` });
  };
  ffmpeg.on('progress', progressHandler);

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputName = `input-${uniqueSuffix}${guessInputExtension(file)}`;
  const outputName = `output-${uniqueSuffix}.mp4`;

  try {
    onProgress?.({ phase: 'compressing', ratio: 0, message: 'Videó tömörítése... 0%' });

    await ffmpeg.writeFile(inputName, await fetchFile(file));

    const args = ['-i', inputName];
    if (trimToSeconds && trimToSeconds > 0) {
      args.push('-t', String(trimToSeconds));
    }
    args.push(
      '-vf',
      `scale=w=${VIDEO_MAX_DIMENSION}:h=${VIDEO_MAX_DIMENSION}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-b:v',
      `${VIDEO_BITRATE_KBPS}k`,
      '-maxrate',
      `${VIDEO_BITRATE_KBPS}k`,
      '-bufsize',
      `${VIDEO_BITRATE_KBPS * 2}k`,
      '-c:a',
      'aac',
      '-b:a',
      `${AUDIO_BITRATE_KBPS}k`,
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputName
    );

    const exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) {
      throw new Error(`Az ffmpeg hibakóddal tért vissza (${exitCode}).`);
    }

    const data = await ffmpeg.readFile(outputName);
    if (!(data instanceof Uint8Array) || data.byteLength === 0) {
      throw new Error('A tömörített videó üresen jött létre.');
    }

    // `Uint8Array<ArrayBufferLike>` (ffmpeg.wasm belső típusa) -> sima `Uint8Array` a
    // `BlobPart` típus-elvárásához, a másolás egyben biztonságos védelem is az ellen, hogy
    // az ffmpeg.wasm belső puffere a `deleteFile` hívás után módosuljon a Blob alól.
    const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' });

    const durationSeconds =
      trimToSeconds && trimToSeconds > 0 ? trimToSeconds : await getVideoDuration(file).catch(() => 0);

    return {
      blob,
      durationSeconds,
      originalSizeBytes: file.size,
      compressedSizeBytes: blob.size,
    };
  } catch (err) {
    console.error('[videoCompression] Tömörítési hiba:', err);
    throw new Error(
      'Nem sikerült a videót tömöríteni. Próbálj meg egy rövidebb vagy kisebb felbontású videót feltölteni, vagy próbáld újra.'
    );
  } finally {
    ffmpeg.off('progress', progressHandler);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}
