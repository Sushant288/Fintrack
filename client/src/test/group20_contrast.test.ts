import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function parseTokens(css: string): { light: Record<string, string>; dark: Record<string, string> } {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};

  // Extract light block
  const lightMatch = css.match(/\[data-theme="light"\]\s*\{([^}]+)\}/);
  if (lightMatch) {
    for (const line of lightMatch[1].split(';')) {
      const [k, v] = line.split(':');
      if (k && v) light[k.trim()] = v.trim();
    }
  }

  // Extract dark block
  const darkMatch = css.match(/\[data-theme="dark"\]\s*\{([^}]+)\}/);
  if (darkMatch) {
    for (const line of darkMatch[1].split(';')) {
      const [k, v] = line.split(':');
      if (k && v) dark[k.trim()] = v.trim();
    }
  }

  return { light, dark };
}

function getLuminance(hex: string): number {
  const clean = hex.replace('#', '').trim();
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const [rs, gs, bs] = [r, g, b].map((c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrast(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Group 20: COLOR CONTRAST RATIOS', () => {
  it('asserts WCAG AA contrast ratio >= 4.5 for UI text/background pairs in both themes', () => {
    const tokensPath = path.resolve(__dirname, '../styles/tokens.css');
    const css = fs.readFileSync(tokensPath, 'utf-8');
    const { light, dark } = parseTokens(css);

    // Light theme checks
    // 1. Ink on Paper
    expect(getContrast(light['--color-ink'], light['--color-paper'])).toBeGreaterThanOrEqual(4.5);
    // 2. Ink on Panel
    expect(getContrast(light['--color-ink'], light['--color-panel'])).toBeGreaterThanOrEqual(4.5);
    // 3. Primary on Panel
    expect(getContrast(light['--color-primary'], light['--color-panel'])).toBeGreaterThanOrEqual(4.5);
    // 4. White on Primary
    expect(getContrast(light['--color-primary-contrast'], light['--color-primary'])).toBeGreaterThanOrEqual(4.5);
    // 5. Income on Panel
    expect(getContrast(light['--color-income'], light['--color-panel'])).toBeGreaterThanOrEqual(4.5);
    // 6. Expense on Panel
    expect(getContrast(light['--color-expense'], light['--color-panel'])).toBeGreaterThanOrEqual(4.5);
    // 7. Muted text on Panel
    expect(getContrast(light['--color-muted'], light['--color-panel'])).toBeGreaterThanOrEqual(4.5);
    // 8. Marigold with Ink
    expect(getContrast(light['--color-marigold'], light['--color-ink'])).toBeGreaterThanOrEqual(4.5);

    // Dark theme checks
    // 1. Ink on Paper
    expect(getContrast(dark['--color-ink'], dark['--color-paper'])).toBeGreaterThanOrEqual(4.5);
    // 2. Ink on Panel
    expect(getContrast(dark['--color-ink'], dark['--color-panel'])).toBeGreaterThanOrEqual(4.5);
    // 3. Primary on Panel
    expect(getContrast(dark['--color-primary'], dark['--color-panel'])).toBeGreaterThanOrEqual(4.5);
    // 4. Primary-contrast on Primary
    expect(getContrast(dark['--color-primary-contrast'], dark['--color-primary'])).toBeGreaterThanOrEqual(4.5);
    // 5. Income on Panel
    expect(getContrast(dark['--color-income'], dark['--color-panel'])).toBeGreaterThanOrEqual(4.5);
    // 6. Expense on Panel
    expect(getContrast(dark['--color-expense'], dark['--color-panel'])).toBeGreaterThanOrEqual(4.5);
    // 7. Muted text on Panel
    expect(getContrast(dark['--color-muted'], dark['--color-panel'])).toBeGreaterThanOrEqual(4.5);
    // 8. Marigold with Ink
    expect(getContrast(dark['--color-marigold'], dark['--color-paper'])).toBeGreaterThanOrEqual(4.5);
  });
});
