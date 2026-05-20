# FORMULA_INVENTORY.md — Excel master → TypeScript port

**Source workbook:** `Juno_Cash-flow-Forecast_20260412_MASTER.xlsx`
**Verified by:** Direct inspection on 20 May 2026.
**Sheets in scope:** `Summary`, `Juno Forecast`, `Juno Opex Forecast`, `Juno`, and per-project tabs `Project 2 - 84 SBR` through `Project 11`. Plus `6 GC` (superstructure cost library), `Construction costs 84SB`, `Closing costs 84SB`, `Financing 84SB`.
**Sheets explicitly ignored:** `Juno Forecastx`, `Juno Forecast (2)`, `Project 3x` (legacy / scratch).

**This file is the authoritative spec for every calc module in `lib/calc/`.** Every Excel cell that produces a number Atlas displays has a row here mapping it to a TypeScript module + function. If a formula is not in this inventory, **do not write a TypeScript port of it** — open a ticket first.

---

## How to read this document

Each section maps **one Excel sheet** to **one TypeScript namespace**. Inside each section, the table columns are:

| Col | Meaning |
|---|---|
| Excel ref | Sheet + cell or range. E.g. `Summary!D6`, `Project 5!M14`. |
| Excel formula | Verbatim formula from the workbook. |
| TS module | File path under `lib/calc/`. |
| TS function | Function name within the module. |
| Purpose | One-line plain-English description. |
| Golden test | Whether a golden-master test is required (it almost always is). |

**Sign convention from Excel (preserved in TS):**
- **Costs are negative.** `M14 = M10*M13*-1` → construction cost is stored as a negative number.
- **Revenue is positive.** `M30 = M23*M10` → sale price is positive.
- **Equity inflows are positive** (cash in). `O88 = 0` for opening, then positive when called.
- **Debt drawdowns are positive** (cash in). Debt repayment is negative.

Do not silently normalize signs. The downstream aggregators (`Juno Forecast`, `Summary`) rely on the convention.

---

## 1. Project tab template (per-project calc)

The Excel master has 10 project tabs (`Project 2 - 84 SBR` through `Project 11`). They share a **standard layout** — rows 1-112, anchored on column K for labels and column M for input/derived values, with monthly columns starting at O.

The TypeScript port collapses this into one module: `lib/calc/project/`. All 10 projects use the same functions; only inputs vary.

### 1.1 Assumptions block (rows 6-24)

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Project N!M6` | `=Summary!F<row>` (start date lookup) | `lib/calc/project/assumptions.ts` | `getStartDate(project)` | Project start (land purchase) date | yes |
| `Project N!M7` | `=Summary!G<row>` (sales date lookup) | same | `getSalesDate(project)` | Expected sales date | yes |
| `Project N!M9` | `=Summary!I42` (land cost) | same | `getLandCost(project)` | Negative number — land cost USD | yes |
| `Project N!M10` | `=SUM(M11:M12)` | same | `getVillaSize(project)` | Total sqft = main + basement | yes |
| `Project N!M11` | hardcoded | input | `mainHouseSqft` | Above-ground sqft input | n/a |
| `Project N!M12` | hardcoded | input | `basementSqft` | Below-ground sqft input | n/a |
| `Project N!M13` | `=Summary!D88` | same | `getBuildCostPerSqft(project)` | Construction cost / sqft (defaults to Summary value) | yes |
| `Project N!M14` | `=M10*M13*-1` | same | `getTotalBuildCost(project)` | Total build cost USD (negative) | yes |
| `Project N!M16` | `0.095` (hardcoded) | input | `interestRate` | Annual interest rate | n/a |
| `Project N!M17` | `0.75` | input | `landLtv` | Loan-to-value on land | n/a |
| `Project N!M18` | `0.75` | input | `constructionLtv` | LTV on construction | n/a |
| `Project N!M19` | `0.25` | input | `equityPct` | Equity % | n/a |
| `Project N!M21` | `=SUM(M41+M60+M71)/-M10` | `lib/calc/project/cost-per-sqft.ts` | `developmentCostPerSqft` | Total dev cost / sqft (excl. overhead). Positive number from negative costs. | yes |
| `Project N!M22` | `=Summary!D93` | input | `profitAmbitionPct` | Profit margin target | n/a |
| `Project N!M23` | `=M21*(1+M22)` | same | `goalSellingPricePerSqft` | Goal $/sqft to hit profit ambition | yes |
| `Project N!M24` | hardcoded | input | `actualSellingPricePerSqft` | Manual override / actual list $/sqft | n/a |
| `Project N!M25` | `=M24/M21-1` | same | `actualProfitPct` | Actual margin at current list price | yes |

### 1.2 Sales ambition (rows 27-31)

| Excel ref | Excel formula | TS module | TS function | Purpose |
|---|---|---|---|---|
| `Project N!M27` | `=M23*M10` | `lib/calc/project/sales.ts` | `salesAmbition` | Target gross sale price |
| `Project N!M28` | `=M22*M27` | same | `profitAmbition` | Target gross profit |
| `Project N!M30` | `=M23*M10` | same | `goalSellingPrice` | Same as ambition; kept for clarity |
| `Project N!M31` | `=M73` | same | `projectGrossProfit` | Hooks into P&L below |

### 1.3 P&L line items (rows 37-45)

The P&L is structured as a monthly grid (columns O through AS, representing months 0-39 of the project). Each row sums to column M.

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Project N!M39` | `=M30` | `lib/calc/project/pnl.ts` | `totalSales` | Total sales (column M) — equals goal selling price | yes |
| `Project N!O39:AS39` | mostly `0` then `M30` in the sale month | same | `monthlySales(month)` | Sales happen in `salesDateMonth` only | yes |
| `Project N!M41` | `=M9` | same | `totalLandCost` | Negative | yes |
| `Project N!O41:AS41` | `=M9` in month 0, else `0` | same | `monthlyLandCost(month)` | Paid up-front | yes |
| `Project N!M44` | `=-SUM(SUM(M45:M47)+SUM(M51:M57)-(+M14))` | same | `totalConstructionCosts` | Negative; reconciliation of subcontractors against budget | yes |
| `Project N!M48` | `=SUM(M44:M45)` | same | `constructionSubtotal` | Negative | yes |
| `Project N!M51-M57` | `=-$M$10*Summary!F<113-119>` | `lib/calc/project/kingshaus.ts` | `kingshausLine(category, project)` | Each Kingshaus subline (panels, windows, façade, klas, granflo prod, granflo asm, logistics) = sqft × cost-per-sqft from Summary library | yes |
| `Project N!M58` | `=SUM(M51:M57)` | same | `kingshausTotal` | Negative | yes |
| `Project N!M60` | `=M58+M48` | `lib/calc/project/dev-costs.ts` | `totalDevelopmentCostsExclLand` | Negative | yes |

### 1.4 Financing & closing costs (rows 63-71)

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Project N!M64` | `=SUM(O64:AS64)` | `lib/calc/project/financing.ts` | `totalInterestOnDebt` | Sum of monthly interest accruals | yes |
| `Project N!O64:AS64` | `=(O85*$M$16)/-12` | same | `monthlyInterest(month, debtOutstanding)` | Negative; interest = prior debt outstanding × monthly rate | yes |
| `Project N!M65` | hardcoded `-227000` | input | `closingCostLandPurchase` | Fixed closing cost | n/a |
| `Project N!M66` | hardcoded `-50000` | input | `closingCostsLegalOther` | | n/a |
| `Project N!M67` | hardcoded `-44550` | input | `originationFee` | 1% of loan, locked at sign | n/a |
| `Project N!M68` | hardcoded `-11750` | input | `loanRenewalFee` | 0.25% | n/a |
| `Project N!M69` | hardcoded `-9000` | input | `loanServicingFee` | | n/a |
| `Project N!M70` | hardcoded `-7500` | input | `constructionDrawFee` | | n/a |
| `Project N!M71` | `=SUM(M64:M70)` | same | `totalFinancingAndClosingCosts` | Negative | yes |

### 1.5 Net P&L (rows 73-76)

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Project N!M73` | `=SUM(O73:AS73)` | `lib/calc/project/pnl.ts` | `netBeforeOverheads` | Net profit before overheads | yes |
| `Project N!O73:AS73` | `=O60+O41+O39+SUM(O64:O70)` | same | `monthlyNetBeforeOverheads(month)` | Per-month net = dev costs + land + sales + financing | yes |
| `Project N!M74` | `=M73/M39` | same | `netMargin` | Net margin (as decimal, e.g. 0.25) | yes |
| `Project N!M76` | `=M71+M60+M41` | same | `totalDevelopmentCostInclLand` | Negative; used by Summary tab | yes |

### 1.6 Debt schedule (rows 79-85)

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Project N!M81` | `=M17` | input | `debtDrawnRatio` | Equals land LTV by convention; treated as a parameter to debt sizing | n/a |
| `Project N!O81:AS81` | `=-(O41+O60+SUM(O65:O70))-O88` | `lib/calc/project/debt.ts` | `monthlyDebtDrawn(month)` | Debt drawn = -(cash outflows that month) - equity that month. Sign: positive when drawn. | yes |
| `Project N!O83:AS83` | `=O81` | same | `monthlyDebtTotal(month)` | Identity row, used for clarity | yes |
| `Project N!O85:AS85` | `=O83` (first month), then `=O85+P83` (cumulative) | same | `cumulativeDebt(month)` | Running balance of outstanding debt | yes |

### 1.7 Equity schedule (rows 87-89)

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Project N!M88` | `=(-M9-M14)*M19-SUM(M65:M70)` | `lib/calc/project/equity.ts` | `equityRequired` | Total equity required; positive | yes |
| `Project N!O88:AS88` | `0` then `=MAX(0,-(prev_cash + ...))` | same | `monthlyEquityCall(month)` | Equity is called when project cash would otherwise go negative. **Critical formula — port carefully.** | yes |
| `Project N!O89:AS89` | running sum of equity calls | same | `cumulativeEquity(month)` | Running total of equity drawn | yes |

### 1.8 Project cash flow (rows 93-112)

This is the row block that `Juno Forecast` rolls up.

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Project N!O96:AS96` | `0` except in sale month → `=M30` | `lib/calc/project/cash-flow.ts` | `monthlyVillaSale(month)` | Sale receipt | yes |
| `Project N!O97:AS97` | `0` except in sale month → `=-cumulativeDebt(salesMonth)` | same | `monthlyLoanRepayment(month)` | Debt repaid at sale | yes |
| `Project N!O99` | `=O41` | same | `monthlyLandCostFlow(month)` | Pass-through | yes |
| `Project N!O100` | `=SUM(O44:O45)` | same | `monthlyConstructionFlow(month)` | Pass-through | yes |
| `Project N!O101` | `=O58` | same | `monthlyKingshausFlow(month)` | Pass-through | yes |
| `Project N!O102` | `=O64` | same | `monthlyInterestFlow(month)` | Pass-through | yes |
| `Project N!O103` | `=SUM(O65:O70)` | same | `monthlyClosingFlow(month)` | Closing fees timing | yes |
| `Project N!O104` | `=SUM(O99:O103)` | same | `monthlyTotalConstructionOutflow(month)` | Sum of project costs | yes |
| `Project N!O108` | `=O83` | same | `monthlyDebtFinancing(month)` | Pass-through | yes |
| `Project N!O109` | `=O88` | same | `monthlyEquityFinancing(month)` | Pass-through | yes |
| `Project N!O110` | `=SUM(O108:O109)` | same | `monthlyTotalFinancing(month)` | Sum of debt + equity | yes |
| `Project N!O112` | `=O110+O104` | same | `monthlyNetCashFlow(month)` | Net cash for the month | yes |

---

## 2. Juno Forecast tab (portfolio aggregator)

`Juno Forecast` rolls up all 10 project tabs into a monthly + annual portfolio view.

**TypeScript namespace:** `lib/calc/portfolio/`

### 2.1 P&L aggregation (rows 6-17)

| Excel ref | Excel formula (template) | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Juno Forecast!B6` row | dates from 2026-01 through 2029-12 | `lib/calc/portfolio/calendar.ts` | `getPortfolioMonths()` | The month grid (~48 columns) | yes |
| `Juno Forecast!C8:AY8` | `='Project 2 - 84 SBR'!O39 + 'Project 3 - TBC'!O39 + ... + 'Project 11'!O39` | `lib/calc/portfolio/pnl.ts` | `monthlySales(month)` | Sum of monthlySales across all projects | yes |
| `Juno Forecast!C10:AY10` | sum of O41 across all projects | same | `monthlyLandCost(month)` | | yes |
| `Juno Forecast!C11:AY11` | sum of O48 across all projects | same | `monthlyConstructionCosts(month)` | | yes |
| `Juno Forecast!C12:AY12` | sum of O58 across all projects | same | `monthlyKingshausCosts(month)` | | yes |
| `Juno Forecast!C13:AY13` | `=SUM(C9:C12)` | same | `monthlyTotalDevCosts(month)` | Negative | yes |
| `Juno Forecast!C15:AY15` | first non-zero: `=-'Juno Opex Forecast'!H54`; subsequent: `=prev month` | `lib/calc/portfolio/opex.ts` | `monthlyOpex(month)` | Negative; constant after first non-zero | yes |
| `Juno Forecast!C16:AY16` | sum of O71 across all projects | same | `monthlyFinancingCosts(month)` | Interest + fees | yes |
| `Juno Forecast!C17:AY17` | `=SUM(C15:C16)+C13+C8` | same | `monthlyProfitBeforeTax(month)` | Negative most months, positive on sale months | yes |
| `Juno Forecast!BA8:BD8` | annual sums by year (FY26..FY29) | same | `annualSales(year)` | | yes |
| `Juno Forecast!BA13:BD13` | annual sums | same | `annualTotalDevCosts(year)` | | yes |
| `Juno Forecast!BA15:BD15` | annual sums | same | `annualOpex(year)` | | yes |
| `Juno Forecast!BA16:BD16` | annual sums | same | `annualFinancingCosts(year)` | | yes |
| `Juno Forecast!BA17:BD17` | annual sums | same | `annualProfitBeforeTax(year)` | | yes |

### 2.2 Debt & equity (rows 23-33)

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Juno Forecast!C25:AY25` | sum of O81 across projects | `lib/calc/portfolio/debt.ts` | `monthlyDebtDrawnLand(month)` | | yes |
| `Juno Forecast!C26:AY26` | sum of O82 across projects | same | `monthlyDebtDrawnConstruction(month)` | | yes |
| `Juno Forecast!C27:AY27` | `=SUM(C25:C26)` | same | `monthlyDebtDrawnTotal(month)` | | yes |
| `Juno Forecast!C29:AY29` | running sum | same | `cumulativeDebt(month)` | | yes |
| `Juno Forecast!C32:AY32` | `=C81` cross-ref | `lib/calc/portfolio/equity.ts` | `monthlyEquityCall(month)` | Portfolio-level equity requirement | yes |
| `Juno Forecast!C33:AY33` | running sum | same | `cumulativeEquity(month)` | | yes |

### 2.3 Portfolio cash flow (rows 41-83)

This is the canonical cash flow that Summary tab reads. Every cell here has a TypeScript equivalent.

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Juno Forecast!C41` | `0`; `D41 = C59` | `lib/calc/portfolio/cash-flow.ts` | `openingBalance(month)` | Opening cash for the month | yes |
| `Juno Forecast!C43` | sum of O96 across projects | same | `monthlySaleReceipts(month)` | | yes |
| `Juno Forecast!C44` | sum of O97 across projects | same | `monthlyLoanRepayments(month)` | Negative | yes |
| `Juno Forecast!C46:C50` | sums of O99..O103 across projects + opex | same | `monthlyOperatingOutflows(month)` | { land, construction, kingshaus, financing, overheads } | yes |
| `Juno Forecast!C51` | `=SUM(C46:C50)` | same | `monthlyTotalConstructionOutflow(month)` | | yes |
| `Juno Forecast!C55` | sum of O108 across projects | same | `monthlyDebtFinancing(month)` | | yes |
| `Juno Forecast!C56` | `0`; subsequent: `=MAX(0,-(C78+D77+D55))` | same | `monthlyEquityInflow(month)` | Portfolio-level equity calls (NOT same as cumulativeEquity row 33) | yes |
| `Juno Forecast!C57` | `=SUM(C55:C56)` | same | `monthlyTotalFinancing(month)` | | yes |
| `Juno Forecast!C59` | `=C57+C51+C44+C43+C41` | same | `netCashFlow(month)` | | yes |
| `Juno Forecast!C76:C78` | gross cash requirement schedule | same | `cashRequirementSchedule(month)` | Returns `{opening, netBeforeFinancing, closing}` | yes |
| `Juno Forecast!C80:C82` | equity-before-financing schedule | same | `equityRequirementSchedule(month)` | Returns `{cashBeforeEquity, equityRequired, cumulativeEquity}` | yes |
| `Juno Forecast!C83` | `=MAX(C82:AY82)` | `lib/calc/portfolio/kpis.ts` | `peakEquityRequired()` | **Critical: feeds Summary D6.** | yes |

---

## 3. Summary tab (top-level KPIs)

`Summary` is the dashboard the platform's Portfolio landing surface mirrors. Every KPI on the landing must reconcile to a Summary cell.

**TypeScript namespace:** `lib/calc/summary/`

### 3.1 Capital structure & timing (rows 6-10)

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Summary!D6` | `='Juno Forecast'!C83` | `lib/calc/summary/capital.ts` | `peakEquityRequired()` | Pass-through to portfolio | yes |
| `Summary!D7` | `=INDEX('Juno Forecast'!C74:AY74,MATCH('Juno Forecast'!C83,'Juno Forecast'!C82:AY82,0))` | same | `monthOfPeakEquity()` | The date label of peak-equity month | yes |
| `Summary!D8` | `=MAX('Juno Forecast'!E67:AY67)` | same | `maxDebtOutstanding()` | | yes |
| `Summary!D9` | `=INDEX('Juno Forecast'!C74:AY74,MATCH(D8,'Juno Forecast'!C67:AY67,0))` | same | `monthOfMaxDebt()` | | yes |
| `Summary!D10` | `=D8/D6` | same | `debtToEquityRatio()` | | yes |

### 3.2 Annual roll-ups (rows 22-27, 57-63)

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Summary!F23:I23` | `=SUM('Juno Forecast'!C56:N56)` etc. | `lib/calc/summary/annual.ts` | `annualEquityDrawnNet(year)` | Per year: equity drawn (net) | yes |
| `Summary!F24:I24` | `=MAX('Juno Forecast'!C67:N67)` | same | `annualMaxDebtOutstanding(year)` | | yes |
| `Summary!H23:H26` | various sales references | same | `annualSales(year)` | (Note: appears twice in Summary — once at H23:H26, again at F59:I59. Both port to the same function.) | yes |
| `Summary!F57:I57` | hardcoded counts `3, 3, 4, 0` | input | `numProjectsStarted(year)` | | n/a |
| `Summary!F59:I59` | `='Juno Forecast'!BA8` etc. | `lib/calc/summary/annual.ts` | `annualRevenue(year)` | | yes |
| `Summary!F60:I60` | `='Juno Forecast'!BA13` etc. | same | `annualTotalDevCosts(year)` | | yes |
| `Summary!F61:I61` | `='Juno Forecast'!BA15` etc. | same | `annualOverheads(year)` | | yes |
| `Summary!F62:I62` | `='Juno Forecast'!BA16` etc. | same | `annualInterestCosts(year)` | | yes |
| `Summary!F63:I63` | `=SUM(F59:F62)` | same | `annualProfitBeforeTax(year)` | | yes |

### 3.3 Cash flow roll-up (rows 67-84)

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Summary!F68:I68` | `='Juno Forecast'!C41` then `=prev year F84` | `lib/calc/summary/cash.ts` | `annualOpeningCash(year)` | | yes |
| `Summary!F70:I70` | `SUMIFS` filtered by year | same | `annualSalesReceipts(year)` | | yes |
| `Summary!F71:I71` | `SUMIFS` | same | `annualLandCosts(year)` | | yes |
| `Summary!F72:I72` | `SUMIFS` | same | `annualConstructionOutflows(year)` | | yes |
| `Summary!F73:I73` | `SUMIFS` | same | `annualKingshausOutflows(year)` | | yes |
| `Summary!F74:I74` | `SUMIFS` | same | `annualOverheadsOutflows(year)` | | yes |
| `Summary!F75:I75` | `=SUM(F70:F74)` | same | `annualCashFromOperations(year)` | | yes |
| `Summary!F77:I77` | `SUMIFS` | same | `annualInterestOnDebt(year)` | | yes |
| `Summary!F78:I78` | `SUMIFS` | same | `annualDebtDrawdown(year)` | | yes |
| `Summary!F79:I79` | `SUMIFS` | same | `annualLoanRepayments(year)` | | yes |
| `Summary!F80:I80` | `SUMIFS` | same | `annualEquityInflow(year)` | | yes |
| `Summary!F81:I81` | `=SUM(F77:F80)` | same | `annualCashFromFinancing(year)` | | yes |
| `Summary!F83:I83` | `=F81+F75+F68` (first); `=G81+G75` (subsequent) | same | `annualNetCashFlow(year)` | | yes |
| `Summary!F84:I84` | `=F83`; `=G83+G68` | same | `annualClosingBalance(year)` | | yes |

### 3.4 Assumptions (rows 88-94)

These are **inputs** in TS, stored in the `portfolio_settings` table.

| Excel ref | Value | DB column | Note |
|---|---|---|---|
| `Summary!D88` | `470` | `portfolio_settings.build_cost_per_sqft_default` | USD/sqft |
| `Summary!D89` | `0.095` | `portfolio_settings.interest_rate_default` | Annual |
| `Summary!D90` | `0.75` | `portfolio_settings.land_ltv_default` | |
| `Summary!D91` | `0.75` | `portfolio_settings.construction_ltv_default` | |
| `Summary!D92` | `0.25` | `portfolio_settings.equity_pct_default` | |
| `Summary!D93` | `0.25` | `portfolio_settings.profit_ambition_default` | |
| `Summary!D94` | `='Juno Opex Forecast'!I54` | derived | Monthly portfolio overheads |

### 3.5 Project ramp-up (rows 98-108)

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Summary!F99:F108` | hardcoded dates | input | `projectStartDates` | One per project | n/a |
| `Summary!G99:G108` | `=EDATE(F99,13)` | `lib/calc/project/timeline.ts` | `salesDateFromStart(start, programMonths)` | Uses Excel-equivalent EDATE. **See note below.** | yes |
| `Summary!D99:D108` | hardcoded `13 months` | input | `programMonths` | Per-project duration | n/a |

**Critical:** Excel's `EDATE(start, 13)` behaviour at month-ends differs subtly from JavaScript date math. **Implement `addMonthsExcel(date, n)` exactly per Excel semantics:** if `start = 2026-01-31`, then `EDATE(start, 1) = 2026-02-28`. Test against Excel for every project's sales date.

### 3.6 Kingshaus superstructure library (rows 112-120)

The 7 superstructure cost categories drive every project's Kingshaus line items.

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Summary!F113` | `='6 GC'!M15/'6 GC'!$H$2` | `lib/calc/superstructure.ts` | `panelsMaterialsCostPerSqft()` | | yes |
| `Summary!F114` | `='6 GC'!M16/'6 GC'!$H$2` | same | `windowsCostPerSqft()` | | yes |
| `Summary!F115` | `='6 GC'!M17/'6 GC'!$H$2` | same | `facadeCostPerSqft()` | | yes |
| `Summary!F116` | `='6 GC'!M18/'6 GC'!$H$2` | same | `klasCostPerSqft()` | | yes |
| `Summary!F117` | `='6 GC'!M19/'6 GC'!$H$2` | same | `granfloProductionCostPerSqft()` | | yes |
| `Summary!F118` | `='6 GC'!M20/'6 GC'!$H$2` | same | `granfloAssemblyCostPerSqft()` | | yes |
| `Summary!F119` | `='6 GC'!M21/'6 GC'!$H$2` | same | `logisticsCostPerSqft()` | | yes |
| `Summary!F120` | `='6 GC'!M22/'6 GC'!H2` | same | `totalSuperstructureCostPerSqft()` | | yes |

`6 GC!M15:M22` are the absolute dollar costs from the reference Great Circle project; `6 GC!H2` is its sqft. Dividing yields a USD/sqft library that every other project consumes. **The library is data**, not computation — stored in `superstructure_cost_library` table, editable from Settings.

---

## 4. Juno Opex Forecast tab

Drives the portfolio overhead line.

**TypeScript namespace:** `lib/calc/opex/`

| Excel ref | Excel formula | TS module | TS function | Purpose | Golden test |
|---|---|---|---|---|---|
| `Juno Opex Forecast!H54` | aggregate (sum of opex categories × period) | `lib/calc/opex/monthly.ts` | `monthlyPortfolioOpex(month)` | Monthly USD opex | yes |
| `Juno Opex Forecast!I54` | annual sum | same | `annualPortfolioOpex(year)` | | yes |
| `Juno Opex Forecast` rows 5-50 | individual opex line items (salaries, software, office, travel, etc.) | input | `opexLineItems[]` | Stored in `opex_line_item` table, monthly cadence | n/a |

**Approach for port:** model the opex sheet as a list of `opex_line_item` rows with `(category, amount_usd_monthly, starts_at, ends_at?)`. The aggregator function sums them by month/year. **Do not** port row-by-row formulas — capture them as data.

---

## 5. Per-month / per-year axis conventions

Every calc function that returns a time-series uses one of three axis types:

| Axis | Type | Format |
|---|---|---|
| `MonthKey` | `string` | ISO month: `"2026-01"` |
| `YearKey` | `string` | ISO year: `"2026"` |
| `MonthIndex` | `number` | 0-indexed month from portfolio start (2026-01 = 0) |

The portfolio start is **2026-01** by convention (matches Excel column C in Juno Forecast). Stored in `portfolio_settings.portfolio_start_month`.

Helper module `lib/calc/calendar.ts`:
```ts
export function monthKey(d: Date): MonthKey;        // → "2026-03"
export function monthIndex(m: MonthKey): MonthIndex;
export function monthKeyFromIndex(i: MonthIndex): MonthKey;
export function yearKey(m: MonthKey): YearKey;
export function addMonthsExcel(d: Date, n: number): Date;  // Excel EDATE semantics
export function getPortfolioMonths(): MonthKey[];   // 48 months 2026-01..2029-12
```

---

## 6. Sign convention reference card

When in doubt, the rule is: **the row's sign in the Excel monthly grid is what you store.**

| Row | Sign | Note |
|---|---|---|
| Sales / villa sale | `+` | Cash in |
| Loan repayment | `−` | Cash out (to the lender) |
| Land cost | `−` | Cash out |
| Construction (incl. Kingshaus) | `−` | Cash out |
| Overheads | `−` | Cash out |
| Interest on debt | `−` | Cash out (booked monthly) |
| Closing / financing fees | `−` | Cash out |
| Debt drawdown | `+` | Cash in (from the lender) |
| Equity inflow | `+` | Cash in (from owners) |
| Net cash flow | signed | Excel sums signed; we mirror |

**Display layer flips signs** for costs to render as positive USD with a `–` prefix only on negative balances. **Calc layer keeps signs as Excel.**

---

## 7. Golden-master test plan

Located in `tests/golden/`.

For each of the 10 baseline projects, the following are asserted (tolerance: 0.5% or $1, whichever greater):
1. Total sales (M39).
2. Total land cost (M41).
3. Total construction (M48).
4. Total Kingshaus (M58).
5. Total development costs ex land (M60).
6. Total financing (M71).
7. Net before overheads (M73).
8. Net margin (M74).
9. Equity required (M88).
10. Per-month net cash flow (O112:AS112) — all 40 months.

For the portfolio, asserted:
1. Annual revenue (BA8:BD8).
2. Annual total dev costs (BA13:BD13).
3. Annual profit before tax (BA17:BD17).
4. Peak equity required (Summary!D6) — exact.
5. Month of peak equity (Summary!D7) — exact string match.
6. Max debt outstanding (Summary!D8).
7. Annual closing cash balance (F84:I84) — all 4 years.

**Generate fixtures:** `pnpm tsx scripts/excel-to-fixtures.ts` reads the master XLSX (via Python sidecar's openpyxl) and writes one CSV per project + one portfolio CSV into `tests/fixtures/excel/`. Run when the master is updated.

**Test format:**
```ts
// tests/golden/projects/project-5.golden.test.ts
import { computeProjectKpis } from "@/lib/calc/project";
import { loadFixture } from "@/tests/fixtures/load";
import { expectMatchExcel } from "@/tests/golden/helpers";

test("Project 5 matches Excel master", () => {
  const inputs = loadFixture("Project 5", "inputs");
  const expected = loadFixture("Project 5", "expected");
  const actual = computeProjectKpis(inputs);
  expectMatchExcel(actual, expected, { tol: 0.005 });
});
```

---

## 8. Deviations log

Any time you diverge from a formula above, record the deviation in `docs/formula-changes.md`. Format:

```
## D-001 (Project N M73 — Net before overheads)
Date: 2026-06-12
Author: Claude Code
Original Excel formula: =SUM(O73:AS73)
TypeScript implementation: sum O73:AS73 + handle case where sales month > 36 (Excel's monthly grid only goes to month 39)
Reason: Project 6 starts so late its sale falls in month 40, off the grid. Extended TS calculation to handle.
Reviewer: Viktor (approved 2026-06-12)
Test: tests/golden/projects/project-6.golden.test.ts passes after fix.
```

---

## 9. Out-of-scope formulas

These cells produce output the Excel master uses but Atlas does not. Do not port:

- `Juno Forecast!Row 61` — "Illustrative equity release" annotations. Not numbers.
- `Summary!D17:D19` — `[TBC]` placeholders for cumulative equity returned / MOIC / payback. These become **Atlas-native calculations** later (W1.8 covers equity returns; MOIC and payback in P2 backlog).
- `Project 3x`, `Juno Forecastx`, `Juno Forecast (2)` — legacy/scratch.

---

## 10. What this inventory does NOT cover

- **W1.7 Pricing engine** (comp + hedonic + market overlay). Excel master has no pricing logic. Pricing engine is greenfield. See `docs/pricing-design.md` (to be written in W1.7.1).
- **W1.8 Capital capacity engine** equity-at-risk curves. The portfolio cash flow above feeds W1.8 but W1.8 layers on top — see `docs/capacity-design.md` (to be written in W1.8.1).
- **W1.5 Approval snapshot / drift.** Captures *outputs* of this inventory at a point in time; doesn't add formulas.

These three are extensions of the formula inventory, not part of the Excel port. They have their own design docs.
