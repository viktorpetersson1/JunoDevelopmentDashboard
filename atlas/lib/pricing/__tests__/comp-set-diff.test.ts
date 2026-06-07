/** V6.1.5-018 Phase 2 — comp-set diff drives the "what changed?" message. */
import { describe, it, expect } from 'vitest';
import { diffCompSets, summarizeChange, type DiffComp } from '@/lib/pricing/comp-set-diff';

const c = (address: string, psf: number, status: 'closed' | 'active' = 'closed'): DiffComp => ({
  address,
  psf,
  status,
});

describe('diffCompSets', () => {
  it('reports no material change for an identical set', () => {
    const set = [c('A', 1000), c('B', 1200)];
    const d = diffCompSets(set, [...set]);
    expect(d.materiallyChanged).toBe(false);
    expect(summarizeChange(d)).toMatch(/no material/i);
  });

  it('detects an added and a removed comp', () => {
    const d = diffCompSets([c('A', 1000)], [c('A', 1000), c('B', 1300)]);
    expect(d.added).toEqual(['B']);
    expect(d.removed).toEqual([]);
    expect(d.materiallyChanged).toBe(true);

    const d2 = diffCompSets([c('A', 1000), c('B', 1300)], [c('A', 1000)]);
    expect(d2.removed).toEqual(['B']);
  });

  it('detects a status flip (active → closed)', () => {
    const d = diffCompSets([c('A', 1400, 'active')], [c('A', 1400, 'closed')]);
    expect(d.statusFlips).toEqual([{ address: 'A', from: 'active', to: 'closed' }]);
    expect(d.materiallyChanged).toBe(true);
  });

  it('flags a reprice only above the threshold', () => {
    expect(diffCompSets([c('A', 1000)], [c('A', 1020)]).repriced).toEqual([]); // +2% < 3%
    const d = diffCompSets([c('A', 1000)], [c('A', 1100)]); // +10%
    expect(d.repriced).toEqual([{ address: 'A', fromPsf: 1000, toPsf: 1100 }]);
    expect(d.materiallyChanged).toBe(true);
  });

  it('is case/whitespace-insensitive on address matching', () => {
    const d = diffCompSets([c(' 12 Main St ', 1000)], [c('12 main st', 1000)]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.materiallyChanged).toBe(false);
  });
});
