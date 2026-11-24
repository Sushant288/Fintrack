import { isKnownRoute } from '@/config/routes';

export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target || typeof target !== 'string') {
    return fallback;
  }

  const trimmed = target.trim();

  // Reject empty string or anything not starting with exactly one '/'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }

  // Reject URLs with embedded schemes or protocols
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.toLowerCase().includes('javascript:')) {
    return fallback;
  }

  // Check known route prefix
  if (!isKnownRoute(trimmed)) {
    return fallback;
  }

  return trimmed;
}
