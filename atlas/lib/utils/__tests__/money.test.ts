import { describe, expect, it } from 'vitest';
import { toCents, fromCents, addCents, mulPercentBps, formatMoney } from '../money';

describe('toCents / fromCents', () => {
  it('round-trips integer dollars exactly', () => {
    expect(toCents(100)).toBe(10000);
    expect(fromCents(10000)).toBe(100);
  });

  it('rounds to nearest cent', () => {
    expect(toCents(0.005)).toBe(1); // 0.5 cents -> 1 cent (round half up via Math.round)
    expect(toCents(0.004)).toBe(0);
    expect(toCents(12.345)).toBe(1235);
  });

  it('throws on non-finite input', () => {
    expect(() => toCents(Infinity)).toThrow(/non-finite/);
    expect(() => toCents(NaN)).toThrow(/non-finite/);
  });

  it('fromCents rejects non-integer input', () => {
    expect(() => fromCents(1.5)).toThrow(/non-integer/);
  });
});

describe('addCents', () => {
  it('sums any number of integer cent values', () => {
    expect(addCents()).toBe(0);
    expect(addCents(100)).toBe(100);
    expect(addCents(100, 200, 300)).toBe(600);
  });

  it('rejects non-integer input', () => {
    expect(() => addCents(1.5)).toThrow(/non-integer/);
  });
});

describe('mulPercentBps', () => {
  it('multiplies cents by basis points correctly', () => {
    expect(mulPercentBps(1_000_000, 7500)).toBe(750_000); // 75% of $10k
    expect(mulPercentBps(1_000_000, 250)).toBe(25_000); //  2.5% of $10k
    expect(mulPercentBps(1_000_000, 10000)).toBe(1_000_000); // 100%
    expect(mulPercentBps(1_000_000, 0)).toBe(0);
  });

  it('rounds to nearest cent', () => {
    // 333 bps of $100 = $3.33 = 333 cents
    expect(mulPercentBps(10_000, 333)).toBe(333);
    // 1 bps of $100 = $0.01 = 1 cent (round)
    expect(mulPercentBps(10_000, 1)).toBe(1);
  });

  it('rejects non-integer inputs', () => {
    expect(() => mulPercentBps(1.5, 7500)).toThrow();
    expect(() => mulPercentBps(1000, 7.5)).toThrow();
  });
});

describe('formatMoney', () => {
  it('formats integer USD by default', () => {
    expect(formatMoney(123_456_789)).toBe('$1,234,568'); // rounds to whole $
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(-100_000)).toBe('-$1,000');
  });

  it('honours precision', () => {
    expect(formatMoney(123_456_789, { precision: 2 })).toBe('$1,234,567.89');
  });

  it('compact notation', () => {
    // Different Node ICU versions produce slightly different compact strings
    // (e.g. "$1.23M" vs "$1.2M"). Match the leading-money pattern.
    const out = formatMoney(123_456_789, { compact: true });
    expect(out).toMatch(/^\$1\.[0-9]+M$/);
  });

  it('throws on non-finite input', () => {
    expect(() => formatMoney(NaN)).toThrow();
  });
});
