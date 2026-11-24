import { describe, it, expect } from 'vitest';
import { safeRedirect } from '@/utils/safeRedirect';

describe('Group 4: SAFE REDIRECT', () => {
  it('accepts safe same-origin paths with query strings or hashes', () => {
    expect(safeRedirect('/categories?x=1')).toBe('/categories?x=1');
    expect(safeRedirect('/settings#alerts')).toBe('/settings#alerts');
    expect(safeRedirect('/')).toBe('/');
    expect(safeRedirect('/login')).toBe('/login');
    expect(safeRedirect('/register')).toBe('/register');
  });

  it('rejects protocol-relative and external domain URLs', () => {
    expect(safeRedirect('//evil.com')).toBe('/');
    expect(safeRedirect('https://evil.com')).toBe('/');
    expect(safeRedirect('http://evil.com/login')).toBe('/');
  });

  it('rejects backslash evasion attempts', () => {
    expect(safeRedirect('/\\evil.com')).toBe('/');
    expect(safeRedirect('\\evil.com')).toBe('/');
  });

  it('rejects script execution schemes', () => {
    expect(safeRedirect('javascript:alert(1)')).toBe('/');
    expect(safeRedirect('JAVASCRIPT:alert(1)')).toBe('/');
    expect(safeRedirect('data:text/html,evil')).toBe('/');
  });

  it('rejects empty, null, undefined or non-string inputs', () => {
    expect(safeRedirect('')).toBe('/');
    expect(safeRedirect(null)).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
    expect(safeRedirect('   ')).toBe('/');
  });

  it('redirects unknown route prefixes to fallback home', () => {
    expect(safeRedirect('/unknown-prefix-123')).toBe('/');
    expect(safeRedirect('/admin/dashboard', '/custom-fallback')).toBe('/custom-fallback');
  });
});
