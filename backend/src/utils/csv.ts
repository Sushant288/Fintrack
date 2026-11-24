import { Prisma } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { ApiError, ERROR_CODES } from './ApiError';

const FORMULA_TRIGGER_CHARS = new Set(LIMITS.CSV.FORMULA_CHARS);

/**
 * Sanitizes a cell value to prevent CSV Formula Injection (CWE-1236).
 * Escapes cells starting with =, +, -, @, \t, or \r by prepending a single quote (').
 * Numbers and numeric decimals are safe and are not prefixed.
 */
export function sanitizeCell(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }

  if (typeof val === 'number') {
    return String(val);
  }

  if (val instanceof Prisma.Decimal) {
    return val.toString();
  }

  if (val instanceof Date) {
    return val.toISOString();
  }

  const str = String(val);
  if (str.length === 0) {
    return '';
  }

  // Safe negative numbers or scientific notation
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(str.trim())) {
    return str;
  }

  // If the string begins with an injection trigger character, prepend a single quote
  const firstChar = str.charAt(0);
  if (FORMULA_TRIGGER_CHARS.has(firstChar as any)) {
    return `'${str}`;
  }

  return str;
}

/**
 * Reverses the single quote prefix added during CSV sanitization when reading user descriptions.
 */
export function unsanitizeCell(val: string): string {
  if (val.length >= 2 && val.charAt(0) === "'") {
    const nextChar = val.charAt(1);
    if (FORMULA_TRIGGER_CHARS.has(nextChar as any)) {
      return val.slice(1);
    }
  }
  return val;
}

/**
 * Escapes a single CSV field per RFC 4180 rules.
 */
export function escapeField(val: string): string {
  if (/[",\r\n]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/**
 * Converts an array of cell values into a compliant RFC 4180 CSV row with CRLF newline.
 */
export function toCsvLine(cells: unknown[]): string {
  return cells.map((cell) => escapeField(sanitizeCell(cell))).join(',') + '\r\n';
}

/**
 * Asserts that the export row count does not exceed policy limits.
 */
export function assertExportSize(count: number): void {
  if (count > LIMITS.EXPORT.MAX_ROWS) {
    throw ApiError.badRequest(
      ERROR_CODES.EXPORT_TOO_LARGE,
      `Export query matches ${count} rows, which exceeds the maximum allowed limit of ${LIMITS.EXPORT.MAX_ROWS}`
    );
  }
}
