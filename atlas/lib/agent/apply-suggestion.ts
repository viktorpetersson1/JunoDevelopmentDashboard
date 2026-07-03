/**
 * V7 T144 — the generic apply path (closes the dormant `applied` state,
 * D-077).
 *
 * On APPROVE, this routes a structured proposed_patch through the SAME
 * validated service/repo functions the UI forms use — never a raw table
 * write:
 *   project        → lib/services/project-update.updateProject
 *                    (zod UpdateProjectSchema + engine pre-run + audit + E3
 *                     re-approval flag, exactly like the Inputs drawer)
 *   opportunity    → lib/repos/opportunities.patchOpportunity
 *   capital_source → lib/services/capital-sources.updateCapitalSource
 *
 * Unknown entity/field or validation failure returns { ok: false, note } —
 * the caller records the note and REJECTS the suggestion instead of
 * crashing (Rule 7). No write happens without an approval row: this
 * function is only reached from the approved transition.
 */

import type { User } from '@supabase/supabase-js';
import { isProposedPatch, type ProposedPatch } from './meeting-review';
import { updateProject } from '@/lib/services/project-update';
import { UpdateProjectSchema } from '@/lib/services/project-schema';
import { patchOpportunity, findOpportunityById } from '@/lib/repos/opportunities';
import { updateCapitalSource } from '@/lib/services/capital-sources';

export interface ApplyResult {
  ok: boolean;
  note: string;
}

export async function applySuggestionPatch(raw: unknown, user: User): Promise<ApplyResult> {
  if (!isProposedPatch(raw)) {
    return {
      ok: false,
      note: 'proposed_patch is not a structured T144 patch (or targets an unknown entity/field) — rejected, not applied.',
    };
  }
  const patch: ProposedPatch = raw;

  try {
    switch (patch.entity) {
      case 'project': {
        // Validate through the SAME schema the Inputs drawer uses.
        const candidate = { [patch.field]: patch.proposed_value };
        const parsed = UpdateProjectSchema.safeParse(candidate);
        if (!parsed.success) {
          return {
            ok: false,
            note: `Validation failed: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
          };
        }
        const result = await updateProject({
          projectKey: patch.id,
          patch: parsed.data,
          user,
          source: 'ask_juno_agent',
        });
        return {
          ok: true,
          note: `Applied to project ${patch.id} (v${result.version}${result.requiresReapproval ? ', re-approval required' : ''}).`,
        };
      }

      case 'opportunity': {
        const existing = await findOpportunityById(patch.id);
        if (!existing) return { ok: false, note: `Opportunity ${patch.id} not found.` };
        if (existing.status === 'promoted') {
          return { ok: false, note: 'Opportunity is promoted — record is read-only.' };
        }
        const fieldMap: Record<string, string> = {
          cash_needed_usd: 'cashNeededUsd',
          timeline_months: 'timelineMonths',
          expected_profit_usd: 'expectedProfitUsd',
          expected_margin_pct: 'expectedMarginPct',
          next_step: 'nextStep',
          next_step_owner: 'nextStepOwner',
          notes: 'notes',
        };
        const key = fieldMap[patch.field];
        if (!key) return { ok: false, note: `Field ${patch.field} not applicable.` };
        await patchOpportunity(patch.id, { [key]: patch.proposed_value });
        return { ok: true, note: `Applied to opportunity ${patch.id}.` };
      }

      case 'capital_source': {
        const field = patch.field;
        if (field !== 'limit_usd' && field !== 'interest_rate_pct') {
          return { ok: false, note: `Field ${field} not applicable to capital sources.` };
        }
        const value = Number(patch.proposed_value);
        if (!Number.isFinite(value) || value < 0) {
          return { ok: false, note: `Invalid numeric value for ${field}.` };
        }
        await updateCapitalSource(
          patch.id,
          field === 'limit_usd' ? { limitUsd: value } : { interestRatePct: value },
          user
        );
        return { ok: true, note: `Applied to capital source ${patch.id}.` };
      }
    }
  } catch (err) {
    return { ok: false, note: err instanceof Error ? err.message : String(err) };
  }
}
