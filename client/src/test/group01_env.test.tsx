import { describe, it, expect } from 'vitest';
import { validateEnv } from '@/config/env';
import { render, screen } from '@testing-library/react';
import { ConfigError } from '@/components/layout/ConfigError';

describe('Group 1: ENV validation', () => {
  it('validates a correct VITE_API_URL and strips trailing slashes', () => {
    const raw = { VITE_API_URL: 'http://localhost:4000/api/v1/' };
    const res = validateEnv(raw);
    expect(res.success).toBe(true);
    expect(res.data?.VITE_API_URL).toBe('http://localhost:4000/api/v1');
  });

  it('fails when VITE_API_URL is missing or empty', () => {
    const res1 = validateEnv({});
    expect(res1.success).toBe(false);
    expect(res1.error).toBeDefined();

    const res2 = validateEnv({ VITE_API_URL: '' });
    expect(res2.success).toBe(false);
  });

  it('fails when VITE_API_URL is not an absolute URL', () => {
    const res = validateEnv({ VITE_API_URL: 'not-a-valid-url' });
    expect(res.success).toBe(false);
  });

  it('renders ConfigError component with error details', () => {
    const res = validateEnv({});
    if (!res.error) throw new Error('Expected error');

    render(<ConfigError error={res.error} />);
    expect(screen.getByRole('heading', { name: /configuration error/i })).toBeInTheDocument();
    expect(screen.getAllByText(/VITE_API_URL/i).length).toBeGreaterThan(0);
  });
});
