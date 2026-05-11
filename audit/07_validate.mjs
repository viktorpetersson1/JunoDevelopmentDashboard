// Run the dashboard engine in Node and compare KPIs to the Excel benchmark.
import { BASELINE_GLOBALS, BASELINE_PROJECTS, BASELINE_SCENARIO, EXCEL_BENCHMARK } from "../data.js";
import { aggregatePortfolio, calcProject } from "../engine.js";

// Run both modes
const globalsJuno = { ...BASELINE_GLOBALS, fiscal_year_mode: "juno13" };
const result = aggregatePortfolio(BASELINE_PROJECTS, globalsJuno, BASELINE_SCENARIO);
console.log("=== Using Juno 13-month FY mode + new financing model ===\n");

const fmt = (n) => n == null ? "—" : Math.round(n).toLocaleString();

console.log("=== Per-project sale price ===");
console.log("project_id | excel_sale_price | dashboard | variance_$ | variance_%");
for (const r of result.by_project) {
  const exp = EXCEL_BENCHMARK.per_project_sale_price[r.project_id];
  const act = r.kpis.total_sales;
  const d = act - exp;
  const pct = (d / exp * 100).toFixed(1);
  console.log(`${r.project_id.padEnd(10)} | ${fmt(exp).padStart(14)} | ${fmt(act).padStart(12)} | ${(d>=0?"+":"")+fmt(d).padStart(12)} | ${pct.padStart(6)}%`);
}

console.log("\n=== Annual P&L roll-up ===");
console.log("FY    | Metric            | Excel        | Dashboard    | Δ");
const map = [["sales","sales"],["land","land"],["build","build"],["kingshaus","kingshaus"],["opex","opex"],["interest","interest"],["profit_before_tax","profit_before_tax"]];
for (const fy of ["FY26","FY27","FY28","FY29"]) {
  for (const [exKey, daKey] of map) {
    const ex = EXCEL_BENCHMARK.fiscal_years[fy][exKey];
    const da = result.annual[fy]?.[daKey] || 0;
    const d = da - ex;
    console.log(`${fy}  | ${daKey.padEnd(18)} | ${fmt(ex).padStart(12)} | ${fmt(da).padStart(12)} | ${(d>=0?"+":"")+fmt(d).padStart(11)}`);
  }
  console.log("");
}

console.log("=== Portfolio headline KPIs ===");
const k = result.kpis;
console.log(`Total sales (dashboard):           ${fmt(k.total_sales)}`);
console.log(`Total dev cost (dashboard):        ${fmt(k.total_dev_cost)}`);
console.log(`Total interest (dashboard):        ${fmt(k.total_interest)}`);
console.log(`Total opex (dashboard):            ${fmt(k.total_opex)}`);
console.log(`Total profit pre-tax (dashboard):  ${fmt(k.total_profit_before_tax)}`);
console.log(`Peak equity required:              ${fmt(k.peak_equity_required)} (${k.peak_equity_month})`);
console.log(`Max debt outstanding:              ${fmt(k.max_debt_outstanding)} (${k.max_debt_month})`);
console.log(`MOIC:                              ${k.moic_gross.toFixed(2)}x`);
console.log(`Payback months:                    ${k.payback_months ?? "—"}`);
const excelTotal = Object.values(EXCEL_BENCHMARK.fiscal_years).reduce((acc, y) => acc + y.profit_before_tax, 0);
console.log(`\nExcel total profit (FY26-FY29 sum): ${fmt(excelTotal)}`);
console.log(`Dashboard total profit (full horizon): ${fmt(k.total_profit_before_tax)}`);
console.log(`Variance: ${fmt(k.total_profit_before_tax - excelTotal)} (${((k.total_profit_before_tax - excelTotal)/Math.abs(excelTotal)*100).toFixed(1)}%)`);
