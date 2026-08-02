/**
 * Minimális ambient TypeScript deklaráció a natív böngésző Web Speech API-hoz
 * (`window.SpeechRecognition` / `window.webkitSpeechRecognition`) -- a TypeScript `dom`
 * lib NEM tartalmazza ezeket a típusokat, mert az API még nem hivatalos W3C szabvány.
 * Csak a projektben ténylegesen használt felületet fedi le, lásd
 * `lib/hooks/useSpeechToText.ts` (PROJEKT_INSTRUKCIOK.md "Hangalapú Jegyzetelés" lépés).
 *
 * FONTOS: ez a fájl SZÁNDÉKOSAN nem tartalmaz import/export utasítást -- egy `.d.ts` fájl
 * import/export nélkül globális "ambient" deklarációnak számít, így a `SpeechRecognition`
 * típus és a `Window` interfész-bővítés a teljes projektben, mindenhol elérhető.
 */

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
