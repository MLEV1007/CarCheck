'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, Loader2, Paperclip, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LABELS, type FeedbackCategory } from '@/types/feedback';

interface FeedbackModalProps {
  onClose: () => void;
}

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

/** Ugyanaz a méret- és MIME-korlát, mint amit a `feedback-attachments` Storage bucket a
 * `file_size_limit`/`allowed_mime_types` mezőin kényszerít ki (lásd
 * `supabase/migrations/20260822_feedback_widget_storage.sql`) -- itt kliens-oldalon,
 * feltöltés ELŐTT szűrünk, ugyanaz az elv, mint a `LogoUploader.tsx`-nél. */
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Saját, pillekönnyű in-app visszajelző modal -- NEM Formbricks (lásd a korábbi,
 * 2026-08-20-án teljesen eltávolított kísérletet, `docs/`-ban már nem található), hanem
 * egy közvetlenül a saját Notion Kanban adatbázisunkba beküldő űrlap (`/api/feedback`,
 * lásd annak JSDoc-ját + `docs/notion-feedback-widget-setup-2026-08-22.md`).
 *
 * **Miért nincs Shadcn `Dialog`:** a projektben (`package.json`) SOSEM lett ténylegesen
 * telepítve a Shadcn/ui + Radix-alap (nincs `@radix-ui/*`/`class-variance-authority`
 * függőség) -- a meglévő modal-mintát (lásd `InsufficientCreditsModal.tsx`/
 * `VideoUpsellModal.tsx`: kézzel épített `fixed inset-0` overlay + `role="dialog"` +
 * Escape/háttér-kattintás zárás) követi ez is, hogy ne kelljen egy ÚJ, a felhasználó
 * gépén még nem telepített csomag-fát (`npm install`) hozzáadni a projekthez, ami itt, a
 * távoli fájl-hídon keresztül úgysem futtatható le automatikusan.
 *
 * A Beállítások (Stripe Design System) ÉS a Szakértői Munkaterület fejléce (Linear Dark
 * Design Style) is megnyitja ezt a modalt (lásd `FeedbackTriggerButton.tsx`) -- mivel a
 * teljes képernyőt elsötétítő overlay MINDIG ugyanazt a hátteret adja alá, a kártya maga
 * SZÁNDÉKOSAN semleges, világos (Stripe-szerű) felületet kap, ez marad olvasható
 * mindkét kontextusból nyitva.
 */
export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // A hitelesített felhasználó -- kliens-oldalon, mountkor töltjük be (ugyanaz a minta,
  // mint pl. `VideoUpsellModal.tsx`-nél), hogy a modal bárhonnan (fejléc VAGY Beállítások)
  // önmagát tudja ellátni, prop-drilling nélkül. Az `id`-t a szerver úgyis a SAJÁT
  // session-jéből olvassa újra (lásd `route.ts`), ez itt csak a Storage-feltöltés
  // mappa-elérési útjához és a Notion-lap megjelenítő email-mezőjéhez kell.
  const [authUser, setAuthUser] = useState<{ id: string; email: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled && user) {
        setAuthUser({ id: user.id, email: user.email ?? null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape zárás -- KIVÉVE amíg a beküldés folyamatban van, hogy egy véletlen
  // billentyű-ütés ne szakítsa félbe a folyamatban lévő feltöltést/Notion-hívást.
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && status !== 'submitting') onClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, status]);

  // Sikeres beküldés után automatikusan bezárjuk a modalt -- de csak akkor, ha a
  // felhasználó nem zárta be előbb kézzel (lásd a "Bezárás" gombot lent).
  useEffect(() => {
    if (status !== 'success') return;
    const timeoutId = setTimeout(onClose, 3000);
    return () => clearTimeout(timeoutId);
  }, [status, onClose]);

  function handleBackdropClick() {
    if (status !== 'submitting') onClose();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = ''; // ugyanaz a fájl később is újra kiválasztható legyen

    if (!selected) return;

    if (!selected.type.startsWith('image/')) {
      setFileError('Csak képfájl csatolható (PNG, JPG, WEBP stb.).');
      return;
    }
    if (selected.size > MAX_IMAGE_SIZE_BYTES) {
      setFileError('A kép mérete legfeljebb 5 MB lehet.');
      return;
    }

    setFileError(null);
    setFile(selected);
  }

  function handleRemoveFile() {
    setFile(null);
    setFileError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === 'submitting') return;

    if (!description.trim()) {
      setSubmitError('Kérjük, írj néhány mondatot a leírás mezőbe.');
      return;
    }

    setSubmitError(null);
    setStatus('submitting');

    try {
      let imageUrl: string | null = null;

      if (file) {
        const supabase = createClient();
        const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
        // A saját mappájába tölt fel mindenki (`{user_id}/...`) -- ugyanaz az elv, mint a
        // `LogoUploader.tsx`-nél, ezt kényszeríti ki a bucket RLS policy-ja is (lásd
        // `supabase/migrations/20260822_feedback_widget_storage.sql`). Ha valamiért nincs
        // (még) betöltve a session, egy `anonim` almappába kerül -- ez elméleti eset,
        // mert a gombot csak bejelentkezve lehet elérni (`DashboardHeader`/Beállítások),
        // de defenzíven nem hasal el rajta a feltöltés.
        const folder = authUser?.id ?? 'anonim';
        const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from('feedback-attachments')
          .upload(path, file, { cacheControl: '3600', upsert: false });

        if (uploadError) {
          throw new Error('A kép feltöltése sikertelen volt. Próbáld újra, vagy küldd el kép nélkül.');
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from('feedback-attachments').getPublicUrl(path);
        imageUrl = publicUrl;
      }

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description: description.trim(),
          imageUrl,
          userEmail: authUser?.email ?? null,
          userId: authUser?.id ?? '',
        }),
      });

      const json = (await response.json().catch(() => null)) as { success: boolean; error?: string } | null;

      if (!response.ok || !json?.success) {
        throw new Error(json?.error || 'Nem sikerült elküldeni a visszajelzést. Próbáld újra.');
      }

      setStatus('success');
    } catch (error) {
      setStatus('error');
      setSubmitError(error instanceof Error ? error.message : 'Nem sikerült elküldeni a visszajelzést. Próbáld újra.');
    }
  }

  const isSubmitting = status === 'submitting';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Visszajelzés küldése"
        className="w-full max-w-md rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1 sm:p-8"
      >
        {status === 'success' ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
              <Check className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="font-sohne text-[16px] font-medium text-stripe-ink">Köszönjük a visszajelzést!</p>
            <p className="font-sohne text-[13px] font-light text-stripe-ink-mute">
              Sikeresen elküldted -- hamarosan átnézzük.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 inline-flex h-9 items-center justify-center rounded-full bg-stripe-primary px-4 font-sohne text-[13px] font-normal text-white transition-colors hover:bg-stripe-primary-deep"
            >
              Bezárás
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-sohne text-[16px] font-medium text-stripe-ink">Visszajelzés küldése</p>
                <p className="mt-1 font-sohne text-[13px] font-light text-stripe-ink-mute">
                  Hibát találtál, vagy ötleted van egy új funkcióra? Írd meg nekünk.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                aria-label="Bezárás"
                className="shrink-0 rounded-md p-1 text-stripe-ink-mute transition-colors hover:bg-stripe-canvas-soft hover:text-stripe-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="feedback_category" className="font-sohne text-[13px] font-normal text-stripe-ink-secondary">
                Kategória
              </label>
              <select
                id="feedback_category"
                value={category}
                onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
                disabled={isSubmitting}
                className="h-11 rounded-stripe-sm border border-stripe-hairline-input bg-white px-3 font-sohne text-[15px] text-stripe-ink transition-colors duration-150 focus:border-stripe-primary focus:outline-none focus:ring-2 focus:ring-stripe-primary/30 disabled:cursor-not-allowed disabled:bg-stripe-canvas-soft"
              >
                {FEEDBACK_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {FEEDBACK_CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="feedback_description" className="font-sohne text-[13px] font-normal text-stripe-ink-secondary">
                Leírás
              </label>
              <textarea
                id="feedback_description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isSubmitting}
                required
                rows={4}
                placeholder="Mit tapasztaltál, vagy mit szeretnél javasolni?"
                className="resize-none rounded-stripe-sm border border-stripe-hairline-input bg-white px-3 py-2.5 font-sohne text-[15px] text-stripe-ink placeholder:text-stripe-ink-mute transition-colors duration-150 focus:border-stripe-primary focus:outline-none focus:ring-2 focus:ring-stripe-primary/30 disabled:cursor-not-allowed disabled:bg-stripe-canvas-soft"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-sohne text-[13px] font-normal text-stripe-ink-secondary">Kép csatolása (opcionális)</span>
              {file ? (
                <div className="flex items-center justify-between gap-3 rounded-stripe-sm border border-stripe-hairline-input px-3 py-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-sohne text-[13px] text-stripe-ink">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-stripe-ink-mute" />
                    <span className="truncate">{file.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    disabled={isSubmitting}
                    aria-label="Kép eltávolítása"
                    className="shrink-0 text-stripe-ink-mute transition-colors hover:text-stripe-ruby disabled:cursor-not-allowed"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-stripe-hairline-input px-4 font-sohne text-[13px] font-normal text-stripe-ink transition-colors hover:bg-stripe-canvas-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Kép kiválasztása
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              {fileError && (
                <span role="alert" className="font-sohne text-[12px] text-stripe-ruby">
                  {fileError}
                </span>
              )}
            </div>

            {submitError && (
              <p role="alert" className="font-sohne text-[13px] text-stripe-ruby">
                {submitError}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-stripe-primary px-4 font-sohne text-[15px] font-normal text-white transition-colors hover:bg-stripe-primary-deep disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Küldés...' : 'Visszajelzés küldése'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="text-center font-sohne text-[12px] font-normal text-stripe-ink-mute transition-colors hover:text-stripe-ink disabled:cursor-not-allowed"
              >
                Mégse
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
