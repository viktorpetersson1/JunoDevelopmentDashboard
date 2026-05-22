import { describe, expect, it } from 'vitest';

// Smoke test for T001 — confirms Vitest is wired and runs at least one assertion.
// Replace with real coverage as components ship in T004+.
describe('atlas/scaffold', () => {
  it('sanity check', () => {
    expect(1 + 1).toBe(2);
  });
});
