#!/usr/bin/env node
/**
 * snapshot-vanilla-engine.mjs — T032' (replaces bundle T032 Python XLSX sidecar)
 *
 * Imports the vanilla `public/engine.js` + baseline data, normalises each
 * project the same way `public/state.js::applyStateBlob` does, runs
 * `calcProject()` over every baseline project, and dumps the outputs to
 * `atlas/tests/fixtures/vanilla-snapshots/*.json`.
 *
 * These fixtures are the golden source for the new TS calc engine
 * (T025-T031): every TS module must produce numerically-identical output
 * within 0.5% tolerance per CLAUDE.md §8.2.
 *
 * Why not Excel? Per SUPABASE_TRANSLATION.md §2: Excel was decommissioned
 * 2026-05-10. Vanilla `engine.js` is already proven-equivalent and is a
 * pure JS module, no XLSX/openpyxl required.
 *
 * Usage:
 *   node atlas/scripts/snapshot-vanilla-engine.mjs
 *
 * Idempotent: re-running overwrites fixtures byte-identically given the
 * same vanilla source.
 */

import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { calcProject, aggregatePortfolio } from '../../public/engine.js';
import { BASELINE_PROJECTS, BASELINE_GLOBALS, BASELINE_SCENARIO } from '../../public/data.js';

// ────────────────────────────────────────────────────────────────────────────
// Normalisation — mirrors public/state.js::applyStateBlob (lines 136-167)
// The engine reads `start_date`, `villa_sqft`, `program_months` directly;
// the new schema uses `purchase_date`, `villa_sqft_ag/bg`, and four
// duration buckets. Compute the derived fields here.
// ────────────────────────────────────────────────────────────────────────────

function normaliseProject(p) {
  const villaSqft = (p.villa_sqft_ag || 0) + (p.villa_sqft_bg || 0);
  const purchaseDate = p.purchase_date ?? p.start_date;
  const programMonths =
    (p.sourcing_months || 0) +
    (p.permitting_preconstruction_months || 0) +
    (p.construction_months || 0) +
    (p.sales_months || 0);

  return {
    ...p,
    villa_sqft: villaSqft,
    start_date: purchaseDate,
    program_months: programMonths || 13, // BASELINE_GLOBALS.default_program_months
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Snapshot generation
// ────────────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'tests', 'fixtures', 'vanilla-snapshots');

function rmFixturesDirContents() {
  try {
    const entries = readdirSync(OUT_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.json')) {
        const fs = require('node:fs');
        fs.unlinkSync(resolve(OUT_DIR, e.name));
      }
    }
  } catch {
    // Dir doesn't exist yet — fine.
  }
}

function ensureOutDir() {
  mkdirSync(OUT_DIR, { recursive: true });
}

function snapshotProject(rawProject) {
  const project = normaliseProject(rawProject);
  const result = calcProject(project, BASELINE_GLOBALS, BASELINE_SCENARIO);
  return {
    meta: {
      project_id: project.id,
      project_name: project.name,
      generated_at: '<deterministic>', // omitted to keep diffs clean
      vanilla_engine: 'public/engine.js',
      scenario: BASELINE_SCENARIO.name,
    },
    inputs: {
      project,
      globals: BASELINE_GLOBALS,
      scenario: BASELINE_SCENARIO,
    },
    outputs: result,
  };
}

function snapshotPortfolio() {
  const projects = BASELINE_PROJECTS.map(normaliseProject);
  const result = aggregatePortfolio(projects, BASELINE_GLOBALS, BASELINE_SCENARIO);
  return {
    meta: {
      project_count: projects.length,
      vanilla_engine: 'public/engine.js',
      scenario: BASELINE_SCENARIO.name,
    },
    inputs: {
      project_ids: projects.map((p) => p.id),
      globals: BASELINE_GLOBALS,
      scenario: BASELINE_SCENARIO,
    },
    outputs: result,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

ensureOutDir();
rmFixturesDirContents();

console.warn(`Snapshotting ${BASELINE_PROJECTS.length} baseline projects -> ${OUT_DIR}`);

for (const project of BASELINE_PROJECTS) {
  const snapshot = snapshotProject(project);
  const path = resolve(OUT_DIR, `project-${project.id}.json`);
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  console.warn(`  -> ${project.id} (${project.name})`);
}

const portfolio = snapshotPortfolio();
writeFileSync(
  resolve(OUT_DIR, 'portfolio.json'),
  JSON.stringify(portfolio, null, 2) + '\n',
  'utf8'
);
console.warn(`  -> portfolio (${BASELINE_PROJECTS.length} projects aggregated)`);

console.warn(`Done. ${BASELINE_PROJECTS.length + 1} fixtures written.`);
