// Compare engine's per-month equity_called series to Excel's row 81 values
import { BASELINE_GLOBALS, BASELINE_PROJECTS, BASELINE_SCENARIO } from "../data.js";
import { aggregatePortfolio } from "../engine.js";

const r = aggregatePortfolio(BASELINE_PROJECTS, BASELINE_GLOBALS, BASELINE_SCENARIO);
const m = r.monthly;

// Excel's actual row 81 values (mapped by column) — from audit output
const excelEquityCalled = {
  "2026-03": 39591,     // col E
  "2026-04": 1647499,   // col F
  "2026-05": 49626,     // col G
  "2026-06": 49679,     // col H
  "2026-07": 54290,     // col I
  "2026-08": 58216,     // col J
  "2026-09": 2070201,   // col K
  "2026-10": 73843,     // col L
  "2026-11": 79123,     // col M
  "2026-12": 1758254,   // col N
  "2027-01": 98099,     // col O
  "2027-02": 104795,    // col P
  "2027-03": 1652866,   // col Q
  "2027-04": 0,         // col R
};

console.log(`Engine total cost outflows: $${(-r.monthly.land_cost.reduce((a,b)=>a+b,0) - r.monthly.build_cost.reduce((a,b)=>a+b,0) - r.monthly.kingshaus.reduce((a,b)=>a+b,0)).toFixed(0)}`);
console.log(`Engine debt drawn total: $${r.monthly.debt_drawn.reduce((a,b)=>a+b,0).toFixed(0)}`);
console.log(`Engine equity called total: $${r.monthly.equity_called.reduce((a,b)=>a+b,0).toFixed(0)}`);
console.log(`Engine cumulative equity peak: $${Math.max(...r.monthly.cum_equity_called).toFixed(0)}`);
console.log();

console.log(`${"Month".padEnd(10)} ${"Excel call".padStart(15)} ${"Engine call".padStart(15)} ${"Δ".padStart(15)} ${"Engine debt".padStart(15)} ${"Engine cost".padStart(15)}`);
let myCum = 0;
for (const [ym, exVal] of Object.entries(excelEquityCalled)) {
  const idx = m.dates.indexOf(ym);
  const engineCall = idx >= 0 ? m.equity_called[idx] : 0;
  const engineDebt = idx >= 0 ? m.debt_drawn[idx] : 0;
  const engineCost = idx >= 0 ? -(m.land_cost[idx] + m.build_cost[idx] + m.kingshaus[idx] + m.soft_cost[idx]) : 0;
  myCum += engineCall;
  const d = engineCall - exVal;
  console.log(`${ym.padEnd(10)} ${exVal.toLocaleString().padStart(15)} ${Math.round(engineCall).toLocaleString().padStart(15)} ${(d>=0?"+":"")+Math.round(d).toLocaleString().padStart(13)} ${Math.round(engineDebt).toLocaleString().padStart(15)} ${Math.round(engineCost).toLocaleString().padStart(15)}`);
}
console.log();
console.log(`Engine peak equity required: $${r.kpis.peak_equity_required.toFixed(0)}  (Excel reports: $7,736,083)`);
console.log(`Engine peak month: ${r.kpis.peak_equity_month}  (Excel reports: 2027-03 col Q)`);

console.log(`\n=== Equity calls 2027-04 to 2027-12 (post first sale) ===`);
console.log(`${"Month".padEnd(10)} ${"Engine call".padStart(15)} ${"Cum".padStart(15)} ${"Sales".padStart(15)} ${"Cash before eq".padStart(15)}`);
for (const ym of ["2027-04","2027-05","2027-06","2027-07","2027-08","2027-09","2027-10","2027-11","2027-12"]) {
  const idx = m.dates.indexOf(ym);
  if (idx < 0) continue;
  console.log(`${ym.padEnd(10)} ${Math.round(m.equity_called[idx]).toLocaleString().padStart(15)} ${Math.round(m.cum_equity_called[idx]).toLocaleString().padStart(15)} ${Math.round(m.sales[idx]).toLocaleString().padStart(15)} ${Math.round(m.cash_before_equity[idx]).toLocaleString().padStart(15)}`);
}
