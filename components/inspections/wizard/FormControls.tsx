import { ChangeEvent, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn, isSpeechInputSupported } from '@/lib/utils';
import { VoiceInputButton } from '@/components/ui/VoiceInputButton';
import { HintCallout } from '@/components/onboarding/HintCallout';

/**
 * Linear design system (linear.md) `text-input` tokenje -- surface-1 háttér,
 * rounded-md, hairline szegély, fókuszban primary-focus keret. Ezeket a mezőket
 * a wizard mind az öt lépése újrahasznosítja, hogy a form-vizuál konzisztens maradjon.
 */

/** A `text-[16px] sm:text-[14px]` (NEM egyszerűen `text-[14px]`) SZÁNDÉKOS -- iOS Safari
 * mobilon a 16px alatti betűméretű mezőkre koppintva a böngésző automatikusan ráközelít
 * (zoom) az oldalra, ami a wizard mobil-first, terepen/garázsban telefonon kitöltött
 * űrlapjainál minden mező-érintésnél zavaró ugrálást okozott ("iOS Mobil Zoom hiba
 * javítása" lépés). 16px-nél a böngésző NEM zoomol, `sm:` (≥640px, gyakorlatilag mindig
 * desktop/tablet, ahol ez a hiba amúgy sem jelentkezik) fölött visszaáll a sűrűbb 14px-re.
 * Lásd még `globals.css` globális `@media (max-width:768px) { input,textarea,select {
 * font-size:16px!important } }` szabályát -- ez egy VÉGSŐ biztonsági háló minden egyéb,
 * NEM ezt a komponenst használó mezőhöz, ez a konstans itt a "elsődleges", szemantikusan
 * helyes forrás. */
const FIELD_BASE =
  'h-11 w-full rounded-md border border-linear-hairline bg-linear-surface-1 px-3 text-[16px] sm:text-[14px] text-linear-ink ' +
  'placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none ' +
  'focus:ring-2 focus:ring-linear-primary/30';

interface FieldWrapperProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
}

function FieldLabel({ label, htmlFor, hint }: FieldWrapperProps) {
  return (
    <div className="flex items-baseline justify-between">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-linear-ink-muted">
        {label}
      </label>
      {hint && <span className="text-[12px] text-linear-ink-subtle">{hint}</span>}
    </div>
  );
}

/** Szigorú adatvalidáció (PROJEKT_INSTRUKCIOK.md, "Szigorú adatvalidáció" lépés) -- ha a
 * `error` prop meg van adva, piros keret + piros hibaszöveg jelenik meg a mező alatt. */
function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <span role="alert" className="text-[12px] text-linear-danger">
      {error}
    </span>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement>, FieldWrapperProps {}

export function TextField({ label, hint, error, id, className, ...props }: TextFieldProps) {
  const fieldId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} htmlFor={fieldId} hint={hint} />
      <input
        id={fieldId}
        aria-invalid={!!error}
        className={cn(FIELD_BASE, error && 'border-linear-danger focus:border-linear-danger focus:ring-linear-danger/30', className)}
        {...props}
      />
      <FieldError error={error} />
    </div>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldWrapperProps {
  options: string[];
  placeholder?: string;
}

export function SelectField({ label, hint, error, id, className, options, placeholder, ...props }: SelectFieldProps) {
  const fieldId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} htmlFor={fieldId} hint={hint} />
      <select
        id={fieldId}
        aria-invalid={!!error}
        className={cn(FIELD_BASE, 'appearance-none', error && 'border-linear-danger focus:border-linear-danger focus:ring-linear-danger/30', className)}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <FieldError error={error} />
    </div>
  );
}

interface ToggleFieldProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * Linear Dark kapcsoló (toggle switch) -- Átvizsgáló és Ügyfél adatok + PDF
 * megjelenítési kapcsolók lépés (2026-08-06), `StepSummary.tsx` "PDF megjelenítési
 * beállítások" blokkja. Ugyanaz a `role="switch"`/`aria-checked` minta, mint a
 * `TeamManagement.tsx` (Stripe design, `/settings` "Láthatja az összes céges
 * riportot" kapcsolója) és az `AdminOrganizationsTable.tsx` kapcsolója, csak
 * `linear-*` design-tokenekre öntve, mert ez a wizard (Linear Dark) felületén él --
 * a design rendszer FÜGGŐ színek (`bg-linear-primary` / `bg-linear-surface-2`) miatt
 * nem lehetett a meglévő komponenst egy az egyben újrahasznosítani.
 *
 * **Geometria (2026-08-06, hibajavítás):** a knob NEM `position: absolute`-tal
 * pozicionált -- egy `absolute` + `top-0.5` + feltételes `translate-x` kombináció
 * `left-*` osztály NÉLKÜL a böngésző "abszolút pozicionált elem statikus pozíciója"
 * tartalék-számításától tenné függővé a knob vízszintes nyugalmi helyzetét, ami
 * kontextus-függően inkonzisztensen renderelt (halvány szín + a knob a jobb szélen
 * túlcsordulva/levágva -- ez a hiba a `TeamManagement.tsx`/`AdminOrganizationsTable.tsx`
 * korábbi, azonos mintájú kapcsolóin ténylegesen jelentkezett is). Az itteni minta a
 * hivatalos, robusztus Tailwind UI switch-mintát követi: a "sín" (`button`) `flex
 * items-center p-0.5`-je adja a 2px belső inzetet DETERMINISZTIKUSAN (padding, nem
 * ambiguity-re épülő böngésző-fallback), a knob pedig egy NORMÁL flex-gyerek,
 * KIZÁRÓLAG `translate-x-5`/`translate-x-0`-val tolva.
 */
export function ToggleField({ label, hint, checked, onChange, disabled, id }: ToggleFieldProps) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-linear-ink">{label}</span>
        {hint && <span className="block text-[12px] text-linear-ink-subtle">{hint}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          checked ? 'bg-linear-primary' : 'bg-linear-surface-2'
        )}
      >
        <span
          className={cn(
            'h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </label>
  );
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldWrapperProps {
  /** Lásd `VoiceInputButton.tsx` `onDictationEnd` propját -- ha meg van adva, a diktálás
   * végén ez fut LE az alapértelmezett nyelvhelyesség-javítás HELYETT (pl.
   * `StepEquipment.tsx` AI diktálás kártyája ezzel indítja el automatikusan a
   * felszereltség-értelmező AI-hívást). Ha nincs megadva, minden `TextareaField`
   * alapértelmezetten a nyelvhelyesség-javítást kapja "Auto-Trigger AI Diktálás" néven. */
  onDictationEnd?: (sessionText: string, baseValueAtStart: string) => void;
}

/** Hangalapú jegyzetelés (PROJEKT_INSTRUKCIOK.md "Hangalapú Jegyzetelés" lépés) --
 * MINDEN `TextareaField`-en (a wizard összes hosszabb Megjegyzés/Leírás mezője, pl.
 * `StepDefects.tsx` "Hiba leírása", `StepServiceHistory.tsx` "Megjegyzés") automatikusan
 * megjelenik a mikrofon gomb a mező jobb felső sarkában -- egyetlen közös komponensen
 * keresztül, nem kellett minden hívóhelyen külön bekötni. "Auto-Trigger AI Diktálás"
 * lépés (2026-08-02): a diktálás VÉGÉN (mikrofon kikapcsolásakor) ezek a mezők
 * alapértelmezetten automatikusan nyelvhelyesség-javításon esnek át (lásd
 * `VoiceInputButton.tsx`/`/api/ai/fix-grammar`), az `onDictationEnd` proppal pedig
 * egyedi hívóhely-specifikus viselkedésre cserélhető. */
export function TextareaField({ label, hint, id, className, value, onChange, onDictationEnd, ...props }: TextareaFieldProps) {
  const fieldId = id ?? props.name;
  const textValue = typeof value === 'string' ? value : '';

  function handleVoiceChange(nextValue: string) {
    if (!onChange) return;
    const syntheticEvent = { target: { value: nextValue } } as unknown as ChangeEvent<HTMLTextAreaElement>;
    onChange(syntheticEvent);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} htmlFor={fieldId} hint={hint} />
      <div className="relative">
        <textarea
          id={fieldId}
          value={value}
          onChange={onChange}
          className={cn(
            'min-h-[96px] w-full resize-y rounded-md border border-linear-hairline bg-linear-surface-1 px-3 py-2.5 pr-10',
            // Lásd a `FIELD_BASE` JSDoc-ját fent -- ugyanaz az iOS Safari mobil-zoom fix.
            'text-[16px] sm:text-[14px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors',
            'focus:border-linear-primary focus:outline-none focus:ring-2 focus:ring-linear-primary/30',
            className
          )}
          {...props}
        />
        <VoiceInputButton
          value={textValue}
          onChange={handleVoiceChange}
          onDictationEnd={onDictationEnd}
          className="absolute right-2 top-2"
        />
      </div>
      {/* Onboarding tipp a mikrofon-funkcióhoz (2026-08-10, "Hint/tutorial" lépés) --
          MINDEN `TextareaField`-en megjelenhet (megosztott `id`, lásd `HintCallout`/
          `OnboardingHintProvider` JSDoc-ját: egy bezárás egyszerre mindenhol elrejti),
          ezért csak EGYSZER, az ELSŐ mikrofonos mező mellett tűnik fel ténylegesen a
          gyakorlatban. `isSpeechInputSupported()`-fel védjük, hogy ne jelenjen meg olyan
          böngészőben (pl. Firefox), ahol a mikrofon gomb maga is rejtve marad. */}
      {isSpeechInputSupported() && (
        <HintCallout id="voice-mic" pointerAlign="right" className="mt-1">
          A mikrofon ikonra kattintva bediktálhatod a szöveget -- kikapcsoláskor az AI automatikusan nyelvtanilag is kisimítja.
        </HintCallout>
      )}
    </div>
  );
}
