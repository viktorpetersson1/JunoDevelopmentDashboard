// Test full "Match Excel" mode: juno13 FY + Excel sale prices + 81% build realization
import { BASELINE_GLOBALS, BASELINE_PROJECTS, BASELINE_SCENARIO, EXCEL_BENCHMARK } from "../data.js";
import { aggregatePortfolio } from "../engine.js";

const globals = { ...BASELINE_GLOBALS, fiscal_year_mode: "juno13", build_cost_realization_pct: 0.81, apply_tax: false };
const projects = BASELINE_PROJECTS.map(p => ({ ...p, sale_price_override_usd: p._excel_sale_price }));
const result = aggregatePortfolio(projects, globals, BASELINE_SCENARIO);
const fmt = (n) => n == null ? "—" : Math.round(n).toLocaleString();
const k = result.kpis;

console.log("=== v7.4 Match Excel mode: juno13 FY + Excel sale prices + 81% build realization ===\n");
console.log(`Total sales:        ${fmt(k.total_sales).padStart(12)}   Excel: 71,910,723   Δ: ${fmt(k.total_sales - 71910723)}`);
console.log(`Total dev cost:     ${fmt(k.total_dev_cost).padStart(12)}   Excel: 51,055,768   Δ: ${fmt(k.total_dev_cost - 51055768)}`);
console.log(`Total interest:     ${fmt(k.total_interest).padStart(12)}   Excel:  6,475,941   Δ: ${fmt(k.total_interest - 6475941)}`);
console.log(`Total opex:         ${fmt(k.total_opex).padStart(12)}   Excel:  1,860,769   Δ: ${fmt(k.total_opex - 1860769)}`);
console.log(`Profit pre-tax:     ${fmt(k.total_profit_before_tax).padStart(12)}   Excel: 12,521,057   Δ: ${fmt(k.total_profit_before_tax - 12521057)}`);
console.log(`Variance: ${((k.total_profit_before_tax - 12521057)/12521057*100).toFixed(1)}%`);
console.log(`Peak equity:        ${fmt(k.peak_equity_required).padStart(12)}   Excel:  7,736,083   Δ: ${fmt(k.peak_equity_required - 7736083)}`);
console.log(`Peak equity month:  ${k.peak_equity_month}`);
console.log(`MOIC: ${k.moic_gross.toFixed(2)}x | IRR: ${(k.irr_annual*100).toFixed(1)}% | Payback: ${k.payback_months} mo`);
