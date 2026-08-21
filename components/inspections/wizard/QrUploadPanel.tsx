'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useInspectionId } from '@/components/inspections/wizard/InspectionIdContext';

interface QrUploadPanelProps {
  /** 'general' VAGY `defect:${clientId}` -- lásd `qr_upload_sessions.target` oszlop
   * JSDoc-ját a migrációban. Ez alapján tudja a szülő Step-komponens (`StepGeneralPhotos.tsx`/
   * `StepDefects.tsx`) eldönteni, hogy egy beérkező elemet hova illesszen a wizard
   * állapotába (`onReceive` callback). */
  target: string;
  onReceive: (item: { url: string; type: 'photo' | 'video' }) => void;
}

type PanelState =
  | { status: 'closed' }
  | { status: 'creating' }
  | { status: 'open'; token: string; qrDataUrl: string; receivedCount: number }
  | { status: 'error'; message: string };

/**
 * "Feltöltés telefonról" gomb + QR-kód + élő (Realtime) figyelés -- lásd
 * PLAN_video_qr_upload.md 5. szakaszát. `StepGeneralPhotos.tsx`-ben ÉS `StepDefects.tsx`
 * minden hiba-kártyáján megjelenik, a `target` propon keresztül különböztetve meg a célt.
 *
 * **KIZÁRÓLAG asztali nézeten jelenik meg** -- a `hidden md:flex` Tailwind-osztály dönti el
 * (lásd a legkülső `div`-et), SZÁNDÉKOSAN NEM user-agent sniffing, a felhasználó kérésének
 * megfelelően (egy asztali böngésző keskeny ablaka is mobilnak "tűnhetne" UA-sniffinggel,
 * miközben a QR-kód pont FELESLEGES lenne rajta -- a viewport-alapú Tailwind-osztály ezt a
 * félreértést nem tudja produkálni).
 *
 * **"Új session mindig" (v1, a felhasználóval egyeztetett, egyszerűsített döntés):** a panel
 * bezárása/újranyitása MINDIG új session-t hoz létre (nincs "folytatás" egy korábban már
 * megnyitott, de be nem zárt session-nel) -- ez a `handleOpen` minden hívásnál friss
 * `/api/qr-upload/session` hívást indít.
 */
export function QrUploadPanel({ target, onReceive }: QrUploadPanelProps) {
  const inspectionId = useInspectionId();
  const [state, setState] = useState<PanelState>({ status: 'closed' });
  const supabaseRef = useRef(createClient());
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  useEffect(() => {
    // Unmountkor (pl. a felhasználó eltávolítja a hiba-kártyát, vagy elhagyja a lépést)
    // MINDIG le kell iratkozni a Realtime csatornáról -- egy nyitva hagyott csatorna
    // felesleges kapcsolatot/kvótát fogyasztana a háttérben.
    return () => {
      if (channelRef.current) {
        supabaseRef.current.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  async function handleOpen() {
    setState({ status: 'creating' });
    try {
      const response = await fetch('/api/qr-upload/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionId, target }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(json?.error ?? 'Nem sikerült QR-feltöltési session-t létrehozni.');
      }

      const phoneUrl = `${window.location.origin}/qr-upload/${json.token}`;
      const qrDataUrl = await QRCode.toDataURL(phoneUrl, { margin: 1, width: 240 });

      const channel = supabaseRef.current
        .channel(`qr_uploads:${json.token}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'qr_uploads', filter: `session_token=eq.${json.token}` },
          (payload) => {
            const row = payload.new as { media_url: string; media_type: 'photo' | 'video' };
            onReceive({ url: row.media_url, type: row.media_type });
            setState((prev) => (prev.status === 'open' ? { ...prev, receivedCount: prev.receivedCount + 1 } : prev));
          }
        )
        .subscribe();
      channelRef.current = channel;

      setState({ status: 'open', token: json.token, qrDataUrl, receivedCount: 0 });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Ismeretlen hiba történt.' });
    }
  }

  function handleClose() {
    if (channelRef.current) {
      supabaseRef.current.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setState({ status: 'closed' });
  }

  return (
    <div className="hidden md:flex md:flex-col md:gap-2.5">
      {state.status === 'closed' && (
        <button
          type="button"
          onClick={handleOpen}
          className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-linear-hairline-strong px-3 text-[12px] font-medium text-linear-ink-subtle transition-colors hover:border-linear-primary hover:text-linear-ink"
        >
          <QrCode className="h-4 w-4" />
          Feltöltés telefonról
        </button>
      )}

      {state.status === 'creating' && (
        <p className="text-[12px] text-linear-ink-subtle">QR-kód generálása...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-linear-hairline bg-linear-surface-1 p-3">
          <p className="text-[12px] text-red-400">{state.message}</p>
          <button type="button" onClick={handleOpen} className="mt-1.5 text-[12px] font-medium text-linear-primary">
            Újra
          </button>
        </div>
      )}

      {state.status === 'open' && (
        <div className="flex max-w-[240px] flex-col items-center gap-2 rounded-md border border-linear-hairline bg-linear-surface-1 p-3">
          <div className="flex w-full items-center justify-between">
            <p className="text-[12px] font-medium text-linear-ink">Szkenneld be a telefonoddal</p>
            <button
              type="button"
              onClick={handleClose}
              aria-label="QR-kód bezárása"
              className="text-linear-ink-subtle transition-colors hover:text-linear-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- kliens-oldalon generált data URL QR-kód */}
          <img src={state.qrDataUrl} alt="QR-kód a telefonos feltöltéshez" className="h-[180px] w-[180px]" />
          <p className="text-center text-[11px] text-linear-ink-subtle">
            A link kb. 20 percig érvényes. {state.receivedCount > 0 ? `${state.receivedCount} elem érkezett.` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
