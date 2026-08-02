'use client';

import { Mic } from 'lucide-react';
import { useSpeechToText } from '@/lib/hooks/useSpeechToText';
import { cn } from '@/lib/utils';

interface VoiceInputButtonProps {
  /** A cél mező (textarea/input) JELENLEGI tartalma -- a felismert szöveg ehhez fűződik. */
  value: string;
  /** A cél mező setter-e -- a TELJES (bővített) szöveggel hívódik minden felismerésnél. */
  onChange: (nextValue: string) => void;
  className?: string;
}

/**
 * Univerzális, 100% ingyenes, KIZÁRÓLAG magyar nyelvű (hu-HU) hangalapú diktáló gomb a
 * natív böngésző Web Speech API-jával (PROJEKT_INSTRUKCIOK.md "Hangalapú Jegyzetelés"
 * lépés). A hosszabb beviteli mezők (Textarea/Notes) jobb felső/alsó sarkába kerül,
 * input addon-ként -- lásd `FormControls.tsx` `TextareaField`, `DamageCanvas.tsx`,
 * `StepDiagnostics.tsx`.
 *
 * Graceful fallback: ha a böngésző NEM támogatja a Web Speech API-t (pl. Firefox, vagy
 * régebbi Safari), a komponens `null`-t rendereli -- a mező diktálás nélkül, sima
 * szövegbeviteli mezőként működik tovább, semmi nem törik el.
 */
export function VoiceInputButton({ value, onChange, className }: VoiceInputButtonProps) {
  const { isSupported, isListening, toggle } = useSpeechToText({ baseValue: value, onChange });

  if (!isSupported) return null;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {isListening && (
        <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-red-600 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Diktálás…
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        title="Hangalapú jegyzetelés (Magyar)"
        aria-label="Hangalapú jegyzetelés (Magyar)"
        aria-pressed={isListening}
        className={cn(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
          isListening ? 'animate-pulse bg-red-500 text-white' : 'bg-slate-100 text-slate-400 hover:text-slate-600'
        )}
      >
        <Mic className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
