import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CATEGORY_ICONS, getCategoryIcon, FALLBACK_CATEGORY_ICON } from '@/config/categoryIcons';
import { Tag } from 'lucide-react';

describe('Group 3: ICON PARITY', () => {
  it('every icon slug used in server category.defaults.ts exists in client categoryIcons registry', () => {
    const defaultsPath = path.resolve(process.cwd(), '../backend/src/services/category.defaults.ts');
    expect(fs.existsSync(defaultsPath)).toBe(true);
    const content = fs.readFileSync(defaultsPath, 'utf-8');

    // Extract all icon: '<slug>' from category.defaults.ts
    const matches = Array.from(content.matchAll(/icon:\s*['"]([a-z0-9-]+)['"]/g));
    expect(matches.length).toBeGreaterThan(10);

    const slugs = Array.from(new Set(matches.map((m) => m[1])));

    for (const slug of slugs) {
      expect(
        CATEGORY_ICONS[slug],
        `Expected slug "${slug}" from category.defaults.ts to exist in CATEGORY_ICONS`
      ).toBeDefined();
    }
  });

  it('unknown or missing slug falls back gracefully to Tag icon', () => {
    expect(getCategoryIcon('completely-unknown-slug-xyz')).toBe(Tag);
    expect(getCategoryIcon(null)).toBe(FALLBACK_CATEGORY_ICON);
    expect(getCategoryIcon(undefined)).toBe(FALLBACK_CATEGORY_ICON);
    expect(getCategoryIcon('')).toBe(FALLBACK_CATEGORY_ICON);
  });
});
