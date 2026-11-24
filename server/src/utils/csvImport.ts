import { PaymentMethod, Prisma, TxType } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { isValidYmd } from './dates';

export interface CsvMapping {
  date: string;
  amount: string;
  type?: string | null;
  category?: string | null;
  description?: string | null;
  paymentMethod?: string | null;
}

/**
 * Normalizes header strings for matching purposes (lowercase, removes whitespace/symbols).
 */
export function normalizeHeaderKey(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Deduplicates raw header names by appending _2, _3, etc. for repeated columns.
 */
export function dedupeHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((raw) => {
    const trimmed = raw.trim();
    const count = (counts.get(trimmed) ?? 0) + 1;
    counts.set(trimmed, count);
    if (count === 1) return trimmed;
    return `${trimmed}_${count}`;
  });
}

/**
 * Detects CSV delimiter (, ; or \t) by counting occurrences on the first non-empty line.
 */
export function detectDelimiter(firstLine: string): string {
  let commas = 0;
  let semicolons = 0;
  let tabs = 0;
  let inQuotes = false;

  for (let i = 0; i < firstLine.length; i++) {
    const char = firstLine[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (char === ',') commas++;
      else if (char === ';') semicolons++;
      else if (char === '\t') tabs++;
    }
  }

  if (semicolons > commas && semicolons > tabs) return ';';
  if (tabs > commas && tabs > semicolons) return '\t';
  return ',';
}

/**
 * Heuristically suggests column mappings for standard banking export formats.
 */
export function suggestMapping(headers: string[]): {
  date: string | null;
  amount: string | null;
  type: string | null;
  category: string | null;
  description: string | null;
  paymentMethod: string | null;
} {
  const result: {
    date: string | null;
    amount: string | null;
    type: string | null;
    category: string | null;
    description: string | null;
    paymentMethod: string | null;
  } = {
    date: null,
    amount: null,
    type: null,
    category: null,
    description: null,
    paymentMethod: null
  };

  for (const h of headers) {
    const norm = normalizeHeaderKey(h);
    if (!result.date && (norm.includes('date') || norm.includes('datum'))) {
      result.date = h;
    } else if (
      !result.amount &&
      (norm.includes('amount') ||
        norm.includes('betrag') ||
        norm.includes('montant') ||
        norm.includes('total') ||
        norm.includes('sum') ||
        norm.includes('value'))
    ) {
      result.amount = h;
    } else if (
      !result.type &&
      (norm.includes('type') ||
        norm.includes('direction') ||
        norm.includes('kind') ||
        norm.includes('art'))
    ) {
      result.type = h;
    } else if (
      !result.category &&
      (norm.includes('category') ||
        norm.includes('kategorie') ||
        norm.includes('rubrik'))
    ) {
      result.category = h;
    } else if (
      !result.description &&
      (norm.includes('desc') ||
        norm.includes('memo') ||
        norm.includes('detail') ||
        norm.includes('narrative') ||
        norm.includes('payee') ||
        norm.includes('merchant') ||
        norm.includes('verwendungszweck') ||
        norm.includes('text') ||
        norm.includes('note'))
    ) {
      result.description = h;
    } else if (
      !result.paymentMethod &&
      (norm.includes('method') ||
        norm.includes('zahlungsart') ||
        norm.includes('instrument') ||
        norm.includes('payment'))
    ) {
      result.paymentMethod = h;
    }
  }

  return result;
}

/**
 * Parses financial amount string into Prisma.Decimal and infers sign/TxType if encoded.
 * Handles:
 * - Negative numbers or parenthesized numbers: "-12.50", "(50.00)"
 * - Currency symbols: "$ 1,234.50", "€ 50,00"
 * - European vs US decimal formats: "1.234,56" vs "1,234.56"
 */
export function parseImportAmount(rawVal: string): {
  amount: Prisma.Decimal;
  inferredType?: TxType;
} {
  let s = rawVal.trim();
  if (s.length === 0) {
    throw new Error('Empty amount value');
  }

  let isNegative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    isNegative = true;
    s = s.slice(1, -1).trim();
  } else if (s.startsWith('-')) {
    isNegative = true;
    s = s.slice(1).trim();
  } else if (s.endsWith('-')) {
    isNegative = true;
    s = s.slice(0, -1).trim();
  }

  // Remove currency symbols and whitespace
  s = s.replace(/[^0-9,.-]/g, '').trim();

  // Distinguish European decimal separator (1.234,56) from US (1,234.56)
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > lastDot && lastComma === s.length - 3) {
    // European format with 2 decimals
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastDot === s.length - 3) {
    // US format with 2 decimals
    s = s.replace(/,/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    // Comma as single decimal separator: "123,45"
    s = s.replace(',', '.');
  } else {
    // Strip all thousands separator commas
    s = s.replace(/,/g, '');
  }

  if (!LIMITS.MONEY.REGEX.test(s)) {
    throw new Error(`Invalid numeric amount format: "${rawVal}"`);
  }

  const dec = new Prisma.Decimal(s);
  if (dec.isZero() || dec.isNaN() || !dec.isFinite()) {
    throw new Error(`Amount must be positive and non-zero: "${rawVal}"`);
  }

  return {
    amount: dec,
    inferredType: isNegative ? TxType.EXPENSE : undefined
  };
}

/**
 * Normalizes input date into "YYYY-MM-DD". Supports ISO, MM/DD/YYYY, DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD.
 */
export function parseImportDate(rawVal: string): string {
  const s = rawVal.trim();
  if (isValidYmd(s)) {
    return s;
  }

  // YYYY/MM/DD
  const ySlashMatch = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(s);
  if (ySlashMatch) {
    const y = ySlashMatch[1];
    const m = ySlashMatch[2].padStart(2, '0');
    const d = ySlashMatch[3].padStart(2, '0');
    const cand = `${y}-${m}-${d}`;
    if (isValidYmd(cand)) return cand;
  }

  // MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (slashMatch) {
    const n1 = Number(slashMatch[1]);
    const n2 = Number(slashMatch[2]);
    const y = slashMatch[3];

    // If first number > 12, it must be DD/MM/YYYY
    if (n1 > 12 && n2 <= 12) {
      const cand = `${y}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
      if (isValidYmd(cand)) return cand;
    }

    // Default to YYYY-MM-DD (assume MM/DD/YYYY unless n1 > 12)
    const m = String(n1).padStart(2, '0');
    const d = String(n2).padStart(2, '0');
    const cand = `${y}-${m}-${d}`;
    if (isValidYmd(cand)) return cand;

    // Alternative DD/MM/YYYY
    const cand2 = `${y}-${d}-${m}`;
    if (isValidYmd(cand2)) return cand2;
  }

  throw new Error(`Unrecognized date format: "${rawVal}"`);
}

/**
 * Normalizes input payment method string into PaymentMethod enum.
 */
export function parseImportPaymentMethod(rawVal?: string | null): PaymentMethod {
  if (!rawVal) return PaymentMethod.OTHER;
  const s = rawVal.toLowerCase().replace(/[^a-z]/g, '');

  if (s.includes('cash')) return PaymentMethod.CASH;
  if (s.includes('card') || s.includes('credit') || s.includes('debit')) return PaymentMethod.CARD;
  if (s.includes('bank') || s.includes('transfer') || s.includes('wire') || s.includes('ach')) {
    return PaymentMethod.BANK_TRANSFER;
  }
  if (s.includes('upi')) return PaymentMethod.UPI;

  return PaymentMethod.OTHER;
}
