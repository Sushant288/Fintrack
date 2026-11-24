import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Group 30: BUILD GATES & SCRIPT VERIFICATION', () => {
  it('package.json includes required scripts: dev, build, preview, typecheck, lint, test, test:watch, test:ci', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    expect(pkg.scripts.dev).toBeDefined();
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.preview).toBeDefined();
    expect(pkg.scripts.typecheck).toBeDefined();
    expect(pkg.scripts.lint).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();
    expect(pkg.scripts['test:watch']).toBeDefined();
    expect(pkg.scripts['test:ci']).toBeDefined();
  });
});
