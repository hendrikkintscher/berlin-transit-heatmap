import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The app version lives in three places: VERSION (the template's steps.sh), the root
// package.json and packages/web/package.json (shown in the Mehr menu and tagged vX.Y.Z on
// merge by .github/workflows/tag-version.yml). They must always agree.
const read = (path) => readFileSync(path, 'utf8');
const versionOf = (pkg) => JSON.parse(read(pkg)).version;

describe('app version', () => {
  it('is the same in VERSION and both package.json files', () => {
    const version = read('VERSION').trim();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(versionOf('package.json')).toBe(version);
    expect(versionOf('packages/web/package.json')).toBe(version);
  });

  it('is bumped in all three places by steps.sh bump', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bump-'));
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, 'packages/web'), { recursive: true });
    cpSync('scripts/steps.sh', join(dir, 'scripts/steps.sh'));
    writeFileSync(join(dir, 'VERSION'), '0.13.17\n');
    const pkg = (name) =>
      `{\n  "name": "${name}",\n  "version": "0.13.17",\n  "dependencies": {\n    "x": { "version": "9.9.9" }\n  }\n}\n`;
    writeFileSync(join(dir, 'package.json'), pkg('root'));
    writeFileSync(join(dir, 'packages/web/package.json'), pkg('web'));
    writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n- Something\n');
    const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
    execFileSync('bash', [join(dir, 'scripts/steps.sh'), 'bump'], { env });
    expect(read(join(dir, 'VERSION')).trim()).toBe('0.13.18');
    for (const p of ['package.json', 'packages/web/package.json']) {
      expect(versionOf(join(dir, p))).toBe('0.13.18');
      expect(read(join(dir, p))).toContain('"version": "9.9.9"');
    }
    expect(read(join(dir, 'CHANGELOG.md'))).toMatch(/## \[Unreleased\]\n\n## \[0\.13\.18\] — /);
    execFileSync('bash', [join(dir, 'scripts/steps.sh'), 'bump', 'minor'], { env });
    expect(versionOf(join(dir, 'packages/web/package.json'))).toBe('0.14.0');
  });
});
