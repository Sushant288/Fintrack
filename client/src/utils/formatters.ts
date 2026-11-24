/**
 * Exact decimal and date formatting utilities using standard Intl APIs.
 */

export function formatMoney(amount: string | number, currency = 'USD'): string {
  try {
    // Format without float conversion precision loss where supported
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    // Node and modern browsers support passing string/bigint directly or via safe Decimal wrapper
    if (typeof amount === 'string') {
      // Single typed helper with one-line cast to satisfy TypeScript Intl.NumberFormat definition
      return formatter.format(amount as unknown as number);
    }
    return formatter.format(amount);
  } catch {
    const val = typeof amount === 'number' ? amount.toFixed(2) : amount;
    return `${currency} ${val}`;
  }
}

export function formatDate(date: string | Date, timezone = 'UTC'): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(d);
  } catch {
    return String(date);
  }
}

export function formatDateTime(date: string | Date, timezone = 'UTC'): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  } catch {
    return String(date);
  }
}

export function formatPlural(
  count: number,
  words: { zero?: string; one: string; other: string }
): string {
  if (count === 0 && words.zero) {
    return words.zero;
  }
  const rules = new Intl.PluralRules('en-US');
  const rule = rules.select(count);
  const word = rule === 'one' ? words.one : words.other;
  return `${count} ${word}`;
}
