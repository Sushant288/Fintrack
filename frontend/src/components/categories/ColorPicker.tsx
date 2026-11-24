import React, { useState } from 'react';
import { CATEGORY_PALETTE, DEFAULT_CATEGORY_COLOR } from '@/config/palette';
import { normalizeHex } from '@/utils/color';
import { clsx } from 'clsx';
import { Check } from 'lucide-react';

export interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange }) => {
  const normalizedValue = normalizeHex(value || DEFAULT_CATEGORY_COLOR);
  const [customHex, setCustomHex] = useState(normalizedValue);

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setCustomHex(raw);
    if (/^#?[0-9a-fA-F]{6}$/.test(raw)) {
      onChange(normalizeHex(raw));
    }
  };

  return (
    <div className="space-y-3">
      {/* Palette swatches */}
      <div className="grid grid-cols-6 sm:grid-cols-9 gap-2" role="radiogroup" aria-label="Color palette">
        {CATEGORY_PALETTE.map((color) => {
          const isSelected = normalizedValue === color;
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`Color ${color}`}
              onClick={() => {
                onChange(color);
                setCustomHex(color);
              }}
              style={{ backgroundColor: color }}
              className={clsx(
                'w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110',
                'focus-visible:outline-2 focus-visible:outline-marigold focus-visible:outline-offset-2',
                isSelected && 'ring-2 ring-ink ring-offset-2 scale-105'
              )}
            >
              {isSelected && <Check className="w-4 h-4 text-white drop-shadow-sm" />}
            </button>
          );
        })}
      </div>

      {/* Custom hex input */}
      <div className="flex items-center gap-2 pt-1">
        <label htmlFor="custom-hex-input" className="text-xs text-muted">
          Custom:
        </label>
        <input
          id="custom-hex-input"
          type="text"
          value={customHex}
          onChange={handleCustomChange}
          placeholder="#64748b"
          maxLength={7}
          className="w-24 px-2 py-1 text-xs font-mono bg-panel text-ink border border-hairline rounded-sm focus-visible:outline-2 focus-visible:outline-marigold"
        />
        <div
          aria-hidden="true"
          className="w-5 h-5 rounded-sm border border-hairline"
          style={{ backgroundColor: normalizedValue }}
        />
      </div>
    </div>
  );
};
