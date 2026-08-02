import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Egy diktálás-indításkori mező-tartalmat (`base`) és egy hozzáfűzendő szöveg-szegmenst
 * (`addition`, pl. a diktálás nyers vagy nyelvhelyesség-javított eredménye) fűz össze --
 * elválasztó szóközzel, HA a `base` NEM üres és NEM végződik már whitespace-re/sortörésre.
 * Ugyanaz az elv, amit a `useSpeechToText.ts` `start()` függvénye eddig is belsőleg
 * használt a felismerés KÖZBENI (élő) hozzáfűzéshez -- ez a megosztott helper teszi
 * lehetővé, hogy a diktálás VÉGÉN (`onSessionEnd`) a hívó fél (pl. `VoiceInputButton`
 * alapértelmezett nyelvhelyesség-javítása, vagy `StepEquipment.tsx` AI auto-trigger-je)
 * UGYANEZZEL a logikával tudja újra összeépíteni a végleges mező-tartalmat, miután a
 * nyers diktált szöveg-szegmenst esetleg egy AI-hívással lecserélte egy finomított
 * változatra.
 */
export function joinDictatedText(base: string, addition: string): string {
  if (!addition) return base;
  const needsSeparator = base.length > 0 && !/[\s\n]$/.test(base);
  return base + (needsSeparator ? ' ' : '') + addition;
}
