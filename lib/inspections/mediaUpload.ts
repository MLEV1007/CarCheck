'use client';

import * as tus from 'tus-js-client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Kliens-oldali Storage-feltöltési szállítási réteg jelölt (signed) tokennel -- lásd
 * PLAN_video_qr_upload.md 4.2 pontját. Az asztali wizard (`InspectionWizard.tsx`
 * `handleSubmit`) EZT hívja videó ÉS 6 MB feletti fájloknál (kis képeknél a meglévő, sima
 * `supabase.storage.from(...).upload()` út VÁLTOZATLAN marad -- lásd a route JSDoc-ját), a
 * QR-kódos telefonos feltöltő oldal (`app/qr-upload/[token]/page.tsx`) pedig MINDEN
 * fájlnál, mert ott sosincs Supabase munkamenet.
 *
 * SZÁNDÉKOSAN NEM importál semmit a `lib/inspections/mediaUploadServer.ts`-ből (az a
 * service-role admin klienst hoz létre, szerver-only titokkal) -- a két modul között
 * egyetlen kapocs az általuk kiadott/felhasznált `{ path, token, projectId }` alak, amit
 * mindkét oldal a saját `MediaUploadTicket` típusával ír le.
 */

/** Ugyanaz az érték, mint `mediaUploadServer.ts` `TUS_CHUNK_SIZE_BYTES`-e (Supabase TUS
 * chunk-méret követelmény, JELENLEG kötelezően 6 MiB) -- itt külön konstansként, lásd a
 * fenti modul-JSDoc indoklását. Egyben a plain-vs-TUS döntési küszöb is: e fölött a fájl
 * MINDIG resumable (TUS) protokollal megy, alatta egyetlen PUT (`uploadToSignedUrl`) elég. */
const TUS_SIZE_THRESHOLD_BYTES = 6 * 1024 * 1024;

export interface MediaUploadTicket {
  path: string;
  token: string;
  projectId: string;
}

export interface UploadWithTicketOptions {
  /** 0-1 közötti arány, a feltöltés előrehaladtával hívva. Kis (plain PUT-os) fájloknál
   * csak egyetlen, `1`-es hívás érkezik a végén (a `uploadToSignedUrl` nem ad
   * részlet-előrehaladást). */
  onProgress?: (ratio: number) => void;
}

/** Dobva, ha a szerver `VIDEO_NOT_ALLOWED`-dal utasítja el a jelölt feltöltési token
 * kérését -- a hívó (`mediaSelection.ts`) ezt elkapva nyitja meg a `VideoUpsellModal`-t. Ez a
 * MÁSODIK védelmi vonal (az ELSŐ a kliens-oldali `videoAllowed` prop általi UI-elrejtés/
 * upsell-kattintás, lásd PLAN_video_qr_upload.md 6. szakaszát) -- akkor is helyesen
 * viselkedik, ha egy elavult kliens-oldali állapot miatt idáig eljutott a hívás. */
export class VideoNotAllowedClientError extends Error {
  readonly code = 'VIDEO_NOT_ALLOWED' as const;
  constructor() {
    super('A videó-csatolás kizárólag Profi és Autóház csomaggal érhető el.');
    this.name = 'VideoNotAllowedClientError';
  }
}

/**
 * Feltölt egy fájlt/Blobot egy MÁR kiadott jelölt tokennel. 6 MB alatt egyetlen PUT-tal
 * (`uploadToSignedUrl`), afölött TUS resumable protokollal (`tus-js-client`, közvetlenül a
 * Supabase `/storage/v1/upload/resumable` endpoint-ja ellen, `x-signature` fejlécben a
 * tokennel -- lásd a Supabase "Resumable Uploads" dokumentációját a "jelölt feltöltési URL
 * tokene az x-signature fejlécbe kerül" mintáról).
 */
export async function uploadWithTicket(
  supabase: SupabaseClient,
  file: File | Blob,
  ticket: MediaUploadTicket,
  options: UploadWithTicketOptions = {}
): Promise<void> {
  if (file.size <= TUS_SIZE_THRESHOLD_BYTES) {
    const { error } = await supabase.storage.from('inspection-media').uploadToSignedUrl(ticket.path, ticket.token, file);
    if (error) {
      throw new Error(`A feltöltés sikertelen: ${error.message}`);
    }
    options.onProgress?.(1);
    return;
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!anonKey) {
    throw new Error('Hiányzó NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY környezeti változó.');
  }

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `https://${ticket.projectId}.storage.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${anonKey}`,
        'x-upsert': 'true',
        'x-signature': ticket.token,
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: 'inspection-media',
        objectName: ticket.path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      chunkSize: TUS_SIZE_THRESHOLD_BYTES,
      onError: (error) => reject(error instanceof Error ? error : new Error(String(error))),
      onProgress: (bytesUploaded, bytesTotal) => {
        options.onProgress?.(bytesTotal > 0 ? bytesUploaded / bytesTotal : 0);
      },
      onSuccess: () => resolve(),
    });

    upload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      })
      .catch(reject);
  });
}

export interface UploadInspectionMediaParams {
  inspectionId: string;
  category: 'general' | 'defect';
  file: File | Blob;
  originalFilename: string;
}

/**
 * Kényelmi wrapper az ASZTALI (hitelesített) wizardhoz -- lekéri a jelölt feltöltési tokent
 * a `/api/inspections/media-upload-url` végponttól (ami a szerver-oldalon ellenőrzi a
 * videó-csomag-jogosultságot, lásd `mediaUploadServer.ts`), majd feltölti vele a fájlt.
 * `InspectionWizard.tsx` `handleSubmit`-je videó ÉS 6 MB feletti fájloknál EZT hívja a
 * meglévő, sima `.upload()` helyett.
 */
export async function uploadInspectionMediaViaServer(
  supabase: SupabaseClient,
  params: UploadInspectionMediaParams,
  options: UploadWithTicketOptions = {}
): Promise<{ path: string; publicUrl: string }> {
  const response = await fetch('/api/inspections/media-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inspectionId: params.inspectionId,
      category: params.category,
      contentType: params.file.type || 'application/octet-stream',
      originalFilename: params.originalFilename,
    }),
  });

  const json = (await response.json().catch(() => null)) as
    | { success: true; path: string; token: string; projectId: string }
    | { success: false; error?: string; code?: string }
    | null;

  if (!response.ok || !json?.success) {
    if (json && !json.success && json.code === 'VIDEO_NOT_ALLOWED') {
      throw new VideoNotAllowedClientError();
    }
    throw new Error((json && !json.success && json.error) || 'Nem sikerült feltöltési jogosultságot szerezni.');
  }

  const ticket: MediaUploadTicket = { path: json.path, token: json.token, projectId: json.projectId };
  await uploadWithTicket(supabase, params.file, ticket, options);

  const { data } = supabase.storage.from('inspection-media').getPublicUrl(ticket.path);
  return { path: ticket.path, publicUrl: data.publicUrl };
}
