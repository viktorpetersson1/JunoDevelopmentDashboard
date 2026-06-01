/**
 * Project-with-pricing enricher (D-016 Exit Pricing Framework v1).
 *
 * Bridges the framework (per-project pricing runs) into the calc engine
 * (which knows nothing about runs — it sees an enriched `plot_exits` field
 * on ProjectInput).
 *
 * Call site (Server Component): after `findCurrentProjectByKey()`, call
 * `enrichWithAppliedPricingRun(project, projectUuid)` before `runProject()`.
 * When the project has no applied run, returns the input unchanged (so the
 * 10 baseline projects keep their byte-equivalent vanilla behavior).
 *
 * NOT called inside `findCurrentProjectByKey` because (a) keeps the calc
 * engine pure relative to the repo layer, (b) avoids an extra DB hop for
 * callers that don't need exit pricing (e.g. portfolio aggregator).
 */

import type { ProjectInput, PlotExit } from '@/lib/calc/project/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';

interface AppliedRunRow {
  applied_pricing_run_id: string | null;
}

interface PlotOutputRow {
  plot_type_key: string;
  plot_type_label: string;
  plot_count: number;
  sqft_per_unit_ag: number;
  base_psf: string | number | null;
  low_psf: string | number | null;
  high_psf: string | number | null;
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * If the project (by uuid) has an applied pricing run, fetch its plot
 * outputs and return a NEW ProjectInput with `plot_exits` populated.
 * Otherwise returns the input as-is.
 *
 * Skips the DB hop entirely when projectUuid is null.
 */
export async function enrichWithAppliedPricingRun(
  project: ProjectInput,
  projectUuid: string | null
): Promise<ProjectInput> {
  if (!projectUuid) return project;

  const supabase = createSupabaseServerClient();
  const { data: projRow, error: projErr } = await supabase
    .schema('atlas')
    .from('projects')
    .select('applied_pricing_run_id')
    .eq('id', projectUuid)
    .maybeSingle();
  if (projErr || !projRow) return project;
  const appliedRunId = (projRow as AppliedRunRow).applied_pricing_run_id;
  if (!appliedRunId) return project;

  const { data: plotRows, error: plotErr } = await supabase
    .schema('atlas')
    .from('pricing_run_plot_outputs')
    .select(
      'plot_type_key, plot_type_label, plot_count, sqft_per_unit_ag, base_psf, low_psf, high_psf'
    )
    .eq('pricing_run_id', appliedRunId);
  if (plotErr || !plotRows || plotRows.length === 0) return project;

  const plotExits: PlotExit[] = (plotRows as PlotOutputRow[]).map((r) => ({
    plot_type_key: r.plot_type_key,
    plot_type_label: r.plot_type_label,
    count: r.plot_count,
    sqft_per_unit_ag: r.sqft_per_unit_ag,
    base_psf: num(r.base_psf),
    low_psf: numOrNull(r.low_psf),
    high_psf: numOrNull(r.high_psf),
    source_run_id: appliedRunId,
  }));

  // Defensive: only enrich if every plot has a usable base_psf. If the run
  // somehow committed with a zero base, fall back to the un-enriched input
  // rather than producing nonsense revenue.
  if (plotExits.some((p) => p.base_psf <= 0)) return project;

  return {
    ...project,
    plot_exits: plotExits,
  };
}
