/**
 * V7 T131 — seed hygiene. Placeholder projects ("Project 5"…"Project 11")
 * polluted the real portfolio on every exec walkthrough. This lint-style test
 * bans them from ever re-entering the seeds: no project named /^Project \d+/
 * (incl. "Project 3 - TBC" variants) may exist in the seed SQL, and the four
 * real projects must be present.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SEED_PATH = join(__dirname, '..', 'scripts', 'seed-baseline-projects.sql');

describe('seed-baseline-projects.sql hygiene (V7 T131)', () => {
  const sql = readFileSync(SEED_PATH, 'utf8');

  it('contains no placeholder project names', () => {
    // Match any quoted name of the form 'Project <digits>...' (covers
    // "Project 5" and "Project 3 - TBC").
    const placeholder = /'Project \d+[^']*'/g;
    const hits = sql.match(placeholder) ?? [];
    expect(hits).toEqual([]);
  });

  it('seeds the four real projects', () => {
    for (const name of [
      '6 Great Circle',
      '84 Sunset Beach Road',
      '540 Hands Creek',
      'North Haven',
    ]) {
      expect(sql).toContain(`'${name}'`);
    }
  });

  it('84 Sunset Beach Road carries the confirmed sqft split (5,317 AG / 2,479 BG)', () => {
    // Guards against the stale 6500/1296 split re-entering via a seed regen.
    const row = sql.split('\n').find((l) => l.includes(`'84 Sunset Beach Road'`)) ?? '';
    expect(row).toContain(' 5317, 2479,');
  });
});
