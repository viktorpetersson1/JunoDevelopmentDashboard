import { describe, expect, it } from 'vitest';
import {
  atlas,
  orgs,
  auditLog,
  userProfiles,
  authUsers,
  owners,
  capTable,
  projects,
  capitalCalls,
  capitalCallOwnerShares,
  capitalCallPayments,
  approvalSnapshots,
  markets,
  comps,
  pricingRuns,
  pricingRunComparables,
  pricingRunPlotOutputs,
} from '../schema';

// Schema invariants that don't need a live DB connection.
// Connection-dependent tests live in tests/integration/ and are skipped
// in CI until DATABASE_URL is wired (T076).
describe('atlas db schema', () => {
  it('declares the atlas Postgres schema', () => {
    expect(atlas).toBeDefined();
    expect(typeof atlas.table).toBe('function');
  });

  it('atlas.orgs has the expected columns', () => {
    const cols = Object.keys(orgs);
    expect(cols).toContain('id');
    expect(cols).toContain('name');
    expect(cols).toContain('createdAt');
    expect(cols).toContain('updatedAt');
  });

  it('atlas.audit_log has the expected columns', () => {
    const cols = Object.keys(auditLog);
    expect(cols).toContain('id');
    expect(cols).toContain('orgId');
    expect(cols).toContain('userId');
    expect(cols).toContain('route');
    expect(cols).toContain('method');
    expect(cols).toContain('statusCode');
    expect(cols).toContain('beforeJson');
    expect(cols).toContain('afterJson');
    expect(cols).toContain('ipHash');
    expect(cols).toContain('userAgent');
    expect(cols).toContain('createdAt');
  });

  it('declares external (read-only) auth.users + public.user_profiles for typed reads', () => {
    expect(authUsers).toBeDefined();
    expect(userProfiles).toBeDefined();
    // user_profiles role is the enum vanilla owns
    expect(Object.keys(userProfiles)).toContain('role');
  });

  it('atlas.owners has key+display_name+is_sponsor+tax_rate_bps', () => {
    const cols = Object.keys(owners);
    expect(cols).toContain('id');
    expect(cols).toContain('key');
    expect(cols).toContain('displayName');
    expect(cols).toContain('email');
    expect(cols).toContain('isSponsor');
    expect(cols).toContain('isArchived');
    expect(cols).toContain('taxRateBps');
  });

  it('atlas.cap_table is owner-keyed with effective_from/to + is_current', () => {
    const cols = Object.keys(capTable);
    expect(cols).toContain('id');
    expect(cols).toContain('ownerId');
    expect(cols).toContain('shareBps');
    expect(cols).toContain('effectiveFrom');
    expect(cols).toContain('effectiveTo');
    expect(cols).toContain('isCurrent');
  });

  it('atlas.projects is versioned (projectKey + version + isCurrent + isArchived)', () => {
    const cols = Object.keys(projects);
    expect(cols).toContain('id');
    expect(cols).toContain('projectKey');
    expect(cols).toContain('version');
    expect(cols).toContain('isCurrent');
    expect(cols).toContain('isArchived');
  });

  it('atlas.projects stores money as bigint cents + percentages as basis points', () => {
    const cols = Object.keys(projects);
    // Cents fields
    expect(cols).toContain('landCostCents');
    expect(cols).toContain('buildCostPerSqftCents');
    expect(cols).toContain('softCostsLumpSumCents');
    expect(cols).toContain('actualSalePriceCents');
    // Basis-points fields
    expect(cols).toContain('seniorLtvBps');
    expect(cols).toContain('interestRateBps');
    expect(cols).toContain('contingencyBps');
    expect(cols).toContain('targetMarginBps');
  });

  it('atlas.projects has all program/timing fields needed by the calc engine', () => {
    const cols = Object.keys(projects);
    expect(cols).toContain('sourcingMonths');
    expect(cols).toContain('permittingPreconstructionMonths');
    expect(cols).toContain('constructionMonths');
    expect(cols).toContain('salesMonths');
    expect(cols).toContain('villaSqftAg');
    expect(cols).toContain('villaSqftBg');
    expect(cols).toContain('purchaseDate');
  });

  // T021
  it('atlas.capital_calls has lifecycle status + call_number + total', () => {
    const cols = Object.keys(capitalCalls);
    expect(cols).toContain('projectId');
    expect(cols).toContain('status');
    expect(cols).toContain('callNumber');
    expect(cols).toContain('totalAmountCents');
    expect(cols).toContain('issuedDate');
    expect(cols).toContain('dueDate');
  });

  it('atlas.capital_call_owner_shares ties calls to owners with share+amount', () => {
    const cols = Object.keys(capitalCallOwnerShares);
    expect(cols).toContain('capitalCallId');
    expect(cols).toContain('ownerId');
    expect(cols).toContain('shareBpsAtIssuance');
    expect(cols).toContain('shareAmountCents');
    expect(cols).toContain('status');
  });

  it('atlas.capital_call_payments records individual wires per owner share', () => {
    const cols = Object.keys(capitalCallPayments);
    expect(cols).toContain('ownerShareId');
    expect(cols).toContain('amountCents');
    expect(cols).toContain('receivedDate');
  });

  // T022
  it('atlas.approval_snapshots is immutable when locked (locked_at + approved_by[])', () => {
    const cols = Object.keys(approvalSnapshots);
    expect(cols).toContain('projectId');
    expect(cols).toContain('snapshotVersion');
    expect(cols).toContain('computedInputs');
    expect(cols).toContain('computedOutputs');
    expect(cols).toContain('lockedAt');
    expect(cols).toContain('lockedBy');
    expect(cols).toContain('approvedAt');
    expect(cols).toContain('approvedBy');
    expect(cols).toContain('archivedAt');
  });

  // D-016 — Exit Pricing Framework v1
  it('atlas.markets has key + name + sub_cuts JSONB + threshold knobs', () => {
    const cols = Object.keys(markets);
    expect(cols).toContain('id');
    expect(cols).toContain('key');
    expect(cols).toContain('name');
    expect(cols).toContain('defaultCompWindowMonths');
    expect(cols).toContain('riderThresholdPct');
    expect(cols).toContain('stretchThresholdPct');
    expect(cols).toContain('subCuts');
    expect(cols).toContain('referenceMarketIds');
    expect(cols).toContain('isArchived');
  });

  it('atlas.comps is a global library with sub-cut + waterfront + status', () => {
    const cols = Object.keys(comps);
    expect(cols).toContain('id');
    expect(cols).toContain('address');
    expect(cols).toContain('subCutKey');
    expect(cols).toContain('waterfrontType');
    expect(cols).toContain('isNc');
    expect(cols).toContain('status');
    expect(cols).toContain('closingDate');
    expect(cols).toContain('salePriceCents');
    expect(cols).toContain('agSqft');
    expect(cols).toContain('source');
    expect(cols).toContain('isArchived');
  });

  it('atlas.pricing_runs is per-project, versioned, draft→committed→archived', () => {
    const cols = Object.keys(pricingRuns);
    expect(cols).toContain('projectId');
    expect(cols).toContain('version');
    expect(cols).toContain('mode');
    expect(cols).toContain('triggerSource');
    expect(cols).toContain('status');
    expect(cols).toContain('compWindowStart');
    expect(cols).toContain('compWindowEnd');
    expect(cols).toContain('committedAt');
    expect(cols).toContain('committedByUserId');
    expect(cols).toContain('appliedAt');
    expect(cols).toContain('appliedByUserId');
  });

  it('atlas.pricing_run_plot_outputs carries human L/B/H + engine classification', () => {
    const cols = Object.keys(pricingRunPlotOutputs);
    expect(cols).toContain('pricingRunId');
    expect(cols).toContain('plotTypeKey');
    expect(cols).toContain('subCutKey');
    expect(cols).toContain('lowPsf');
    expect(cols).toContain('basePsf');
    expect(cols).toContain('highPsf');
    expect(cols).toContain('lowAnchorCompSnapshotId');
    expect(cols).toContain('baseAnchorCompSnapshotId');
    expect(cols).toContain('highAnchorCompSnapshotId');
    expect(cols).toContain('classification');
    expect(cols).toContain('confidence');
    expect(cols).toContain('dataGapFlag');
    expect(cols).toContain('strongestInSubCutPsf');
  });

  it('atlas.pricing_run_comparables snapshots comp fields at commit time', () => {
    const cols = Object.keys(pricingRunComparables);
    expect(cols).toContain('pricingRunId');
    expect(cols).toContain('compId');
    expect(cols).toContain('snapshotAddress');
    expect(cols).toContain('snapshotSubCutKey');
    expect(cols).toContain('snapshotStatus');
    expect(cols).toContain('snapshotSalePriceCents');
    expect(cols).toContain('snapshotAgSqft');
    expect(cols).toContain('snapshotPsf');
    expect(cols).toContain('role');
    expect(cols).toContain('usedForPlotTypeKeys');
    expect(cols).toContain('isPrimaryInSubCut');
  });

  it('atlas.projects gains plot_types JSONB + applied_pricing_run_id (D-016)', () => {
    const cols = Object.keys(projects);
    expect(cols).toContain('plotTypes');
    expect(cols).toContain('appliedPricingRunId');
  });
});
