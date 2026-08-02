'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { joinDictatedText } from '@/lib/utils';

interface UseSpeechToTextOptions {
  /** A cél mező diktálás-INDÍTÁSAKOR érvényes tartalma -- a felismert szöveg ehhez
   * fűződik hozzá. Csak a `start()` meghívásakor kerül "lefényképezésre" (`baseValueRef`),
   * hogy a diktálás KÖZBENI, a felismerés miatti folyamatos `onChange`-hívások (lásd lent)
   * ne generáljanak duplikációt/végtelen hurkot. */
  baseValue: string;
  /** A cél mező setter-e -- minden felismerési eseménynél a TELJES, bővített szöveggel hívódik. */
  onChange: (nextValue: string) => void;
  /**
   * "Auto-Trigger AI Diktálás" lépés (2026-08-02) -- ha meg van adva, a mikrofon
   * KIKAPCSOLÁSAKOR (a `SpeechRecognition` `onend` eseményénél) EGYETLEN alkalommal
   * meghívódik a diktálás-indításkori mező-tartalommal (`baseValueAtStart`) és az EZEN A
   * SESSION-ÖN belül ténylegesen felismert, nyers szöveg-szegmenssel (`sessionText`,
   * NEM tartalmazza a `baseValueAtStart`-ot) -- KIZÁRÓLAG akkor hívódik, ha a session
   * alatt ténylegesen hangzott el felismert szöveg (üres/csak-whitespace session esetén
   * nem fut le, pl. ha a user véletlenül rányomott a mikrofonra és azonnal ki is
   * kapcsolta). A hívó fél felelőssége eldönteni, mit kezd ezzel (pl. `VoiceInputButton`
   * alapértelmezetten egy nyelvhelyesség-javító AI-hívást indít, `StepEquipment.tsx` az
   * egyedi `onDictationEnd`-jével pedig közvetlenül a felszereltség-értelmező AI-hívást).
   */
  onSessionEnd?: (sessionText: string, baseValueAtStart: string) => void;
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
export function useSpeechToText({ baseValue, onChange, onSessionEnd }: UseSpeechToTextOptions) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const baseValueRef = useRef(baseValue);
  const onChangeRef = useRef(onChange);
  const onSessionEndRef = useRef(onSessionEnd);
  /** Az AKTUÁLIS (folyamatban lévő vagy épp lezárult) session során eddig felismert
   * teljes szöveg-szegmens -- minden `onresult`-nál frissül, hogy az `onend` a session
   * VÉGÉN pontosan tudja, mi hangzott el összesen, `onSessionEnd`-nek átadva. */
  const lastSessionTextRef = useRef('');

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

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
    lastSessionTextRef.current = '';

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'hu-HU';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let sessionText = '';
      for (let i = 0; i < event.results.length; i++) {
        sessionText += event.results[i][0].transcript;
      }
      lastSessionTextRef.current = sessionText;
      onChangeRef.current(joinDictatedText(baseValueRef.current, sessionText));
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => {
      setIsListening(false);
      const finalSessionText = lastSessionTextRef.current;
      if (finalSessionText.trim() !== '') {
        onSessionEndRef.current?.(finalSessionText, baseValueRef.current);
      }
    };

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
