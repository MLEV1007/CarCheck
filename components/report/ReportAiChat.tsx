'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircleQuestion, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { iconHitSlopClass } from '@/components/ui/IconButton';

interface ReportAiChatProps {
  /** A riport `public_token`-je, ez az egyetlen azonosító, amit a
   * `/api/report-chat` route kap, ebből oldja fel szerver-oldalon a
   * vizsgálatot/szervezetet (lásd a route JSDoc-ját). */
  token: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  /** Igaz, ha ez a sor egy sikertelen hívás visszajelzése, vizuálisan
   * megkülönböztetve (piros szegély), de a beszélgetés-folyamban marad. */
  isError?: boolean;
}

/** Lásd `app/api/report-chat/route.ts` `MAX_MESSAGE_LENGTH`-je, UGYANAZ az
 * érték, hogy a kliens-oldali validáció 1:1 tükrözze a szerver-oldalit. */
const MAX_MESSAGE_LENGTH = 500;

const EXAMPLE_QUESTIONS = [
  'Mennyire súlyos a legnagyobb hiba?',
  'Mit jelent a festékvastagság-mérés eredménye?',
  'Nagyjából mibe kerülhet a javítás?',
];

/**
 * "Kérdezz az AI szakértőtől" chat panel, KIZÁRÓLAG Pro/Business csomagos
 * riporton renderelődik (lásd `app/report/[public_token]/page.tsx`, a szülő
 * KIZÁRÓLAG `report.ai_chat_enabled === true` esetén rendereli ezt a
 * komponenst, ez a komponens maga nem ismétli meg a tier-ellenőrzést, azt a
 * `/api/report-chat` route úgyis szerver-oldalon, a kliensadattól függetlenül
 * kikényszeríti).
 *
 * BMW Corporate Design System: 0px lekerekítés, `--report-accent` akcentus,
 * 700/300 tipográfiai kontraszt, lásd `bmw.md` + a meglévő `components/
 * report/*` komponensek stílusát (pl. `ReportHeader.tsx`, `MediaLightbox.tsx`).
 *
 * **GDPR / statelesség:** a beszélgetés-előzmény KIZÁRÓLAG ebben a React
 * state-ben él, oldalfrissítésnél/bezárásnál elvész, sehol nem kerül
 * perzisztens tárolásra (sem itt, sem a szerveren, lásd a route JSDoc-ját).
 * Minden hívásnál a TELJES eddigi előzményt visszaküldjük a szervernek, mert a
 * Route Handler maga stateless.
 */
export function ReportAiChat({ token }: ReportAiChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  async function sendMessage(text: string) {
    const trimmed = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!trimmed || isLoading) return;

    const historyForRequest = messages
      .filter((m) => !m.isError)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/report-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, message: trimmed, history: historyForRequest }),
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        setMessages((prev) => [
          ...prev,
          { role: 'model', text: 'Jelenleg nem elérhető, próbáld később.', isError: true },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { role: 'model', text: data.reply as string }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: 'Jelenleg nem elérhető, próbáld később.', isError: true },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-4 z-40 flex h-14 items-center gap-2 rounded-none bg-[var(--report-accent)] px-5 text-[14px] font-bold uppercase tracking-[0.5px] text-bmw-on-primary shadow-[0_4px_16px_rgba(0,0,0,0.25)] transition-transform hover:scale-[1.03] sm:bottom-8 sm:right-8 print:hidden"
        >
          <MessageCircleQuestion className="h-5 w-5 shrink-0" />
          <span className="hidden sm:inline">Kérdezz az AI szakértőtől</span>
          <span className="sm:hidden">Kérdezz</span>
        </button>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-end sm:justify-end sm:bg-transparent sm:p-8 print:hidden"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="flex h-[85vh] w-full flex-col border border-bmw-hairline-strong bg-bmw-canvas sm:h-[560px] sm:w-[400px]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Kérdezz az AI szakértőtől"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-bmw-hairline bg-bmw-surface-dark px-5 py-4">
              <p className="text-[15px] font-bold text-bmw-on-dark">Kérdezz az AI szakértőtől</p>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Bezárás"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-none text-bmw-on-dark-soft transition-colors hover:text-bmw-on-dark',
                  iconHitSlopClass(32)
                )}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="shrink-0 border-b border-bmw-hairline bg-bmw-surface-soft px-5 py-3">
              <p className="text-[12px] font-light leading-relaxed text-bmw-muted">
                Az AI válaszai tájékoztató jellegűek, a vizsgálatot végző szakértő véleményét nem helyettesítik.
              </p>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {messages.length === 0 && (
                <div>
                  <p className="text-[13px] font-light text-bmw-muted">
                    Kérdezz szabadon a vizsgálat eredményeiről, pl.:
                  </p>
                  <div className="mt-3 space-y-2">
                    {EXAMPLE_QUESTIONS.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => sendMessage(question)}
                        className="block w-full rounded-none border border-bmw-hairline px-3 py-2 text-left text-[13px] text-bmw-body transition-colors hover:border-[var(--report-accent)]"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={index}
                  className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <p
                    className={
                      'max-w-[85%] whitespace-pre-line rounded-none border px-3 py-2 text-[14px] leading-relaxed ' +
                      (message.role === 'user'
                        ? 'border-[var(--report-accent)] bg-[var(--report-accent)] text-bmw-on-primary'
                        : message.isError
                          ? 'border-bmw-error bg-[#fdedec] text-bmw-ink'
                          : 'border-bmw-hairline bg-bmw-surface-card text-bmw-body')
                    }
                  >
                    {message.text}
                  </p>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <p className="rounded-none border border-bmw-hairline bg-bmw-surface-card px-3 py-2 text-[14px] text-bmw-muted">
                    Gondolkodik…
                  </p>
                </div>
              )}
            </div>

            <form
              className="flex shrink-0 items-center gap-2 border-t border-bmw-hairline p-3"
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage(input);
              }}
            >
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                placeholder="Írd le a kérdésed…"
                maxLength={MAX_MESSAGE_LENGTH}
                disabled={isLoading}
                className="h-11 flex-1 rounded-none border border-bmw-hairline-strong bg-bmw-canvas px-3 text-[14px] text-bmw-ink outline-none focus:border-[var(--report-accent)] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                aria-label="Küldés"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-none bg-[var(--report-accent)] text-bmw-on-primary transition-opacity disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
