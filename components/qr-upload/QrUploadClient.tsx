'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, ImagePlus, Loader2, Video, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { uploadWithTicket, type MediaUploadTicket } from '@/lib/inspections/mediaUpload';
import {
  compressVideo,
  getVideoDuration,
  MAX_VIDEO_DURATION_SECONDS,
  type VideoCompressionProgress,
} from '@/lib/inspections/videoCompression';

interface QrUploadClientProps {
  token: string;
}

type ResolveState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; inspectionId: string; target: string; videoAllowed: boolean; claimSecret: string };

interface UploadItem {
  id: string;
  kind: 'photo' | 'video';
  previewUrl: string;
  status: 'processing' | 'uploading' | 'done' | 'error';
  progressLabel: string;
  progressRatio: number;
  errorMessage?: string;
}

const SESSION_STORAGE_PREFIX = 'carpass:qr-upload:';

function readStoredClaimSecret(token: string): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_PREFIX + token);
  } catch {
    return null;
  }
}

function storeClaimSecret(token: string, claimSecret: string): void {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_PREFIX + token, claimSecret);
  } catch {
    // Csendben elnyelve -- lásd draftPersistence.ts azonos elvű hibakezelését. Legrosszabb
    // esetben egy oldal-frissítés a "lejárt/foglalt" hibaágba fut, a felhasználó pedig
    // újranyithatja a QR-kódot az asztali gépen.
  }
}

/**
 * A QR-kódos telefonos feltöltő oldal kliens-oldali logikája -- lásd
 * `app/qr-upload/[token]/page.tsx` JSDoc-ját a teljes kontextusért. Feloldja a session-t
 * (`resolve_qr_upload_session` RPC-n keresztül, `/api/qr-upload/[token]`), majd fotót/videót
 * fogad kamerából vagy galériából, a videót ugyanazzal a `videoCompression.ts` motorral
 * tömöríti, mint az asztali wizard, végül a `mediaUpload.ts` szállítási réteggel tölti fel
 * és a `/confirm` végponton keresztül jelenti be -- ez utóbbi triggereli a Realtime
 * broadcastot, amitől a feltöltés ÉLŐBEN megjelenik az asztali wizardban.
 */
export function QrUploadClient({ token }: QrUploadClientProps) {
  const [resolveState, setResolveState] = useState<ResolveState>({ status: 'loading' });
  const [items, setItems] = useState<UploadItem[]>([]);
  const supabaseRef = useRef(createClient());
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const storedClaimSecret = readStoredClaimSecret(token);
      const url = new URL(`/api/qr-upload/${token}`, window.location.origin);
      if (storedClaimSecret) url.searchParams.set('claimSecret', storedClaimSecret);

      try {
        const response = await fetch(url.toString());
        const json = await response.json().catch(() => null);

        if (cancelled) return;

        if (!response.ok || !json?.success) {
          setResolveState({
            status: 'error',
            message: json?.error ?? 'A link lejárt, vagy már egy másik eszközön van megnyitva.',
          });
          return;
        }

        const claimSecret: string = json.claimSecret ?? storedClaimSecret;
        if (json.claimSecret) storeClaimSecret(token, json.claimSecret);

        if (!claimSecret) {
          setResolveState({ status: 'error', message: 'Nem sikerült megerősíteni a feltöltési munkamenetet.' });
          return;
        }

        setResolveState({
          status: 'ready',
          inspectionId: json.inspectionId,
          target: json.target,
          videoAllowed: Boolean(json.videoAllowed),
          claimSecret,
        });
      } catch (err) {
        if (!cancelled) {
          setResolveState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Nem sikerült betölteni a feltöltési oldalt.',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const processFile = useCallback(
    async (file: File, kind: 'photo' | 'video', claimSecret: string) => {
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setItems((prev) => [
        ...prev,
        { id, kind, previewUrl, status: 'processing', progressLabel: 'Feldolgozás...', progressRatio: 0 },
      ]);

      try {
        let uploadFile: File | Blob = file;

        if (kind === 'video') {
          const durationSeconds = await getVideoDuration(file);
          let trimToSeconds: number | undefined;

          if (durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
            const confirmed = window.confirm(
              `A videó ${Math.round(durationSeconds)} másodperc hosszú. A feltölthető videók legfeljebb ` +
                `${MAX_VIDEO_DURATION_SECONDS} másodpercesek lehetnek -- vágjuk a videó ELEJÉT erre a hosszra?`
            );
            if (!confirmed) {
              setItems((prev) => prev.filter((item) => item.id !== id));
              URL.revokeObjectURL(previewUrl);
              return;
            }
            trimToSeconds = MAX_VIDEO_DURATION_SECONDS;
          }

          const onProgress = (progress: VideoCompressionProgress) => {
            updateItem(id, { progressLabel: progress.message, progressRatio: progress.ratio });
          };
          const result = await compressVideo(file, { trimToSeconds, onProgress });
          uploadFile = result.blob;
        }

        updateItem(id, { status: 'uploading', progressLabel: 'Feltöltés...', progressRatio: 0 });

        const ticketResponse = await fetch(`/api/qr-upload/${token}/media-upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claimSecret,
            contentType: kind === 'video' ? 'video/mp4' : file.type || 'image/jpeg',
            originalFilename: file.name,
          }),
        });
        const ticketJson = await ticketResponse.json().catch(() => null);
        if (!ticketResponse.ok || !ticketJson?.success) {
          throw new Error(ticketJson?.error ?? 'Nem sikerült feltöltési jogosultságot szerezni.');
        }

        const ticket: MediaUploadTicket = {
          path: ticketJson.path,
          token: ticketJson.token,
          projectId: ticketJson.projectId,
        };

        await uploadWithTicket(supabaseRef.current, uploadFile, ticket, {
          onProgress: (ratio) => updateItem(id, { progressLabel: 'Feltöltés...', progressRatio: ratio }),
        });

        const confirmResponse = await fetch(`/api/qr-upload/${token}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claimSecret, path: ticket.path, mediaType: kind }),
        });
        const confirmJson = await confirmResponse.json().catch(() => null);
        if (!confirmResponse.ok || !confirmJson?.success) {
          throw new Error(confirmJson?.error ?? 'Nem sikerült megerősíteni a feltöltést.');
        }

        updateItem(id, { status: 'done', progressLabel: 'Sikeresen feltöltve', progressRatio: 1 });
      } catch (err) {
        updateItem(id, {
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Ismeretlen hiba a feltöltés közben.',
        });
      }
    },
    [token, updateItem]
  );

  function handleFiles(fileList: FileList | null, kind: 'photo' | 'video') {
    if (!fileList || fileList.length === 0 || resolveState.status !== 'ready') return;
    const claimSecret = resolveState.claimSecret;
    Array.from(fileList).forEach((file) => {
      void processFile(file, kind, claimSecret);
    });
  }

  if (resolveState.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-linear-primary" />
      </div>
    );
  }

  if (resolveState.status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-linear-canvas px-6 text-center">
        <XCircle className="h-10 w-10 text-red-400" />
        <p className="text-[16px] font-semibold text-linear-ink">Nem sikerült megnyitni a feltöltést</p>
        <p className="max-w-sm text-[13px] text-linear-ink-subtle">{resolveState.message}</p>
        <p className="max-w-sm text-[12px] text-linear-ink-subtle">
          Kérd meg a szakértőt, hogy generáljon egy új QR-kódot a vizsgálati űrlapon.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-canvas px-4 pb-10 pt-6">
      <div className="mx-auto max-w-md">
        <h1 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Feltöltés telefonról</h1>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Készíts fotót{resolveState.videoAllowed ? ' vagy videót' : ''}, vagy válassz a galériából -- a feltöltés
          automatikusan megjelenik a szakértő képernyőjén.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-linear-hairline-strong bg-linear-surface-1 px-3 py-6 text-center transition-colors hover:border-linear-primary hover:bg-linear-surface-3"
          >
            <Camera className="h-5 w-5 text-linear-ink-subtle" />
            <span className="text-[12px] font-medium text-linear-ink-subtle">Fotó / galéria</span>
          </button>

          {resolveState.videoAllowed && (
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-linear-hairline-strong bg-linear-surface-1 px-3 py-6 text-center transition-colors hover:border-linear-primary hover:bg-linear-surface-3"
            >
              <Video className="h-5 w-5 text-linear-ink-subtle" />
              <span className="text-[12px] font-medium text-linear-ink-subtle">Videó</span>
            </button>
          )}
        </div>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files, 'photo');
            e.target.value = '';
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files, 'video');
            e.target.value = '';
          }}
        />

        {items.length > 0 && (
          <div className="mt-6 flex flex-col gap-2.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-md border border-linear-hairline bg-linear-surface-1 p-2.5"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-linear-surface-2">
                  {item.kind === 'video' ? (
                    <video src={item.previewUrl} className="h-full w-full object-cover" muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- kliens-oldali object URL előnézet
                    <img src={item.previewUrl} alt="Feltöltött média" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {item.status === 'error' ? (
                    <p className="truncate text-[12px] text-red-400">{item.errorMessage}</p>
                  ) : item.status === 'done' ? (
                    <p className="text-[12px] font-medium text-emerald-400">Sikeresen feltöltve</p>
                  ) : (
                    <>
                      <p className="truncate text-[12px] text-linear-ink-subtle">{item.progressLabel}</p>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-linear-surface-3">
                        <div
                          className="h-full rounded-full bg-linear-primary transition-[width]"
                          style={{ width: `${Math.round(item.progressRatio * 100)}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
                {item.status === 'done' && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
                {item.status === 'error' && <XCircle className="h-5 w-5 shrink-0 text-red-400" />}
                {(item.status === 'processing' || item.status === 'uploading') && (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-linear-primary" />
                )}
              </div>
            ))}
          </div>
        )}

        {items.length === 0 && (
          <div className="mt-8 flex flex-col items-center gap-2 text-center">
            <ImagePlus className="h-8 w-8 text-linear-ink-subtle" />
            <p className="text-[12px] text-linear-ink-subtle">Még nem töltöttél fel semmit ezen az oldalon.</p>
          </div>
        )}
      </div>
    </div>
  );
}
