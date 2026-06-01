/**
 * T095.1 — commitment-tier derivation.
 *
 * Splits projects into two governance tiers for the platform's most important
 * visual distinction (committed vs prospect):
 *
 *   committed = has a REAL address AND is past sourcing
 *   prospect  = everything else (no/placeholder address, or still sourcing)
 *
 * NB (V5.2 correction): the V5.2 doc gated on `project.address_pending`, but
 * that column was dropped in V4 (T090) — every consumer now gates on the
 * address being null/empty/"TBC". This helper is the single source of truth so
 * the project card, pipeline board, dashboard, and earnings table all agree.
 *
 * "Beyond sourcing" is defined as `stage !== 'sourcing'` rather than an
 * explicit allow-list, so it stays correct if new post-sourcing stages are
 * added (the live stages are sourcing / pre_construction / construction / sales).
 */

export type CommitmentTier = 'committed' | 'prospect';

/** True when `address` is a real, confirmed address (not null / blank / "TBC"). */
export function hasRealAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const t = address.trim();
  return t !== '' && t.toUpperCase() !== 'TBC';
}

export function getCommitmentTier(project: {
  address?: string | null;
  stage?: string | null;
}): CommitmentTier {
  const beyondSourcing = !!project.stage && project.stage !== 'sourcing';
  return hasRealAddress(project.address) && beyondSourcing ? 'committed' : 'prospect';
}

export const TIER_LABEL: Record<CommitmentTier, string> = {
  committed: 'Committed',
  prospect: 'Prospect',
};
