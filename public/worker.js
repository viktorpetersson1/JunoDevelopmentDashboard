// Web Worker for heavy compute (Monte Carlo + two-way heatmap).
// The engine is pure ES modules — no DOM, no window — so it imports cleanly here.

import { aggregatePortfolio, monteCarlo } from "./engine.js";

self.addEventListener("message", async (e) => {
  const { id, type, projects, globals, scenario, ...rest } = e.data || {};
  try {
    if (type === "monte_carlo") {
      const { distributions, trials } = rest;
      // Run in chunks so we can report progress without locking
      const chunkSize = Math.max(50, Math.floor(trials / 20));
      const allOutcomes = {
        profit_pre_tax: [], profit_after_tax: [],
        peak_equity: [], max_debt: [],
        moic: [], irr_annual: [], yield_on_cost: [],
      };
      for (let done = 0; done < trials; done += chunkSize) {
        const batchSize = Math.min(chunkSize, trials - done);
        const batch = monteCarlo(projects, globals, scenario, distributions, batchSize);
        for (const k of Object.keys(allOutcomes)) {
          allOutcomes[k].push(...batch.summary[k].values);
        }
        self.postMessage({ id, type: "progress", current: done + batchSize, total: trials });
        // Yield to event loop
        await new Promise(r => setTimeout(r, 0));
      }
      // Build summary from the merged outcomes
      const summary = {};
      const percentile = (sorted, p) => {
        if (!sorted.length) return null;
        const idx = (sorted.length - 1) * p;
        const lo = Math.floor(idx), hi = Math.ceil(idx);
        return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
      };
      for (const [key, values] of Object.entries(allOutcomes)) {
        const sorted = values.slice().sort((a, b) => a - b);
        summary[key] = {
          values, sorted,
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          p10: percentile(sorted, 0.10), p25: percentile(sorted, 0.25),
          p50: percentile(sorted, 0.50), p75: percentile(sorted, 0.75),
          p90: percentile(sorted, 0.90),
          min: sorted[0], max: sorted[sorted.length - 1],
          prob_loss: key.startsWith("profit") ? values.filter(v => v < 0).length / values.length : null,
        };
      }
      self.postMessage({ id, type: "result", result: { trials, distributions, summary } });
      return;
    }

    if (type === "heatmap") {
      const { axes } = rest;
      // axes: { rows: { key, values }, cols: { key, values } }
      const { rows, cols } = axes;
      const grid = [];
      let hmMin = Infinity, hmMax = -Infinity;
      const total = rows.values.length * cols.values.length;
      let done = 0;
      for (const rowVal of rows.values) {
        const rowOut = [];
        for (const colVal of cols.values) {
          const trial = { ...scenario, [rows.key]: rowVal, [cols.key]: colVal };
          const r = aggregatePortfolio(projects, globals, trial);
          const v = r.kpis.total_profit_before_tax;
          if (v < hmMin) hmMin = v;
          if (v > hmMax) hmMax = v;
          rowOut.push(v);
          done++;
        }
        grid.push(rowOut);
        self.postMessage({ id, type: "progress", current: done, total });
        await new Promise(r => setTimeout(r, 0));
      }
      self.postMessage({ id, type: "result", result: { grid, hmMin, hmMax, rows: rows.values, cols: cols.values } });
      return;
    }

    self.postMessage({ id, type: "error", message: `Unknown job type: ${type}` });
  } catch (err) {
    self.postMessage({ id, type: "error", message: err?.message || String(err) });
  }
});
