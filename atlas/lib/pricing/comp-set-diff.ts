/**
 * V6.1.5-018 (Phase 2) — compare two comp sets to decide whether an "Update
 * comps from market" pull actually changed anything material. If nothing
 * material changed, the deterministic launch price won't move — so we tell the
 * user "no material change" instead of implying the market shifted.
 *
 * Material change = a comp appeared or disappeared, a listing flipped status
 * (e.g. active → closed / under contract), or an existing comp's $/SF moved more
 * than `psfMovePct` (default 3%). Pure + edge-safe; no I/O.
 */

export interface DiffComp {
  address: string;
  psf: number;
  status: 'closed' | 'active';
}

export interface CompSetChange {
  added: string[];
  removed: string[];
  repriced: { address: string; fromPsf: number; toPsf: number }[];
  statusFlips: { address: string; from: string; to: string }[];
  materiallyChanged: boolean;
}

const DEFAULT_PSF_MOVE_PCT = 3;

function key(address: string): string {
  return address.trim().toLowerCase();
}

export function diffCompSets(
  before: DiffComp[],
  after: DiffComp[],
  opts?: { psfMovePct?: number }
): CompSetChange {
  const movePct = opts?.psfMovePct ?? DEFAULT_PSF_MOVE_PCT;
  const beforeByKey = new Map(before.map((c) => [key(c.address), c]));
  const afterByKey = new Map(after.map((c) => [key(c.address), c]));

  const added = after.filter((c) => !beforeByKey.has(key(c.address))).map((c) => c.address);
  const removed = before.filter((c) => !afterByKey.has(key(c.address))).map((c) => c.address);

  const repriced: CompSetChange['repriced'] = [];
  const statusFlips: CompSetChange['statusFlips'] = [];
  for (const a of after) {
    const b = beforeByKey.get(key(a.address));
    if (!b) continue;
    if (b.status !== a.status) {
      statusFlips.push({ address: a.address, from: b.status, to: a.status });
    }
    if (b.psf > 0) {
      const deltaPct = Math.abs((a.psf - b.psf) / b.psf) * 100;
      if (deltaPct > movePct) {
        repriced.push({ address: a.address, fromPsf: Math.round(b.psf), toPsf: Math.round(a.psf) });
      }
    }
  }

  const materiallyChanged =
    added.length > 0 || removed.length > 0 || repriced.length > 0 || statusFlips.length > 0;

  return { added, removed, repriced, statusFlips, materiallyChanged };
}

/** One-line human summary for the UI / toast. */
export function summarizeChange(change: CompSetChange): string {
  if (!change.materiallyChanged) return 'No material comp changes — price held.';
  const bits: string[] = [];
  if (change.added.length) bits.push(`${change.added.length} new`);
  if (change.removed.length) bits.push(`${change.removed.length} gone`);
  if (change.statusFlips.length) bits.push(`${change.statusFlips.length} status change`);
  if (change.repriced.length) bits.push(`${change.repriced.length} repriced`);
  return `Comps updated: ${bits.join(' · ')}.`;
}
