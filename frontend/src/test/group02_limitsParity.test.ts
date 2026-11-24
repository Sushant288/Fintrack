import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Group 2: LIMITS PARITY', () => {
  it('asserts parity between server limits.ts and client limits.ts for shared numeric exports', () => {
    const serverLimitsPath = path.resolve(process.cwd(), '../backend/src/config/limits.ts');
    expect(fs.existsSync(serverLimitsPath)).toBe(true);
    const serverContent = fs.readFileSync(serverLimitsPath, 'utf-8');
    const clientLimitsPath = path.resolve(__dirname, '../config/limits.ts');
    const clientContent = fs.readFileSync(clientLimitsPath, 'utf-8');

    // Extract all `export const NAME = <number>` from client limits
    const clientExportMatches = Array.from(
      clientContent.matchAll(/export\s+const\s+([A-Z0-9_]+)\s*=\s*(\d+);/g)
    );

    expect(clientExportMatches.length).toBeGreaterThan(10);

    for (const match of clientExportMatches) {
      const name = match[1];
      const clientVal = Number(match[2]);

      // If server file also defines this constant either directly or in LIMITS
      // Check that client limits correctly mirror server limits
      const serverConstRegex = new RegExp(`(?:const|export const|${name}:)\\s*=?\\s*(\\d+)`);
      const serverMatch = serverContent.match(serverConstRegex);
      if (serverMatch) {
        const serverVal = Number(serverMatch[1]);
        expect(clientVal).toBe(serverVal);
      }
    }
  });

  it('asserts that client validators import limits strictly from config/limits', () => {
    const validatorsPath = path.resolve(__dirname, '../utils/validators.ts');
    const content = fs.readFileSync(validatorsPath, 'utf-8');

    // Find all imports in validators.ts
    const importStatements = Array.from(content.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g));
    const limitsImport = importStatements.find((imp) => imp[2].includes('config/limits'));

    expect(limitsImport).toBeDefined();

    // Verify key limit names are imported from config/limits
    const importedLimits = limitsImport![1];
    expect(importedLimits).toContain('PASSWORD_MIN_LENGTH');
    expect(importedLimits).toContain('PASSWORD_MAX_LENGTH');
    expect(importedLimits).toContain('PASSWORD_MAX_BYTES');
    expect(importedLimits).toContain('USER_NAME_MAX_LENGTH');
    expect(importedLimits).toContain('CATEGORY_NAME_MAX_LENGTH');
  });
});
