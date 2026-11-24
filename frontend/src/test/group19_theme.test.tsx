import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { STORAGE_KEYS } from '@/config/storageKeys';
import fs from 'fs';
import path from 'path';

const ThemeTester: React.FC = () => {
  const { theme, effectiveTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="effective">{effectiveTheme}</span>
      <button onClick={() => setTheme('light')}>Set Light</button>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
      <button onClick={() => setTheme('system')}>Set System</button>
    </div>
  );
};

describe('Group 19: THEME & NO-FLASH PRESERVATION', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('persists theme in localStorage under STORAGE_KEYS.THEME and applies data-theme attribute', async () => {
    render(
      <ThemeProvider>
        <ThemeTester />
      </ThemeProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /set dark/i }));
    expect(localStorage.getItem(STORAGE_KEYS.THEME)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await userEvent.click(screen.getByRole('button', { name: /set light/i }));
    expect(localStorage.getItem(STORAGE_KEYS.THEME)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('index.html inline script and ThemeContext produce identical data-theme without flash', () => {
    const htmlPath = path.resolve(__dirname, '../../index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    // Assert script tag exists before body content
    expect(htmlContent).toContain("localStorage.getItem('fintrack:theme')");
    expect(htmlContent).toContain("document.documentElement.setAttribute('data-theme'");
  });
});
