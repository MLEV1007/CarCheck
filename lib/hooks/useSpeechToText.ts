'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSpeechToTextOptions {
  /** A cél mező diktálás-INDÍTÁSAKOR érvényes tartalma -- a felismert szöveg ehhez
   * fűződik hozzá. Csak a `start()` meghívásakor kerül "lefényképezésre" (`baseValueRef`),
   * hogy a diktálás KÖZBENI, a felismerés miatti folyamatos `onChange`-hívások (lásd lent)
   * ne generáljanak duplikációt/végtelen hurkot. */
  baseValue: string;
  /** A cél mező setter-e -- minden felismerési eseménynél a TELJES, bővített szöveggel hívódik. */
  onChange: (nextValue: string) => void;
}

/**
 * 100% ingyenes, KIZÁRÓLAG magyar nyelvű (hu-HU) hangalapú jegyzetelés a natív böngésző
 * Web Speech API-jával (`window.SpeechRecognition` / `webkitSpeechRecognition`) -- nincs
 * külső API-hívás, nincs díj (PROJEKT_INSTRUKCIOK.md "Hangalapú Jegyzetelés" lépés).
 *
 * `continuous: true`: a diktálás addig tart, amíg a felhasználó újra rá nem nyom a
 * mikrofon gombra (vagy a böngésző hosszabb csend miatt maga nem zárja le a session-t).
 * `interimResults: true`: a felismert szöveg VALÓS IDŐBEN frissül a mezőben, nem csak a
 * mondat/session végén -- minden `onresult` esemény a TELJES aktuális session-szöveget
 * (véglegesített + éppen felismerés alatt álló rész) újraépíti az `event.results`-ból,
 * és a diktálás-indításkori mező-tartalomhoz (`baseValueRef`) fűzi.
 */
export function useSpeechToText({ baseValue, onChange }: UseSpeechToTextOptions) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const baseValueRef = useRef(baseValue);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Böngésző-támogatás ellenőrzése -- csak kliens-oldalon (SSR-nél `window` nem létezik).
  useEffect(() => {
    setIsSupported(typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  // Unmountnál (pl. lépésváltás a wizardban) biztosan leállítjuk a mikrofon-hallgatást.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    baseValueRef.current = baseValue;
    const needsSeparator = baseValueRef.current.length > 0 && !/[\s\n]$/.test(baseValueRef.current);
    const separator = needsSeparator ? ' ' : '';

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'hu-HU';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let sessionText = '';
      for (let i = 0; i < event.results.length; i++) {
        sessionText += event.results[i][0].transcript;
      }
      onChangeRef.current(baseValueRef.current + separator + sessionText);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [baseValue]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  return { isSupported, isListening, toggle };
}
