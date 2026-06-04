/* eslint-disable no-console */
/**
 * scripts/pricing-telemetry.ts — V6.1.5 (T-PRC-6) pricing-LLM telemetry.
 *
 * Reads atlas.pricing_llm_calls and prints: calls by model, total cost, p50/p95
 * latency, and failure rate by call_site. This is also where the per-run
 * llm_total_cost_usd is derivable (V6.1.5-009 — costs live per-call here).
 *
 * Run locally (queries Supabase directly via service role — no Next runtime):
 *   PowerShell: $env:NEXT_PUBLIC_SUPABASE_URL='...'; $env:SUPABASE_SERVICE_ROLE_KEY='...'; npx tsx scripts/pricing-telemetry.ts
 */
import { createClient } from '@supabase/supabase-js';

interface Row {
  call_site: string;
  model: string;
  status: string;
  latency_ms: number;
  cost_usd: number | string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run telemetry.');
    process.exit(1);
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_llm_calls')
    .select('call_site, model, status, latency_ms, cost_usd');
  if (error) {
    console.error('pricing_llm_calls query failed:', error.message);
    process.exit(1);
    return;
  }

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) {
    console.log('No pricing_llm_calls rows yet (no Sonar pricing runs recorded).');
    return;
  }

  console.log(`--- pricing_llm_calls telemetry (${rows.length} calls) ---`);

  const byModel = new Map<string, number>();
  let totalCost = 0;
  for (const r of rows) {
    byModel.set(r.model, (byModel.get(r.model) ?? 0) + 1);
    totalCost += Number(r.cost_usd);
  }
  console.log('calls by model:');
  for (const [model, n] of byModel) console.log(`  ${model}: ${n}`);
  console.log(`total cost: $${totalCost.toFixed(2)}`);

  const lat = rows.map((r) => r.latency_ms).sort((a, b) => a - b);
  console.log(`latency: p50 ${percentile(lat, 50)}ms · p95 ${percentile(lat, 95)}ms`);

  const sites = new Map<string, { total: number; failed: number }>();
  for (const r of rows) {
    const s = sites.get(r.call_site) ?? { total: 0, failed: 0 };
    s.total++;
    if (r.status !== 'success') s.failed++;
    sites.set(r.call_site, s);
  }
  console.log('failure rate by call_site:');
  for (const [site, v] of sites) {
    console.log(`  ${site}: ${v.failed}/${v.total} (${((v.failed / v.total) * 100).toFixed(1)}%)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
