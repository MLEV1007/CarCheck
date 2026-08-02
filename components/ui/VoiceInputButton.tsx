'use client';

import { useState } from 'react';
import { Loader2, Mic } from 'lucide-react';
import { useSpeechToText } from '@/lib/hooks/useSpeechToText';
import { cn, joinDictatedText } from '@/lib/utils';

interface VoiceInputButtonProps {
  /** A cél mező (textarea/input) JELENLEGI tartalma -- a felismert szöveg ehhez fűződik. */
  value: string;
  /** A cél mező setter-e -- a TELJES (bővített) szöveggel hívódik minden felismerésnél. */
  onChange: (nextValue: string) => void;
  className?: string;
  /**
   * "Auto-Trigger AI Diktálás" lépés (2026-08-02) -- ha meg van adva, a mikrofon
   * KIKAPCSOLÁSAKOR ez hívódik (a diktálás-indításkori mező-tartalommal és az EBBEN a
   * session-ben ténylegesen felismert nyers szöveg-szegmenssel), és EZ TELJESEN
   * KIVÁLTJA az alapértelmezett nyelvhelyesség-javítást lent -- a hívó fél felelőssége a
   * mező tényleges frissítése (`onChange`) és/vagy bármilyen egyéb AI-hívás elindítása.
   * Példa: `StepEquipment.tsx` AI diktálás kártyája ezzel indítja el AUTOMATIKUSAN a
   * `/api/ai/parse-equipment` feldolgozást a diktálás végén, "Feldolgozás AI-val" gombra
   * kattintás NÉLKÜL.
   */
  onDictationEnd?: (sessionText: string, baseValueAtStart: string) => void;
  /**
   * Ha `onDictationEnd` NINCS megadva, ez a prop szabályozza az ALAPÉRTELMEZETT
   * viselkedést: `true` (alapértelmezett) esetén a mikrofon kikapcsolásakor a
   * `/api/ai/fix-grammar` Gemini-végpont automatikusan "kisimítja" a nyers, gyakran
   * tagolatlan diktált szöveget egy profi, nyelvtanilag helyes mondattá, és ez a
   * VÉGLEGES érték kerül a mezőbe (a nyers verziót felülírva). `false`-ra állítva a
   * mezőben a nyers, élőben felismert szöveg marad, semmilyen utófeldolgozás nem fut.
   */
  autoFixGrammar?: boolean;
}

/**
 * Univerzális, 100% ingyenes, KIZÁRÓLAG magyar nyelvű (hu-HU) hangalapú diktáló gomb a
 * natív böngésző Web Speech API-jával (PROJEKT_INSTRUKCIOK.md "Hangalapú Jegyzetelés"
 * lépés). A hosszabb beviteli mezők (Textarea/Notes) jobb felső/alsó sarkába kerül,
 * input addon-ként -- lásd `FormControls.tsx` `TextareaField`, `DamageCanvas.tsx`,
 * `StepDiagnostics.tsx`.
 *
 * **"Auto-Trigger AI Diktálás" lépés (2026-08-02):** korábban a diktálás vége nem
 * indított semmilyen automatikus utófeldolgozást -- a felhasználónak minden mezőnél
 * kézzel kellett rendbe tennie/feldolgoznia a nyersen felismert szöveget. Mostantól a
 * mikrofon KIKAPCSOLÁSAKOR (nem minden `onresult`-nál, csak EGYSZER, a session végén)
 * automatikusan lefut egy utófeldolgozás -- lásd `onDictationEnd`/`autoFixGrammar`
 * propok fent a pontos szabályokért. Hiba esetén a mezőben már ott lévő, élőben
 * felismert NYERS szöveg marad -- egy sikertelen AI-hívás SOSEM okoz adatvesztést.
 *
 * Graceful fallback: ha a böngésző NEM támogatja a Web Speech API-t (pl. Firefox, vagy
 * régebbi Safari), a komponens `null`-t rendereli -- a mező diktálás nélkül, sima
 * szövegbeviteli mezőként működik tovább, semmi nem törik el.
 */
export function VoiceInputButton({
  value,
  onChange,
  className,
  onDictationEnd,
  autoFixGrammar = true,
}: VoiceInputButtonProps) {
  const [isFixingGrammar, setIsFixingGrammar] = useState(false);

  /** Alapértelmezett diktálás-vége viselkedés -- KIZÁRÓLAG akkor fut, ha a hívó fél NEM
   * adott meg egyedi `onDictationEnd`-et. Lásd a `/api/ai/fix-grammar` route JSDoc-ját a
   * pontos motivációért/mintáért. */
  async function handleDefaultDictationEnd(sessionText: string, baseValueAtStart: string) {
    if (!autoFixGrammar) return;

    setIsFixingGrammar(true);
    try {
      const response = await fetch('/api/ai/fix-grammar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sessionText }),
      });

      const data = (await response.json().catch(() => null)) as { success: boolean; text?: string } | null;

      if (response.ok && data?.success && data.text) {
        onChange(joinDictatedText(baseValueAtStart, data.text));
      }
      // Sikertelen válasz esetén CSENDBEN elnyeljük a hibát -- a mezőben már ott van az
      // élő, nyers felismert szöveg (a `useSpeechToText` `onresult`-ja folyamatosan
      // frissítette diktálás közben), tehát a nyelvhelyesség-javítás sikertelensége NEM
      // jár adatvesztéssel, csak a mező a nyers (nem finomított) formában marad.
    } catch {
      // Lásd fent -- hálózati hiba esetén is csendes fallback a nyers szövegre.
    } finally {
      setIsFixingGrammar(false);
    }
  }

  const { isSupported, isListening, toggle } = useSpeechToText({
    baseValue: value,
    onChange,
    onSessionEnd: onDictationEnd ?? handleDefaultDictationEnd,
  });

  if (!isSupported) return null;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {isListening && (
        <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-red-600 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Diktálás…
        </span>
      )}
      {!isListening && isFixingGrammar && (
        <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-600 shadow-sm">
          <Loader2 className="h-3 w-3 animate-spin" />
          Simítás…
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={isFixingGrammar}
        title="Hangalapú jegyzetelés (Magyar)"
        aria-label="Hangalapú jegyzetelés (Magyar)"
        aria-pressed={isListening}
        className={cn(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          isListening ? 'animate-pulse bg-red-500 text-white' : 'bg-slate-100 text-slate-400 hover:text-slate-600'
        )}
      >
        {isFixingGrammar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
