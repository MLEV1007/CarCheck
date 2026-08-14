'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface LogoUploaderProps {
  userId: string;
  logoUrl: string | null;
  onUploaded: (url: string) => void;
  /** Igaz Átvizsgálóknál (2026-08-14, "Öröklött cégadatok" lépés) -- a logó ilyenkor a
   * szervezet Menedzserétől öröklődik, csak ELŐNÉZET, a feltöltő gomb nem jelenik meg. */
  disabled?: boolean;
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Céglogó feltöltő (PROJEKT_INSTRUKCIOK.md 5.A + a "Cégbeállítások oldal" lépés):
 * fájlválasztó gomb + meglévő logó előnézete. A kép ugyanabba a Storage bucket-be
 * (`inspection-media`) kerül, mint a hiba-fotók/videók, a user saját mappájába
 * (`{user_id}/logo/...`) -- az RLS policy-k (`(storage.foldername(name))[1] = auth.uid()`)
 * ezt kényszerítik ki, lásd PROJEKT_INSTRUKCIOK.md 3. pont.
 *
 * A feltöltés azonnal, fájlválasztáskor megtörténik (nem várja meg a "Mentés" gombot) --
 * a publikus URL-t a szülő `SettingsForm` a `profiles.logo_url` mezőbe menti majd.
 */
export function LogoUploader({ userId, logoUrl, onUploaded, disabled = false }: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // ugyanaz a fájl később is újra kiválasztható legyen

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Csak képfájl tölthető fel (PNG, JPG, SVG stb.).');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError('A kép mérete legfeljebb 5 MB lehet.');
      return;
    }

    setError(null);
    setIsUploading(true);

    const supabase = createClient();
    const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${userId}/logo/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('inspection-media')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      setError('A logó feltöltése sikertelen volt. Próbáld újra.');
      setIsUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('inspection-media').getPublicUrl(path);

    onUploaded(publicUrl);
    setIsUploading(false);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-stripe-md border border-stripe-hairline bg-stripe-canvas-soft">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a logó a Supabase Storage-ból, tetszőleges méretben érkezik
          <img src={logoUrl} alt="Céglogó előnézet" className="h-full w-full object-contain" />
        ) : (
          <span className="px-1 text-center font-sohne text-[11px] font-normal leading-tight text-stripe-ink-mute">
            Nincs logó
          </span>
        )}
      </div>

      {!disabled && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stripe-hairline-input px-4 font-sohne text-[13px] font-normal text-stripe-ink transition-colors hover:bg-stripe-canvas-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {isUploading ? 'Feltöltés...' : logoUrl ? 'Logó cseréje' : 'Logó feltöltése'}
          </button>
          {error && (
            <p role="alert" className="font-sohne text-[12px] text-stripe-ruby">
              {error}
            </p>
          )}
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>
      )}
    </div>
  );
}
