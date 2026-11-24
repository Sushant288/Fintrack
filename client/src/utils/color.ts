export function normalizeHex(hex: string): string {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    return `#${clean.split('').map((c) => c + c).join('').toLowerCase()}`;
  }
  if (clean.length === 6) {
    return `#${clean.toLowerCase()}`;
  }
  return '#64748b';
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function readableTextColor(bgHex: string): string {
  const clean = normalizeHex(bgHex).slice(1);
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const lum = getLuminance(r, g, b);

  // Luminance contrast with white (1.0) and dark ink (0.02)
  const whiteContrast = (1.0 + 0.05) / (lum + 0.05);
  const darkContrast = (lum + 0.05) / (0.02 + 0.05);

  return whiteContrast >= darkContrast ? '#FFFFFF' : '#18233F';
}
