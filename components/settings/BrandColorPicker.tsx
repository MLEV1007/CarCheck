'use client';

interface BrandColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  /** Igaz Átvizsgálóknál (2026-08-14, "Öröklött cégadatok" lépés) -- a márkaszín
   * ilyenkor a szervezet Menedzserétől öröklődik, csak SWATCH-ként jelenik meg, a
   * picker/hex mező és a presetek nem kattinthatók. */
  disabled?: boolean;
}

interface ColorPreset {
  label: string;
  value: string;
}

const PRESETS: ColorPreset[] = [
  { label: 'BMW kék', value: '#1c69d4' },
  { label: 'Elegáns fekete', value: '#18181b' },
  { label: 'Versenypiros', value: '#da291c' },
  { label: 'Profi zöld', value: '#16a34a' },
];

const HEX_PATTERN = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

/**
 * Elsődleges márkaszín választó (a "Cégbeállítások oldal" lépés specifikációja):
 * natív `<input type="color">` picker + hex szöveges mező + 4 gyors preset. Ez a szín
 * kerül elmentésre a `profiles.primary_color` mezőbe, amit a `/report/[public_token]`
 * a `--report-accent` CSS változón keresztül olvas (BMW kék fallback-kel, ha üres).
 */
export function BrandColorPicker({ value, onChange, disabled = false }: BrandColorPickerProps) {
  const isValidHex = HEX_PATTERN.test(value);
  const activePreset = PRESETS.find((preset) => preset.value.toLowerCase() === value.toLowerCase());

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <label
          className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-stripe-sm border border-stripe-hairline-input ${
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <input
            type="color"
            value={isValidHex ? value : '#1c69d4'}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            aria-label="Márkaszín kiválasztása színválasztóval"
            className="absolute -left-1 -top-1 h-[calc(100%+8px)] w-[calc(100%+8px)] cursor-pointer border-0 p-0 disabled:cursor-not-allowed"
          />
        </label>

        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder="#1c69d4"
          aria-label="Márkaszín hex kódja"
          aria-invalid={!isValidHex}
          className={`tabular-nums-stripe h-11 w-36 rounded-stripe-sm border bg-white px-3 font-sohne text-[15px] text-stripe-ink placeholder:text-stripe-ink-mute focus:outline-none focus:ring-2 focus:ring-stripe-primary/30 focus:border-stripe-primary disabled:cursor-not-allowed disabled:bg-stripe-canvas-soft disabled:text-stripe-ink-mute ${
            isValidHex ? 'border-stripe-hairline-input' : 'border-stripe-ruby'
          }`}
        />
      </div>
      {!isValidHex && (
        <p className="font-sohne text-[12px] text-stripe-ruby">
          Érvénytelen hex színkód (pl. #1c69d4 formátumban add meg).
        </p>
      )}

      {!disabled && (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange(preset.value)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-sohne text-[12px] font-normal transition-colors ${
                activePreset?.value === preset.value
                  ? 'border-stripe-primary bg-stripe-primary/5 text-stripe-primary'
                  : 'border-stripe-hairline text-stripe-ink-secondary hover:bg-stripe-canvas-soft'
              }`}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: preset.value }}
                aria-hidden
              />
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
