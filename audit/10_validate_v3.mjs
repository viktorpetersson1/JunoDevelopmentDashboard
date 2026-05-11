// Test v3: use Excel sale price overrides + juno13 FY + front_loaded build curve
import { BASELINE_GLOBALS, BASELINE_PROJECTS, BASELINE_SCENARIO, EXCEL_BENCHMARK } from "../data.js";
import { aggregatePortfolio } from "../engine.js";

// Apply Excel sale price override + Juno FY mode + s-curve build for closest match
const globals = { ...BASELINE_GLOBALS, fiscal_year_mode: "juno13", build_cost_curve: "s_curve" };
const projects = BASELINE_PROJECTS.map(p => ({ ...p, sale_price_override_usd: p._excel_sale_price }));

const result = aggregatePortfolio(projects, globals, BASELINE_SCENARIO);
const fmt = (n) => n == null ? "—" : Math.round(n).toLocaleString();
const k = result.kpis;

console.log("=== v3 with Excel sale price + juno13 FY + s-curve build ===\n");
console.log(`Total sales (dashboard):       ${fmt(k.total_sales)}   |   Excel: 71,910,723   |   Δ: ${fmt(k.total_sales - 71910723)}`);
console.log(`Total dev cost (dashboard):    ${fmt(k.total_dev_cost)}   |   Excel: 51,055,768   |   Δ: ${fmt(k.total_dev_cost - 51055768)}`);
console.log(`Total interest (dashboard):    ${fmt(k.total_interest)}   |   Excel: 6,475,941   |   Δ: ${fmt(k.total_interest - 6475941)}`);
console.log(`Total opex (dashboard):        ${fmt(k.total_opex)}   |   Excel: 1,860,769   |   Δ: ${fmt(k.total_opex - 1860769)}`);
console.log(`Total profit pre-tax (dash):   ${fmt(k.total_profit_before_tax)}   |   Excel: 12,521,057   |   Δ: ${fmt(k.total_profit_before_tax - 12521057)}`);
console.log(`Variance: ${((k.total_profit_before_tax - 12521057)/12521057*100).toFixed(1)}%`);
console.log(`MOIC: ${k.moic_gross.toFixed(2)}x | IRR: ${(k.irr_annual*100).toFixed(1)}% | Payback: ${k.payback_months} mo`);

console.log("\n=== Annual P&L (juno13 FY) ===");
console.log("FY    | Sales (Δ Excel)             | Profit (Δ Excel)");
for (const fy of ["FY26","FY27","FY28","FY29"]) {
  const a = result.annual[fy];
  const ex = EXCEL_BENCHMARK.fiscal_years[fy];
  if (!a || !ex) continue;
  const dS = a.sales - ex.sales;
  const dP = a.profit_before_tax - ex.profit_before_tax;
  console.log(`${fy}  | ${fmt(a.sales).padStart(11)} (${dS>=0?"+":""}${fmt(dS).padStart(10)}) | ${fmt(a.profit_before_tax).padStart(11)} (${dP>=0?"+":""}${fmt(dP).padStart(10)})`);
}
