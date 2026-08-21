'use client';

import { useCallback, useRef, useState } from 'react';
import { useVideoUpsell } from '@/components/credits/VideoUpsellProvider';
import {
  compressVideo,
  getVideoDuration,
  MAX_VIDEO_DURATION_SECONDS,
  type VideoCompressionProgress,
} from '@/lib/inspections/videoCompression';

/** A hívó Step-komponens (`StepGeneralPhotos.tsx`/`StepDefects.tsx`) ez alapján dönti el,
 * milyen felül-úszó (overlay) modalt jelenítsen meg -- lásd `MediaProcessingOverlay.tsx`. */
export type MediaSelectionModalState =
  | { kind: 'none' }
  | { kind: 'trim-confirm'; durationSeconds: number; onConfirm: () => void; onCancel: () => void }
  | { kind: 'progress'; progress: VideoCompressionProgress }
  | { kind: 'error'; message: string; onClose: () => void };

interface UseMediaSelectionOptions {
  /** A hívó szervezet videó-jogosultsága -- egyszer, a wizard szintjén lekérdezve
   * (`/api/quotas/summary`), lásd `InspectionWizard.tsx`. Kliens-oldali UX-gyorsítás (nem
   * kell minden fájlválasztásnál külön hálózati kérést indítani) -- a TÉNYLEGES,
   * kikényszerítő ellenőrzés mindig a szerveren történik a feltöltési token kiadásakor
   * (lásd `lib/inspections/mediaUploadServer.ts` `assertVideoUploadAllowed`), tehát egy
   * elavult/hamis `true` itt legfeljebb egy felesleges tömörítést engedne meg, amit a
   * szerver úgyis elutasítana feltöltéskor. */
  videoAllowed: boolean;
}

/**
 * Megosztott média-kiválasztási/videó-feldolgozási folyamat -- `StepGeneralPhotos.tsx` ÉS
 * `StepDefects.tsx` (a `DefectMediaUpload.tsx`-en keresztül) EGYARÁNT ezt a hook-ot hívja,
 * amikor a felhasználó fájlt választ (akár az asztali fájlválasztóból, akár a QR-kódos
 * telefonos feltöltésből -- ez utóbbi viszont a saját, KÜLÖN, `app/qr-upload/[token]/`
 * oldalán fut, ahol NINCS `useMediaSelection`, mert ott a tömörítés+feltöltés egy egyszerűbb,
 * lineáris folyamat, videó/kép-választás nélküli lépések nélkül). Lásd
 * PLAN_video_qr_upload.md 3. és 6. szakaszát a teljes döntési fáért:
 *
 *   1. Kép -> azonnal visszaadva, NINCS feldolgozás (a meglévő viselkedés VÁLTOZATLAN).
 *   2. Videó, DE a szervezet nem jogosult -> `notifyVideoUpsell()`, a fájl ELUTASÍTVA
 *      (`null`).
 *   3. Videó, jogosult, `MAX_VIDEO_DURATION_SECONDS`-nál rövidebb -> tömörítés, majd a
 *      tömörített `File` visszaadva.
 *   4. Videó, jogosult, DE hosszabb -> a felhasználónak MEG KELL erősítenie a vágást (egy
 *      beágyazott modal-állapoton keresztül, lásd `modalState`) -- "Mégse" esetén a fájl
 *      ELUTASÍTVA, "Vágás és tömörítés" esetén a tömörítés `trimToSeconds:
 *      MAX_VIDEO_DURATION_SECONDS`-szal fut.
 *   5. Bármilyen tömörítési hiba -> hibaüzenet-modal, a fájl ELUTASÍTVA -- SOSE esik vissza a
 *      tömörítetlen eredetire (lásd `videoCompression.ts` modul-JSDoc-ját).
 *
 * A hook maga NEM renderel semmit -- a hívó Step-komponens a visszaadott `modalState`
 * alapján jeleníti meg a folyamatot (`MediaProcessingOverlay.tsx`), hogy a JSX-struktúra
 * (Linear-stílusú kártyák, gombok) a hívónál maradjon, ugyanaz az elv, mint a
 * `useSpeechToText`-nél (`lib/hooks/useSpeechToText.ts`).
 */
export function useMediaSelection({ videoAllowed }: UseMediaSelectionOptions) {
  const { notifyVideoUpsell } = useVideoUpsell();
  const [modalState, setModalState] = useState<MediaSelectionModalState>({ kind: 'none' });

  // Több egymás utáni fájlválasztás (pl. a felhasználó gyorsan rákattint egy másik
  // kártyára, mielőtt az előző tömörítése befejeződne) esetén ez a "generáció"-számláló
  // védi ki, hogy egy KORÁBBI, még futó folyamat callback-je felülírja egy ÚJABB
  // folyamat modal-állapotát.
  const generationRef = useRef(0);

  const selectMediaFile = useCallback(
    (file: File): Promise<File | null> => {
      if (!file.type.startsWith('video/')) {
        return Promise.resolve(file);
      }

      if (!videoAllowed) {
        notifyVideoUpsell();
        return Promise.resolve(null);
      }

      const generation = ++generationRef.current;
      const isCurrent = () => generationRef.current === generation;

      async function runCompression(trimToSeconds: number | undefined): Promise<File | null> {
        try {
          const result = await compressVideo(file, {
            trimToSeconds,
            onProgress: (progress) => {
              if (isCurrent()) setModalState({ kind: 'progress', progress });
            },
          });
          if (isCurrent()) setModalState({ kind: 'none' });
          const outputName = `${file.name.replace(/\.[a-zA-Z0-9]+$/, '')}.mp4`;
          return new File([result.blob], outputName, { type: 'video/mp4' });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Ismeretlen hiba a videó tömörítése közben.';
          if (isCurrent()) {
            setModalState({ kind: 'error', message, onClose: () => setModalState({ kind: 'none' }) });
          }
          return null;
        }
      }

      return (async () => {
        let durationSeconds: number;
        try {
          durationSeconds = await getVideoDuration(file);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Nem sikerült feldolgozni a videót.';
          if (isCurrent()) setModalState({ kind: 'error', message, onClose: () => setModalState({ kind: 'none' }) });
          return null;
        }

        if (durationSeconds <= MAX_VIDEO_DURATION_SECONDS) {
          return runCompression(undefined);
        }

        return new Promise<File | null>((resolve) => {
          setModalState({
            kind: 'trim-confirm',
            durationSeconds,
            onCancel: () => {
              if (isCurrent()) setModalState({ kind: 'none' });
              resolve(null);
            },
            onConfirm: () => {
              if (isCurrent()) setModalState({ kind: 'none' });
              runCompression(MAX_VIDEO_DURATION_SECONDS).then(resolve);
            },
          });
        });
      })();
    },
    [videoAllowed, notifyVideoUpsell]
  );

  return { selectMediaFile, modalState };
}
