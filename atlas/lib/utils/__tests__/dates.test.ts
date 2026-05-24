import { describe, expect, it } from 'vitest';
import {
  parseYM,
  formatYM,
  addMonthsYM,
  diffMonthsYM,
  buildTimeline,
  addMonthsExcel,
} from '../dates';

describe('parseYM / formatYM', () => {
  it('round-trips valid YYYY-MM', () => {
    expect(parseYM('2026-03')).toEqual({ y: 2026, m: 3 });
    expect(formatYM({ y: 2026, m: 3 })).toBe('2026-03');
    expect(formatYM({ y: 2030, m: 12 })).toBe('2030-12');
  });

  it('rejects malformed strings', () => {
    expect(() => parseYM('2026-3')).toThrow();
    expect(() => parseYM('2026/03')).toThrow();
    expect(() => parseYM('xx-yy')).toThrow();
    expect(() => parseYM('2026-13')).toThrow(/1-12/);
    expect(() => parseYM('2026-00')).toThrow(/1-12/);
  });

  it('formatYM rejects bad month', () => {
    expect(() => formatYM({ y: 2026, m: 0 })).toThrow();
    expect(() => formatYM({ y: 2026, m: 13 })).toThrow();
  });
});

describe('addMonthsYM', () => {
  it('adds positive months', () => {
    expect(addMonthsYM('2026-03', 1)).toBe('2026-04');
    expect(addMonthsYM('2026-03', 12)).toBe('2027-03');
    expect(addMonthsYM('2026-12', 1)).toBe('2027-01');
  });

  it('adds zero', () => {
    expect(addMonthsYM('2026-03', 0)).toBe('2026-03');
  });

  it('subtracts (negative n)', () => {
    expect(addMonthsYM('2026-03', -1)).toBe('2026-02');
    expect(addMonthsYM('2026-01', -1)).toBe('2025-12');
    expect(addMonthsYM('2026-03', -14)).toBe('2025-01');
  });

  it('truncates fractional n (matches vanilla)', () => {
    expect(addMonthsYM('2026-03', 1.7)).toBe('2026-04');
    expect(addMonthsYM('2026-03', -0.4)).toBe('2026-03');
  });
});

describe('diffMonthsYM', () => {
  it('returns 0 for same month', () => {
    expect(diffMonthsYM('2026-03', '2026-03')).toBe(0);
  });

  it('positive when end > start', () => {
    expect(diffMonthsYM('2026-01', '2026-12')).toBe(11);
    expect(diffMonthsYM('2026-01', '2027-01')).toBe(12);
  });

  it('negative when end < start', () => {
    expect(diffMonthsYM('2026-12', '2026-01')).toBe(-11);
  });
});

describe('buildTimeline', () => {
  it('builds a contiguous monthly grid', () => {
    expect(buildTimeline('2026-01', 0)).toEqual([]);
    expect(buildTimeline('2026-01', 3)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(buildTimeline('2026-11', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('rejects bad horizon', () => {
    expect(() => buildTimeline('2026-01', -1)).toThrow();
    expect(() => buildTimeline('2026-01', 1.5)).toThrow();
  });
});

describe('addMonthsExcel (EDATE compatibility)', () => {
  it('preserves day when target month is long enough', () => {
    expect(addMonthsExcel('2026-03-15', 6)).toBe('2026-09-15');
    expect(addMonthsExcel('2026-01-15', 1)).toBe('2026-02-15');
  });

  it('clamps day to last-of-month when target is shorter (Jan 31 -> Feb 28)', () => {
    expect(addMonthsExcel('2026-01-31', 1)).toBe('2026-02-28');
    // March 31 -> April only has 30 days
    expect(addMonthsExcel('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('handles leap years (2024 is leap, 2026 is not)', () => {
    expect(addMonthsExcel('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsExcel('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonthsExcel('2024-01-29', 1)).toBe('2024-02-29');
  });

  it('rolls across year boundary', () => {
    expect(addMonthsExcel('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonthsExcel('2026-12-31', 2)).toBe('2027-02-28');
  });

  it('subtracts (negative n) with clamp', () => {
    expect(addMonthsExcel('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsExcel('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('zero is identity', () => {
    expect(addMonthsExcel('2026-03-15', 0)).toBe('2026-03-15');
  });

  it('property: addMonthsExcel(d, n) === iterating add-1 n times (for non-clamp cases)', () => {
    // Picks day-of-month <=28 so clamp never fires; tests composability
    const start = '2026-03-15';
    for (const n of [1, 3, 7, 12, 18, 24]) {
      let iter = start;
      for (let i = 0; i < n; i++) iter = addMonthsExcel(iter, 1);
      expect(addMonthsExcel(start, n)).toBe(iter);
    }
  });

  it('rejects malformed dates', () => {
    expect(() => addMonthsExcel('2026-3-1', 1)).toThrow();
    expect(() => addMonthsExcel('2026-13-01', 1)).toThrow();
    expect(() => addMonthsExcel('2026-02-32', 1)).toThrow();
  });
});
