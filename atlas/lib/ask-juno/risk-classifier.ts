/**
 * Ask Juno agent — low-risk write classifier (V6.1 T115 §2.5).
 *
 * A write action AUTO-EXECUTES only when ALL conditions pass.
 * Default is ALWAYS confirmation (never default to auto-execute when unsure).
 */

export interface RiskClassification {
  auto_execute: boolean;
  reason: string;
}

/** Tools eligible for auto-execute (INSERT-only, single-record writes). */
const LOW_RISK_ELIGIBLE = new Set(['create_actuals_entry', 'create_risk']);

/**
 * Classify a proposed write action.
 *
 * @param toolName       The tool being called.
 * @param args           Parsed tool arguments.
 * @param userRole       Authenticated user's role.
 * @param hasLockedSnap  Whether the target project has a locked approval snapshot.
 */
export function classifyRisk(
  toolName: string,
  args: Record<string, unknown>,
  userRole: string,
  hasLockedSnap: boolean = false,
): RiskClassification {
  // Viewer roles can never auto-execute (and should never reach a write tool,
  // but this is the defence-in-depth gate).
  if (userRole === 'viewer' || userRole === 'viewer_basic') {
    return { auto_execute: false, reason: 'Viewer role cannot execute write actions' };
  }

  // Only INSERT-eligible tools can auto-execute.
  if (!LOW_RISK_ELIGIBLE.has(toolName)) {
    return {
      auto_execute: false,
      reason: `'${toolName}' always requires user confirmation (UPDATE / batch / privileged action)`,
    };
  }

  // Monetary impact guard: $10,000 threshold.
  const amountUsd =
    typeof args.amount_usd === 'number'
      ? args.amount_usd
      : typeof args.amount_cents === 'number'
        ? (args.amount_cents as number) / 100
        : 0;

  if (amountUsd > 10_000) {
    return {
      auto_execute: false,
      reason: `Amount $${amountUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })} exceeds the $10,000 auto-execute threshold`,
    };
  }

  // Batch guard.
  const batchFields = ['entries', 'items', 'rows'];
  for (const f of batchFields) {
    const v = args[f];
    if (Array.isArray(v) && v.length >= 5) {
      return {
        auto_execute: false,
        reason: `Batch of ${v.length} records (≥5) requires confirmation`,
      };
    }
  }

  // Locked snapshot guard.
  if (hasLockedSnap) {
    return {
      auto_execute: false,
      reason: 'Project has a locked approval snapshot — re-approval required after any change',
    };
  }

  return {
    auto_execute: true,
    reason: 'Single INSERT, monetary impact ≤ $10K, no locked snapshot',
  };
}
