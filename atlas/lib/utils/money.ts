/**
 * Money utilities. All monetary values flow through as **integer cents** —
 * a JS `number` safely represents 2^53 ≈ 9 quadrillion cents = $90 trillion,
 * which is comfortably above Juno's lifetime portfolio scale.
 *
 * Per CLAUDE.md §7: never store floats for currency. Convert at the boundary
 * via `toCents()`/`fromCents()`; arithmetic in the middle is always cents.
 *
 * For percentages we use **basis points** (integer; 100 bps = 1%). See
 * `mulPercentBps()`. The atlas.* schema mirrors this convention.
 */

/**
 * Convert a dollar amount (float) to cents (integer).
 * Rounds to nearest cent — never silently truncates.
 *
 *   toCents(12.345)  // 1235
 *   toCents(0.005)   // 1  (round-half-to-even is fine — Math.round is half-up)
 */
export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars)) {
    throw new RangeError(`toCents: non-finite input ${dollars}`);
  }
  return Math.round(dollars * 100);
}

/** Convert cents (integer) back to dollars (float). */
export function fromCents(cents: number): number {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`fromCents: non-integer input ${cents}`);
  }
  return cents / 100;
}

/** Sum a list of cent values. Returns integer cents. */
export function addCents(...values: number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) {
      throw new RangeError(`addCents: non-integer input ${v}`);
    }
    total += v;
  }
  return total;
}

/**
 * Multiply a cent amount by a basis-points percentage.
 *   mulPercentBps(1_000_000, 7500) // 750_000  (75% of $10k)
 *   mulPercentBps(1_000_000, 250)  // 25_000   (2.5% of $10k)
 * Result rounds to nearest cent.
 */
export function mulPercentBps(cents: number, bps: number): number {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`mulPercentBps: cents must be integer (${cents})`);
  }
  if (!Number.isInteger(bps)) {
    throw new RangeError(`mulPercentBps: bps must be integer (${bps})`);
  }
  return Math.round((cents * bps) / 10000);
}

/**
 * Format cents as a USD string. Defaults to no fractional cents (e.g. $1,234).
 *   formatMoney(123_456_789)                 // "$1,234,568"
 *   formatMoney(123_456_789, { compact: true })   // "$1.23M"
 *   formatMoney(123_456_789, { precision: 2 })    // "$1,234,567.89"
 */
export interface FormatMoneyOptions {
  /** Use compact notation ("$1.23M" instead of "$1,234,568"). */
  compact?: boolean;
  /** Decimal places. Default 0 (whole dollars). */
  precision?: number;
  /** ISO 4217 currency code. Default 'USD'. */
  currency?: string;
}

const formatterCache = new Map<string, Intl.NumberFormat>();
function getFormatter(opts: FormatMoneyOptions): Intl.NumberFormat {
  const key = `${opts.compact ? 'c' : 'r'}|${opts.precision ?? 0}|${opts.currency ?? 'USD'}`;
  let f = formatterCache.get(key);
  if (!f) {
    // Compact mode uses default Intl fraction digits (1-2) so $1.23M renders
    // as "$1.23M" instead of "$1M". Standard mode honours the precision opt.
    const fractionDigits = opts.precision ?? 0;
    const init: Intl.NumberFormatOptions = {
      style: 'currency',
      currency: opts.currency ?? 'USD',
      notation: opts.compact ? 'compact' : 'standard',
    };
    if (!opts.compact) {
      init.minimumFractionDigits = fractionDigits;
      init.maximumFractionDigits = fractionDigits;
    } else if (opts.precision !== undefined) {
      // Compact + explicit precision: cap fraction digits
      init.maximumFractionDigits = fractionDigits;
    }
    f = new Intl.NumberFormat('en-US', init);
    formatterCache.set(key, f);
  }
  return f;
}

export function formatMoney(cents: number, opts: FormatMoneyOptions = {}): string {
  if (!Number.isFinite(cents)) {
    throw new RangeError(`formatMoney: non-finite input ${cents}`);
  }
  return getFormatter(opts).format(cents / 100);
}
