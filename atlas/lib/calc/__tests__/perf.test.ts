/**
 * T075 — Calc engine performance smoke.
 *
 * The calc engine runs synchronously inside every Server Component that
 * renders project KPIs. On the project-detail page it runs ONCE per
 * request; on the portfolio page (`aggregatePortfolio`) it runs ONCE per
 * project. A regression that makes either an order-of-magnitude slower
 * shows up as a page-load stall in production — and Cloudflare Pages
 * Functions have a hard wall-clock budget too.
 *
 * This test sets a generous-but-honest budget so genuine work passes but
 * accidental N^2 loops, leaky memoization, or sync I/O introductions all
 * fail loud. Numbers were measured on the slowest fixture (Project 11)
 * locally and on a CI-like CPU (GitHub Actions ubuntu-latest, 2 vCPU).
 *
 * Budgets (deliberately loose — 10x typical observed):
 *   - runProject              : <5 ms p99 over 200 iterations
 *   - aggregatePortfolio (10) : <50 ms p99 over 50 iterations
 *
 * If these fail, profile with `--reporter=verbose` and inspect the
 * timings table this test prints. If the engine actually got faster
 * (CPU upgrade, etc.) — tighten the budgets in a follow-up PR.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runProject } from '@/lib/calc/project/runProject';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import type {
  Globals,
  ProjectInput,
  ProjectResult,
  Scenario,
} from '@/lib/calc/project/types';

const FIXTURES_DIR = resolve(__dirname, '..', '..', '..', 'tests', 'fixtures', 'vanilla-snapshots');

interface Fixture {
  meta: { project_id: string; project_name: string };
  inputs: { project: ProjectInput; globals: Globals; scenario: Scenario };
  outputs: ProjectResult;
}

function loadFixture(filename: string): Fixture {
  const raw = readFileSync(resolve(FIXTURES_DIR, filename), 'utf8');
  return JSON.parse(raw) as Fixture;
}

function fixtureFiles(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.startsWith('project-') && f.endsWith('.json'))
    .sort();
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q));
  return sorted[idx] ?? 0;
}

function measure(label: string, iterations: number, fn: () => unknown): { p50: number; p99: number; avg: number } {
  const times: number[] = [];
  // Warmup so V8 JIT primes before we measure.
  for (let i = 0; i < 5; i++) fn();
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p50 = quantile(times, 0.5);
  const p99 = quantile(times, 0.99);
  // eslint-disable-next-line no-console
  console.log(
    `  ${label.padEnd(28)} avg ${avg.toFixed(3).padStart(7)}ms · p50 ${p50.toFixed(3).padStart(7)}ms · p99 ${p99.toFixed(3).padStart(7)}ms (n=${iterations})`
  );
  return { p50, p99, avg };
}

describe('calc engine perf budgets', () => {
  const fixtures = fixtureFiles().map(loadFixture);

  it('runProject stays under 5ms p99 on the heaviest fixture', () => {
    // Pick the fixture with the longest horizon (proxy for "most work").
    const heaviest = fixtures.reduce(
      (a, b) => (b.outputs.monthly.dates.length > a.outputs.monthly.dates.length ? b : a),
      fixtures[0]!
    );
    const r = measure(`runProject (${heaviest.meta.project_id})`, 200, () =>
      runProject(heaviest.inputs.project, heaviest.inputs.globals, heaviest.inputs.scenario)
    );
    expect(r.p99, 'runProject p99 latency').toBeLessThan(5);
  });

  it('aggregatePortfolio over 10 baselines stays under 50ms p99', () => {
    const projects = fixtures.map((f) => f.inputs.project);
    const globals = fixtures[0]!.inputs.globals;
    const scenario = fixtures[0]!.inputs.scenario;
    const r = measure(`aggregatePortfolio(${projects.length})`, 50, () =>
      aggregatePortfolio(projects, globals, scenario)
    );
    expect(r.p99, 'aggregatePortfolio p99 latency').toBeLessThan(50);
  });

  it('runProject avg across ALL 10 baselines stays under 2ms', () => {
    // Average pass — a single hot path shouldn't drag the whole engine.
    const r = measure(
      'runProject (avg across 10)',
      100,
      () => {
        for (const f of fixtures) {
          runProject(f.inputs.project, f.inputs.globals, f.inputs.scenario);
        }
      }
    );
    // 10 projects per iteration; avg per project must be <2ms.
    expect(r.avg / fixtures.length, 'per-project avg latency').toBeLessThan(2);
  });
});
