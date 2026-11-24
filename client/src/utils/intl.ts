export interface CurrencyOption {
  code: string;
  name: string;
}

export interface TimeZoneOption {
  value: string;
  label: string;
  offsetMinutes: number;
}

let cachedCurrencies: CurrencyOption[] | null = null;
let cachedTimeZones: TimeZoneOption[] | null = null;

export function getCurrencies(): CurrencyOption[] {
  if (cachedCurrencies) return cachedCurrencies;

  try {
    const intlAny = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
    const codes = typeof intlAny.supportedValuesOf === 'function'
      ? intlAny.supportedValuesOf('currency')
      : ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR', 'CHF'];

    const displayNames = new Intl.DisplayNames(['en'], { type: 'currency' });

    cachedCurrencies = codes
      .map((code: string) => {
        let name = code;
        try {
          name = displayNames.of(code) || code;
        } catch {
          name = code;
        }
        return { code, name: `${code} - ${name}` };
      })
      .sort((a: CurrencyOption, b: CurrencyOption) => a.code.localeCompare(b.code));
  } catch {
    cachedCurrencies = [
      { code: 'USD', name: 'USD - US Dollar' },
      { code: 'EUR', name: 'EUR - Euro' },
      { code: 'GBP', name: 'GBP - British Pound' },
      { code: 'CAD', name: 'CAD - Canadian Dollar' },
      { code: 'AUD', name: 'AUD - Australian Dollar' },
      { code: 'JPY', name: 'JPY - Japanese Yen' },
      { code: 'INR', name: 'INR - Indian Rupee' }
    ];
  }

  return cachedCurrencies || [];
}

export function getTimeZones(): TimeZoneOption[] {
  if (cachedTimeZones) return cachedTimeZones;

  try {
    const intlAny = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
    let zones = typeof intlAny.supportedValuesOf === 'function'
      ? intlAny.supportedValuesOf('timeZone')
      : ['UTC'];

    if (!zones.includes('UTC')) {
      zones = ['UTC', ...zones];
    }

    const now = new Date();
    cachedTimeZones = zones
      .map((value: string) => {
        let offsetMinutes = 0;
        let formattedOffset = '+00:00';
        try {
          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: value,
            timeZoneName: 'longOffset'
          });
          const parts = formatter.formatToParts(now);
          const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
          const match = tzPart.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
          if (match) {
            const sign = match[1] === '-' ? -1 : 1;
            const hours = parseInt(match[2], 10);
            const mins = match[3] ? parseInt(match[3], 10) : 0;
            offsetMinutes = sign * (hours * 60 + mins);
            formattedOffset = `${match[1]}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
          }
        } catch {
          offsetMinutes = 0;
          formattedOffset = '+00:00';
        }

        return {
          value,
          label: `(UTC${formattedOffset}) ${value.replace(/_/g, ' ')}`,
          offsetMinutes
        };
      })
      .sort((a: TimeZoneOption, b: TimeZoneOption) => {
        if (a.offsetMinutes !== b.offsetMinutes) {
          return a.offsetMinutes - b.offsetMinutes;
        }
        return a.value.localeCompare(b.value);
      });
  } catch {
    cachedTimeZones = [{ value: 'UTC', label: '(UTC+00:00) UTC', offsetMinutes: 0 }];
  }

  return cachedTimeZones || [];
}
