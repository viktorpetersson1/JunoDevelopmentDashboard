// Pure calculation engine. No DOM, no fetch. Importable and testable.

// ---------- cost spreading curves ----------

// Returns an array of weights of length n that sum to 1.
export function spreadingWeights(n, curve = "linear") {
  if (n <= 0) return [];
  if (n === 1) return [1];
  if (curve === "linear") {
    return new Array(n).fill(1 / n);
  }
  if (curve === "front_loaded") {
    // Roughly: 60% in first third, 30% middle, 10% final third
    const w = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      // Linear ramp from 1.6 at t=0 to 0.4 at t=1
      w[i] = 1.6 - 1.2 * t;
    }
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map(v => v / sum);
  }
  if (curve === "s_curve") {
    // Logistic-like: slow start, accelerate to mid, decelerate end
    const w = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      // bell-ish via sine: peaks at t=0.5
      w[i] = Math.sin(Math.PI * t);
    }
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map(v => v / sum);
  }
  return new Array(n).fill(1 / n);
}

// ---------- date helpers ----------

export function parseYM(s) {
  const [y, m] = s.split("-").map(Number);
  return { y, m };
}
export function addMonths(s, n) {
  const { y, m } = parseYM(s);
  // Coerce n to integer — fractional months don't make sense in a monthly grid
  const nInt = Math.round(n || 0);
  const total = (y * 12 + (m - 1)) + nInt;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
export function diffMonths(start, end) {
  const a = parseYM(start), b = parseYM(end);
  return (b.y - a.y) * 12 + (b.m - a.m);
}
export function buildTimeline(modelStart, horizon) {
  return Array.from({ length: horizon }, (_, i) => addMonths(modelStart, i));
}
export function fyOf(ym, mode = "calendar") {
  const { y, m } = parseYM(ym);
  if (mode === "juno13") {
    // Juno's convention: FY29 = Jan-2029 → Jan-2030 (13 months). So Jan-30 rolls into FY29.
    // Other years: FY26 = Jan-Dec 2026 (calendar). Only the last "stub" Jan rolls into the prior year.
    if (m === 1 && y === 2030) return "FY29";
    return `FY${String(y).slice(2)}`;
  }
  return `FY${String(y).slice(2)}`;
}

// ---------- effective driver resolution ----------

export function effectiveProject(project, globals, scenario) {
  // Resolve market modifier
  const marketId = project.market ?? "default";
  const market = (globals.markets || []).find(m => m.id === marketId)
    ?? { sale_price_multiplier: 1.0, build_cost_multiplier: 1.0 };
  const interest = (project.interest_rate_apr ?? globals.interest_rate_apr)
    + (scenario.interest_rate_delta_bps ?? 0) / 10000;
  const buildPsf = (project.build_cost_per_sqft ?? globals.default_build_cost_per_sqft)
    * (scenario.build_cost_multiplier ?? 1)
    * (market.build_cost_multiplier ?? 1);
  let kingshausPsf = project.kingshaus_cost_per_sqft ?? globals.default_kingshaus_cost_per_sqft;
  if (globals.use_kingshaus_breakdown && globals.kingshaus_breakdown_per_villa) {
    const totalPerVilla = Object.values(globals.kingshaus_breakdown_per_villa).reduce((a, b) => a + b, 0);
    kingshausPsf = totalPerVilla / project.villa_sqft;
  }
  const margin = scenario.margin_override ?? project.target_margin ?? globals.target_margin;
  const ltc = project.ltc_pct ?? globals.ltc_pct;
  const startShifted = addMonths(project.start_date, scenario.timing_shift_months ?? 0);
  return {
    ...project,
    _effective: {
      interest_rate_apr: interest,
      build_cost_per_sqft: buildPsf,
      kingshaus_cost_per_sqft: kingshausPsf,
      target_margin: margin,
      ltc_pct: ltc,
      start_date: startShifted,
      sale_price_multiplier: (scenario.sale_price_multiplier ?? 1) * (market.sale_price_multiplier ?? 1),
      market_id: marketId,
      market_name: market.name ?? "Unspecified",
      capitalize_interest: globals.capitalize_interest ?? true,
      financing_fees_per_project_usd: globals.financing_fees_per_project_usd ?? 350000,
      ltc_land_pct: globals.ltc_land_pct ?? 0.30,
    },
  };
}

// ---------- per-project monthly schedule ----------

export function calcProject(project, globals, scenario) {
  const p = effectiveProject(project, globals, scenario);
  const eff = p._effective;
  const N = globals.horizon_months;
  const timeline = buildTimeline(globals.model_start, N);
  const blank = () => new Array(N).fill(0);
  const out = {
    dates: timeline,
    sales: blank(),
    land_cost: blank(),
    build_cost: blank(),
    kingshaus: blank(),
    soft_cost: blank(),
    interest: blank(),
    debt_drawn: blank(),
    debt_repaid: blank(),
    debt_balance: blank(),
    equity_drawn: blank(),
    equity_returned: blank(),
    equity_balance: blank(),
    net_cash: blank(),
  };

  const startIdx = diffMonths(globals.model_start, eff.start_date);
  const program = project.program_months ?? globals.default_program_months;
  const saleIdx = startIdx + program;

  // Cost shape
  const landCost = -project.land_cost_usd;
  const buildTotal = -project.villa_sqft * eff.build_cost_per_sqft;
  const kingshausTotal = -project.villa_sqft * eff.kingshaus_cost_per_sqft;
  // Soft costs: prefer structured breakdown if present, else fall back to lump sum
  const softBreakdownSum = project.soft_costs
    ? Object.values(project.soft_costs).reduce((a, b) => a + (Number(b) || 0), 0)
    : 0;
  const softTotal = -(softBreakdownSum > 0 ? softBreakdownSum : (project.soft_costs_lump_sum || 0));

  // Project sits entirely outside the model window -> still emit a zero series.
  if (startIdx < 0 || saleIdx >= N) {
    // out-of-window projects contribute nothing; KPIs still computed at end.
  }

  // Land cost: at startIdx
  if (startIdx >= 0 && startIdx < N) out.land_cost[startIdx] = landCost;

  // Build cost: spread across [startIdx .. saleIdx-1] using the chosen curve.
  // build_cost_realization_pct < 1.0 mimics Excel's monthly grid under-allocation.
  const buildMonths = Math.max(1, program);
  const buildCurve = globals.build_cost_curve ?? "linear";
  const realization = globals.build_cost_realization_pct ?? 1.0;
  const buildWeights = spreadingWeights(buildMonths, buildCurve);
  for (let i = 0; i < buildMonths; i++) {
    const idx = startIdx + i;
    if (idx >= 0 && idx < N) out.build_cost[idx] += buildTotal * buildWeights[i] * realization;
  }

  // Kingshaus: invoices through middle 80% of build window (skip month 0 and last month)
  // Uses s_curve by default since panel deliveries are mid-build heavy
  const kingMonths = Math.max(1, program - 2);
  const kingWeights = spreadingWeights(kingMonths, "s_curve");
  for (let i = 1; i < program - 1; i++) {
    const idx = startIdx + i;
    if (idx >= 0 && idx < N) out.kingshaus[idx] += kingshausTotal * kingWeights[i - 1];
  }

  // Soft costs: one-off at start
  if (softTotal !== 0 && startIdx >= 0 && startIdx < N) out.soft_cost[startIdx] = softTotal;

  // Sale: derived OR user-override
  // If project.sale_price_override_usd is set, use that directly (market-based pricing).
  // Else if project.sale_price_per_sqft_override is set, multiply by sqft.
  // Else compute cost-plus-margin: total cost × (1+margin).
  const totalCostExFinancing = Math.abs(landCost + buildTotal + kingshausTotal + softTotal);
  const totalCostPerSqft = totalCostExFinancing / project.villa_sqft;
  let salePerSqft, salePrice;
  if (project.sale_price_override_usd != null && project.sale_price_override_usd > 0) {
    salePrice = project.sale_price_override_usd * eff.sale_price_multiplier;
    salePerSqft = salePrice / project.villa_sqft;
  } else if (project.sale_price_per_sqft_override != null && project.sale_price_per_sqft_override > 0) {
    salePerSqft = project.sale_price_per_sqft_override * eff.sale_price_multiplier;
    salePrice = salePerSqft * project.villa_sqft;
  } else {
    salePerSqft = totalCostPerSqft * (1 + eff.target_margin) * eff.sale_price_multiplier;
    salePrice = salePerSqft * project.villa_sqft;
  }
  if (saleIdx >= 0 && saleIdx < N) out.sales[saleIdx] = salePrice;

  // Forward pass for financing
  let debtBalance = 0;
  let equityBalance = 0;
  let totalDebtDrawn = 0;
  for (let m = 0; m < N; m++) {
    // Cost outflow this month (positive number)
    const monthCostsOut = -(out.land_cost[m] + out.build_cost[m] + out.kingshaus[m] + out.soft_cost[m]);

    // Interest accrued on opening debt balance
    const monthlyRate = eff.interest_rate_apr / 12;
    const interestAccrued = debtBalance * monthlyRate;
    out.interest[m] = -interestAccrued;

    // Interest treatment: capitalize into principal, or carry as accrued unpaid
    if (eff.capitalize_interest) {
      debtBalance += interestAccrued;
    }

    // Debt drawn — split by cost category (land has different LTC than build/kingshaus/soft)
    const landOut = -out.land_cost[m];
    const otherOut = -(out.build_cost[m] + out.kingshaus[m] + out.soft_cost[m]);
    const debtDraw = m === saleIdx ? 0 : (landOut * eff.ltc_land_pct + otherOut * eff.ltc_pct);
    out.debt_drawn[m] = debtDraw;
    debtBalance += debtDraw;
    totalDebtDrawn += debtDraw;

    // Equity drawn to cover the remainder
    const equityNeed = Math.max(0, monthCostsOut - debtDraw);
    out.equity_drawn[m] = equityNeed;
    equityBalance += equityNeed;

    // At sale month: receive sale + book financing fees, repay debt, residual returns to equity
    if (m === saleIdx) {
      const fees = eff.financing_fees_per_project_usd;
      out.interest[m] -= fees;       // book fees in same line as interest
      debtBalance += fees;            // financing fees capitalize into final payoff
      const sale = out.sales[m];
      const repay = Math.min(sale, debtBalance);
      out.debt_repaid[m] = repay;
      debtBalance = Math.max(0, debtBalance - repay);
      const residual = Math.max(0, sale - repay);
      out.equity_returned[m] = residual;
      equityBalance = Math.max(0, equityBalance - residual);
    }

    out.debt_balance[m] = debtBalance;
    out.equity_balance[m] = equityBalance;

    out.net_cash[m] = out.sales[m] + out.land_cost[m] + out.build_cost[m] + out.kingshaus[m]
      + out.soft_cost[m] + out.interest[m] + out.debt_drawn[m] - out.debt_repaid[m]
      + out.equity_drawn[m] - out.equity_returned[m];
  }

  // KPIs
  const totalSales = sum(out.sales);
  const totalDevCost = -sum(out.land_cost) - sum(out.build_cost) - sum(out.kingshaus) - sum(out.soft_cost);
  const totalInterest = -sum(out.interest);
  const grossProfit = totalSales - totalDevCost - totalInterest;
  const peakDebt = Math.max(0, ...out.debt_balance);
  const peakEquity = Math.max(0, ...out.equity_balance);

  const projectEquityCF = equityCashFlowSeries(out);
  const projectMoic = sum(out.equity_drawn) > 0 ? sum(out.equity_returned) / sum(out.equity_drawn) : 0;
  const projectMonthlyIRR = monthlyIRR(projectEquityCF);
  const projectAnnualIRR = annualizedIRR(projectMonthlyIRR);

  // Yield metrics (real-estate development conventions)
  const totalCostAllIn = totalDevCost + totalInterest;
  const yieldOnCost = totalCostAllIn > 0 ? grossProfit / totalCostAllIn : 0;       // development yield
  const profitPerSqft = project.villa_sqft > 0 ? grossProfit / project.villa_sqft : 0;
  const equityIn = sum(out.equity_drawn);
  const equityYield = equityIn > 0 ? grossProfit / equityIn : 0;                    // gross return on equity
  const roic = totalCostAllIn > 0 ? totalSales / totalCostAllIn : 0;                // revenue per $ invested

  return {
    project_id: project.id,
    project_name: project.name,
    sale_date: timeline[saleIdx] ?? null,
    start_date: timeline[startIdx] ?? null,
    monthly: out,
    kpis: {
      total_sales: totalSales,
      total_dev_cost: totalDevCost,
      total_interest: totalInterest,
      total_cost_all_in: totalCostAllIn,
      gross_profit: grossProfit,
      profit_margin_pct: totalSales > 0 ? grossProfit / totalSales : 0,
      peak_debt: peakDebt,
      peak_equity: peakEquity,
      sale_price_per_sqft: salePerSqft,
      total_cost_per_sqft: totalCostPerSqft,
      moic: projectMoic,
      irr_monthly: projectMonthlyIRR,
      irr_annual: projectAnnualIRR,
      yield_on_cost: yieldOnCost,
      profit_per_sqft: profitPerSqft,
      equity_yield: equityYield,
      roic_multiple: roic,
    },
  };
}

// ---------- portfolio aggregation ----------

// v12.1 — stages in the "closed" group are sold/archived/historical
const CLOSED_STAGES = ["sold", "archived"];
export function isClosed(project) {
  if (project.stage) return CLOSED_STAGES.includes(project.stage);
  return project.status === "sold";  // legacy fallback
}

export function aggregatePortfolio(projects, globals, scenario) {
  // Filter out excluded + (optionally) closed projects (they're historical)
  const includeClosed = globals.include_sold_projects ?? false;
  const active = projects.filter(
    (p) => !scenario.excluded_project_ids.includes(p.id)
      && (includeClosed || !isClosed(p))
  );
  const projectResults = active.map((p) => calcProject(p, globals, scenario));
  const N = globals.horizon_months;
  const timeline = buildTimeline(globals.model_start, N);
  const keys = ["sales", "land_cost", "build_cost", "kingshaus", "soft_cost",
    "interest", "debt_drawn", "debt_repaid", "debt_balance",
    "equity_drawn", "equity_returned", "equity_balance", "net_cash"];
  const port = { dates: timeline };
  for (const k of keys) port[k] = new Array(N).fill(0);
  for (const r of projectResults) {
    for (const k of keys) for (let i = 0; i < N; i++) port[k][i] += r.monthly[k][i];
  }

  // Overhead: spread annual_opex monthly, escalate by opex_growth_rate per fiscal year (calendar)
  port.overhead = new Array(N);
  const baseOpex = globals.annual_opex_usd;
  const growth = globals.opex_growth_rate ?? 0;
  const baseYear = parseYM(globals.model_start).y;
  for (let i = 0; i < N; i++) {
    const y = parseYM(timeline[i]).y;
    const yearsFromBase = y - baseYear;
    const yearlyOpex = baseOpex * Math.pow(1 + growth, yearsFromBase);
    port.overhead[i] = -yearlyOpex / 12;
  }
  for (let i = 0; i < N; i++) port.net_cash[i] += port.overhead[i];

  // Cumulative equity & debt for KPI extraction
  port.cum_equity_drawn = cumulative(port.equity_drawn);
  port.cum_equity_returned = cumulative(port.equity_returned);
  port.cum_equity_balance = port.equity_balance.slice();

  // Excel-style peak equity: cash-flow-driven cumulative equity calls (sticky — never decreases).
  // This is what Juno Forecast row 83 ("Max equity") computes via:
  //   cash_before_equity[m] = closing_cash[m-1] + net_cash[m] + debt_drawn[m]
  //   equity_called[m] = max(0, -cash_before_equity[m])
  //   peak = max(cumulative(equity_called))
  port.equity_called = new Array(N).fill(0);
  port.cum_equity_called = new Array(N).fill(0);
  port.cash_before_equity = new Array(N).fill(0);
  port.closing_cash = new Array(N).fill(0);
  let openingCash = 0;
  let cumCalled = 0;
  for (let m = 0; m < N; m++) {
    // Net cash before financing = sales + costs (incl. overhead, interest, fees)
    const netBeforeFin = port.sales[m] + port.land_cost[m] + port.build_cost[m]
      + port.kingshaus[m] + port.soft_cost[m] + port.overhead[m] + port.interest[m];
    // Cash before equity = opening + net cash + debt drawn − debt repaid
    const cashBeforeEq = openingCash + netBeforeFin + port.debt_drawn[m] - port.debt_repaid[m];
    port.cash_before_equity[m] = cashBeforeEq;
    const called = Math.max(0, -cashBeforeEq);
    port.equity_called[m] = called;
    cumCalled += called;
    port.cum_equity_called[m] = cumCalled;
    port.closing_cash[m] = cashBeforeEq + called;
    openingCash = port.closing_cash[m];
  }

  // v14.6 (Phase 2.3) — KPC Line of Credit pool
  //
  // What the existing engine calls "equity_called" is actually the gap between senior debt
  // and total project cost. In Juno's real capital stack, that gap is filled FIRST by the
  // KPC LOC ($6M facility, 6% APR, capitalized interest), and only the excess comes from
  // true equity (the 7 individual owners).
  //
  // Pool model: at each month, accrue interest on the outstanding LOC balance, then allocate
  // new equity demand to LOC up to remaining facility headroom, with the rest going to true
  // equity calls. Equity_returned flows repay LOC first, then equity holders.
  //
  // Existing fields (equity_called, equity_drawn, equity_balance, etc.) are left untouched
  // so downstream consumers (waterfall, IRR, KPI cards) keep working. This is additive.
  const locConfig = globals.kpc_loc || { facility_size_usd: 0, interest_rate_apr: 0, capitalize_interest: true };
  const locCap = locConfig.facility_size_usd || 0;
  const locMonthlyRate = (locConfig.interest_rate_apr || 0) / 12;
  port.loc_drawn = new Array(N).fill(0);
  port.loc_repaid = new Array(N).fill(0);
  port.loc_interest = new Array(N).fill(0);
  port.loc_balance = new Array(N).fill(0);
  port.loc_available = new Array(N).fill(0);
  port.true_equity_drawn = new Array(N).fill(0);
  port.true_equity_returned = new Array(N).fill(0);
  port.true_equity_balance = new Array(N).fill(0);
  port.cap_breach = new Array(N).fill(false);
  let locBalance = 0;
  let trueEquityBalance = 0;
  for (let m = 0; m < N; m++) {
    // 1. Accrue capitalized interest on outstanding LOC balance
    const interest = locConfig.capitalize_interest === false ? 0 : locBalance * locMonthlyRate;
    locBalance += interest;
    port.loc_interest[m] = interest;

    // 2. Allocate this month's equity demand to LOC (first) then true equity (overflow)
    const demand = port.equity_called[m];
    const room = Math.max(0, locCap - locBalance);
    const locTake = Math.min(demand, room);
    locBalance += locTake;
    port.loc_drawn[m] = locTake;
    const trueTake = demand - locTake;
    port.true_equity_drawn[m] = trueTake;
    trueEquityBalance += trueTake;
    if (demand > 0 && trueTake > 0) port.cap_breach[m] = true; // LOC was insufficient this month

    // 3. Sales-driven equity returns repay LOC first, then flow to true equity holders
    const returned = port.equity_returned[m];
    const locRepay = Math.min(returned, locBalance);
    locBalance -= locRepay;
    port.loc_repaid[m] = locRepay;
    const trueReturn = returned - locRepay;
    port.true_equity_returned[m] = trueReturn;
    trueEquityBalance = Math.max(0, trueEquityBalance - trueReturn);

    port.loc_balance[m] = locBalance;
    port.true_equity_balance[m] = trueEquityBalance;
    port.loc_available[m] = Math.max(0, locCap - locBalance);
  }
  port.loc_peak_balance = Math.max(0, ...port.loc_balance);
  port.loc_peak_drawn_pct = locCap > 0 ? port.loc_peak_balance / locCap : 0;
  port.loc_total_interest = port.loc_interest.reduce((a, b) => a + b, 0);
  port.true_equity_total_drawn = port.true_equity_drawn.reduce((a, b) => a + b, 0);
  port.cap_breach_months = port.cap_breach.reduce((a, b) => a + (b ? 1 : 0), 0);
  port.kpc_loc_config = { ...locConfig };

  // Annual rollup (mode-aware: "calendar" or "juno13")
  const fyMode = globals.fiscal_year_mode ?? "calendar";
  const annual = {};
  for (let i = 0; i < N; i++) {
    const fy = fyOf(timeline[i], fyMode);
    if (!annual[fy]) annual[fy] = {
      sales: 0, land: 0, build: 0, kingshaus: 0, soft: 0,
      opex: 0, interest: 0, profit_before_tax: 0,
    };
    annual[fy].sales += port.sales[i];
    annual[fy].land += port.land_cost[i];
    annual[fy].build += port.build_cost[i];
    annual[fy].kingshaus += port.kingshaus[i];
    annual[fy].soft += port.soft_cost[i];
    annual[fy].opex += port.overhead[i];
    annual[fy].interest += port.interest[i];
  }
  const effTaxRate = (globals.apply_tax ?? true)
    ? ((globals.tax_rate_pct ?? 0) + (globals.tax_state_rate_pct ?? 0))
    : 0;
  const lossCarryForward = globals.loss_carryforward ?? true;
  // Tax loss carryforward: track running NOL (net operating loss) balance; offset positive profits
  // until exhausted. Process fiscal years in order.
  const yearKeys = Object.keys(annual).sort();
  let nolBalance = 0;
  for (const fy of yearKeys) {
    const a = annual[fy];
    a.profit_before_tax = a.sales + a.land + a.build + a.kingshaus + a.soft + a.opex + a.interest;
    if (effTaxRate <= 0) {
      a.taxable_profit = a.profit_before_tax;
      a.nol_used = 0;
      a.nol_balance = nolBalance;
      a.tax = 0;
      a.profit_after_tax = a.profit_before_tax;
      continue;
    }
    if (a.profit_before_tax >= 0) {
      const nolUsed = lossCarryForward ? Math.min(nolBalance, a.profit_before_tax) : 0;
      a.nol_used = nolUsed;
      a.taxable_profit = Math.max(0, a.profit_before_tax - nolUsed);
      a.tax = -a.taxable_profit * effTaxRate;
      nolBalance -= nolUsed;
    } else {
      // Loss year: add to NOL balance (no tax, no refund)
      a.taxable_profit = 0;
      a.nol_used = 0;
      a.tax = 0;
      if (lossCarryForward) nolBalance += -a.profit_before_tax;
    }
    a.nol_balance = nolBalance;
    a.profit_after_tax = a.profit_before_tax + a.tax;
  }

  // Headline KPIs
  // Peak equity uses Excel-style cash-flow-driven cumulative calls (Juno Forecast!C83 logic).
  const peakEquityCommitted = Math.max(0, ...port.cum_equity_called);
  const peakEquityCommittedIdx = port.cum_equity_called.indexOf(peakEquityCommitted);
  const peakEquityOutstandingIdx = argmax(port.equity_balance);
  const peakEquityOutstanding = port.equity_balance[peakEquityOutstandingIdx];
  const maxDebtIdx = argmax(port.debt_balance);
  const totalEquityCalled = sum(port.equity_called);
  // Equity returned = excess cash at end of horizon over peak called (proxy for distributable)
  const finalCash = port.closing_cash[N - 1];
  const totalEquityReturned = Math.max(0, finalCash);
  const totalEquityIn = sum(port.equity_drawn);
  const totalEquityOut = sum(port.equity_returned);
  const totalProfit = sum(port.sales) + sum(port.land_cost) + sum(port.build_cost)
    + sum(port.kingshaus) + sum(port.soft_cost) + sum(port.overhead) + sum(port.interest);
  const totalTax = Object.values(annual).reduce((a, y) => a + (y.tax || 0), 0);
  const totalProfitAfterTax = totalProfit + totalTax;
  const paybackIdx = findPaybackIdx(port.cum_equity_drawn, port.cum_equity_returned);
  // Portfolio IRR uses Excel-style cash flow (equity calls + final liquidation distribution)
  // so it matches the waterfall numbers shown per-investor.
  const portfolioEquityCF = equityCashFlowFromCalls(port);
  const portfolioMonthlyIRR = monthlyIRR(portfolioEquityCF);
  const portfolioAnnualIRR = annualizedIRR(portfolioMonthlyIRR);

  const waterfall = computeWaterfall(port, globals.investors, globals);
  const hypothetical = hypotheticalLpAnalysis(port, globals);

  return {
    timeline,
    monthly: port,
    annual,
    waterfall,
    hypothetical_lp: hypothetical,
    kpis: {
      // Excel-aligned: cumulative equity ever called (matches Juno Forecast!C83 "Max equity").
      peak_equity_required: peakEquityCommitted,
      peak_equity_month: timeline[peakEquityCommittedIdx],
      // Peak equity outstanding (net of distributions): how much is "in the project" at any time.
      peak_equity_outstanding: peakEquityOutstanding,
      peak_equity_outstanding_month: timeline[peakEquityOutstandingIdx],
      max_debt_outstanding: port.debt_balance[maxDebtIdx],
      max_debt_month: timeline[maxDebtIdx],
      total_sales: sum(port.sales),
      total_dev_cost: -sum(port.land_cost) - sum(port.build_cost) - sum(port.kingshaus) - sum(port.soft_cost),
      total_interest: -sum(port.interest),
      total_opex: -sum(port.overhead),
      total_profit_before_tax: totalProfit,
      total_tax: -totalTax,
      total_profit_after_tax: totalProfitAfterTax,
      effective_tax_rate: effTaxRate,
      // Portfolio yield metrics (sum across active projects)
      portfolio_yield_on_cost: (() => {
        const totalAllIn = -sum(port.land_cost) - sum(port.build_cost) - sum(port.kingshaus) - sum(port.soft_cost) - sum(port.interest);
        return totalAllIn > 0 ? totalProfit / totalAllIn : 0;
      })(),
      portfolio_revenue_multiple: (() => {
        const totalAllIn = -sum(port.land_cost) - sum(port.build_cost) - sum(port.kingshaus) - sum(port.soft_cost) - sum(port.interest);
        return totalAllIn > 0 ? sum(port.sales) / totalAllIn : 0;
      })(),
      total_sqft: projectResults.reduce((a, r) => {
        const p = active.find(x => x.id === r.project_id);
        return a + (p?.villa_sqft || 0);
      }, 0),
      portfolio_profit_per_sqft: (() => {
        const totalSqft = active.reduce((a, p) => a + (p.villa_sqft || 0), 0);
        return totalSqft > 0 ? totalProfit / totalSqft : 0;
      })(),
      // v13 — cash-on-cash return: annualized equity distributions / equity in.
      // Uses the equity_called series for "in" and equity_returned series for "out".
      cash_on_cash: (() => {
        const totalIn = totalEquityCalled > 0 ? totalEquityCalled : totalEquityIn;
        const totalOut = totalEquityReturned > 0 ? totalEquityReturned : totalEquityOut;
        if (totalIn <= 0) return 0;
        // Average hold years across the equity curve. Approximation: midpoint of horizon weighted.
        const holdYears = Math.max(0.5, (paybackIdx >= 0 ? paybackIdx + 1 : N) / 12);
        const cumulativeReturn = (totalOut / totalIn);
        // Annualize: (multiple)^(1/years) - 1
        return cumulativeReturn > 0 ? Math.pow(cumulativeReturn, 1 / holdYears) - 1 : -1;
      })(),
      // v13 — contingency budget + used + burn rate
      contingency: (() => {
        const cpct = globals.contingency_pct ?? 0.05;
        // Budget = contingency % of hard costs (build + Kingshaus) per active project
        const budget = active.reduce((sum, p) => {
          const eff = (p.build_cost_per_sqft ?? globals.default_build_cost_per_sqft) * (p.villa_sqft || 0);
          const king = (p.kingshaus_cost_per_sqft ?? globals.default_kingshaus_cost_per_sqft) * (p.villa_sqft || 0);
          return sum + (eff + king) * cpct;
        }, 0);
        const used = active.reduce((sum, p) => sum + (p.contingency_used_usd || 0), 0);
        return {
          budget_usd: budget,
          used_usd: used,
          remaining_usd: Math.max(0, budget - used),
          burn_pct: budget > 0 ? used / budget : 0,
        };
      })(),
      // v12.4 sales-cycle metrics — only counts projects with actual closing data
      sales_metrics: (() => {
        const sold = projects.filter(p => p.closing_date && p.listing_date);
        if (!sold.length) return { sold_count: 0, avg_dom: null, avg_listing_to_close: null, avg_price_to_listing_ratio: null, total_actual_sales: 0 };
        const days = (a, b) => Math.round((new Date(b) - new Date(a)) / (24 * 3600 * 1000));
        const dom = sold.map(p => p.under_contract_date ? days(p.listing_date, p.under_contract_date) : days(p.listing_date, p.closing_date));
        const ltc = sold.map(p => days(p.listing_date, p.closing_date));
        const priceRatio = sold.filter(p => p.listing_price_usd && p.actual_sale_price_usd).map(p => p.actual_sale_price_usd / p.listing_price_usd);
        const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        return {
          sold_count: sold.length,
          avg_dom: avg(dom),
          avg_listing_to_close: avg(ltc),
          avg_price_to_listing_ratio: avg(priceRatio),
          total_actual_sales: projects.reduce((a, p) => a + (p.actual_sale_price_usd || 0), 0),
        };
      })(),
      total_equity_in: totalEquityCalled > 0 ? totalEquityCalled : totalEquityIn,
      total_equity_out: totalEquityReturned > 0 ? totalEquityReturned : totalEquityOut,
      total_equity_called: totalEquityCalled,
      final_cash_balance: finalCash,
      moic_gross: totalEquityCalled > 0 ? (totalEquityReturned / totalEquityCalled) : (totalEquityIn > 0 ? totalEquityOut / totalEquityIn : 0),
      irr_monthly: portfolioMonthlyIRR,
      irr_annual: portfolioAnnualIRR,
      payback_months: paybackIdx === -1 ? null : paybackIdx + 1,
      debt_to_equity_peak: peakEquityCommitted > 0
        ? port.debt_balance[maxDebtIdx] / peakEquityCommitted
        : 0,
      active_project_count: active.length,
    },
    by_project: projectResults,
  };
}

// ---------- small helpers ----------

function sum(a) { return a.reduce((x, y) => x + y, 0); }
function argmax(a) { let i = 0, m = a[0]; for (let k = 1; k < a.length; k++) if (a[k] > m) { m = a[k]; i = k; } return i; }
function cumulative(a) { const o = new Array(a.length); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; o[i] = s; } return o; }
function findPaybackIdx(drawn, returned) {
  for (let i = 0; i < drawn.length; i++) if (returned[i] >= drawn[i] && drawn[i] > 0) return i;
  return -1;
}

// ---------- Monte Carlo simulation ----------

// Box-Muller transform: returns a standard normal random variable
function randNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Sample from a triangular distribution defined by [min, mode, max]
function randTriangular(min, mode, max) {
  const u = Math.random();
  const f = (mode - min) / (max - min);
  if (u < f) return min + Math.sqrt(u * (max - min) * (mode - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

function percentile(sortedArr, p) {
  if (!sortedArr.length) return null;
  const idx = (sortedArr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

// Run N Monte Carlo trials. For each trial, sample each driver from its distribution,
// run aggregatePortfolio, collect outcome metrics.
// distributions: { build_cost_multiplier: {type:"triangular", min, mode, max}, ... }
export function monteCarlo(projects, globals, scenario, distributions, trials = 1000, seed = null) {
  // Optional deterministic seed: if seed given, replace Math.random with seeded version
  let rng = Math.random;
  if (seed != null) {
    let state = seed >>> 0;
    rng = function() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
    Math.random = rng;
  }
  const outcomes = {
    profit_pre_tax: [],
    profit_after_tax: [],
    peak_equity: [],
    max_debt: [],
    moic: [],
    irr_annual: [],
    yield_on_cost: [],
  };
  for (let i = 0; i < trials; i++) {
    const trialScenario = { ...scenario };
    for (const [key, dist] of Object.entries(distributions || {})) {
      let v = trialScenario[key] ?? 0;
      if (dist.type === "triangular") {
        v = randTriangular(dist.min, dist.mode, dist.max);
      } else if (dist.type === "normal") {
        v = (dist.mean ?? 0) + (dist.stddev ?? 1) * randNormal();
      } else if (dist.type === "uniform") {
        v = dist.min + Math.random() * (dist.max - dist.min);
      }
      trialScenario[key] = v;
    }
    const r = aggregatePortfolio(projects, globals, trialScenario);
    outcomes.profit_pre_tax.push(r.kpis.total_profit_before_tax);
    outcomes.profit_after_tax.push(r.kpis.total_profit_after_tax ?? r.kpis.total_profit_before_tax);
    outcomes.peak_equity.push(r.kpis.peak_equity_required);
    outcomes.max_debt.push(r.kpis.max_debt_outstanding);
    outcomes.moic.push(r.kpis.moic_gross);
    outcomes.irr_annual.push(r.kpis.irr_annual ?? 0);
    outcomes.yield_on_cost.push(r.kpis.portfolio_yield_on_cost);
  }
  // Restore Math.random if we replaced it
  if (seed != null) Math.random = rng; // no-op restore; user can refresh
  const summary = {};
  for (const [key, values] of Object.entries(outcomes)) {
    const sorted = values.slice().sort((a, b) => a - b);
    summary[key] = {
      values,
      sorted,
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      p10: percentile(sorted, 0.10),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.50),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.90),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      // Probability of negative profit / IRR below threshold
      prob_loss: key.startsWith("profit") ? values.filter(v => v < 0).length / values.length : null,
    };
  }
  return { trials, distributions, summary };
}

// ---------- IRR ----------

// Monthly IRR for an equity cash flow series.
// Returns the periodic (monthly) rate that makes NPV = 0.
// Annualized = (1 + monthlyIRR)^12 - 1.
// Equity cash flow convention: negative = equity contributed (outflow); positive = distribution (inflow).
// Monthly IRR via bisection.
// Returns null (rather than nonsense) when:
//   - the series has no sign change
//   - the total magnitude is below floor (~$1k) so IRR is meaningless
//   - bisection terminates at the bracket edges (didn't converge to a real root)
//   - the resulting annualized rate would exceed ±300% (clearly a numerical artifact, not a real IRR)
export function monthlyIRR(equityCashFlows, opts = {}) {
  const { maxIter = 200, tol = 1e-9, lo = -0.99, hi = 1.0, minMagnitude = 1000 } = opts;
  if (!Array.isArray(equityCashFlows) || equityCashFlows.length < 2) return null;
  const positives = equityCashFlows.filter(cf => cf > 0).reduce((a, b) => a + b, 0);
  const negatives = equityCashFlows.filter(cf => cf < 0).reduce((a, b) => a + b, 0);
  if (positives <= minMagnitude || -negatives <= minMagnitude) return null;
  if (equityCashFlows.every(cf => cf >= 0) || equityCashFlows.every(cf => cf <= 0)) return null;

  const npv = (r) => equityCashFlows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + r, i), 0);
  let a = lo, b = hi, fa = npv(a), fb = npv(b);
  if (fa * fb > 0) {
    let found = false;
    for (const r of [-0.5, -0.1, 0, 0.05, 0.2, 0.5, 0.8]) {
      const f = npv(r);
      if (f * fa < 0) { b = r; fb = f; found = true; break; }
      if (f * fb < 0) { a = r; fa = f; found = true; break; }
    }
    if (!found) return null;
  }
  let mid = (a + b) / 2;
  for (let i = 0; i < maxIter; i++) {
    mid = (a + b) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < tol || (b - a) < tol) {
      // Reject pathological values near the bracket edges (didn't converge to a real root)
      if (mid <= lo + 1e-6 || mid >= hi - 1e-6) return null;
      return mid;
    }
    if (fa * fm < 0) { b = mid; fb = fm; } else { a = mid; fa = fm; }
  }
  // Did not converge — likely a pathological cash flow shape
  if (mid <= lo + 1e-6 || mid >= hi - 1e-6) return null;
  return mid;
}

export function annualizedIRR(monthlyRate) {
  if (monthlyRate == null || !isFinite(monthlyRate)) return null;
  const annual = Math.pow(1 + monthlyRate, 12) - 1;
  // Sanity clamp: real-world IRRs above 300% annualized are virtually always numerical artifacts
  if (!isFinite(annual) || annual > 3.0 || annual < -0.999) return null;
  return annual;
}

// Build the equity cash flow series for a project (or portfolio) for IRR.
// Convention: equity_drawn is positive (we input it as positive in engine), equity_returned is positive.
// For IRR: equity_drawn -> negative cash flow (capital out); equity_returned -> positive (return).
export function equityCashFlowSeries(monthly) {
  const N = monthly.equity_drawn.length;
  const cf = new Array(N);
  for (let i = 0; i < N; i++) cf[i] = -monthly.equity_drawn[i] + monthly.equity_returned[i];
  return cf;
}

// Excel-style equity cash flow using cumulative-called as inflow, closing-cash final as outflow.
// Treats the equity stack as: investor calls (negative) until peak, then distributions (positive).
export function equityCashFlowFromCalls(monthly) {
  const N = monthly.equity_called.length;
  const cf = new Array(N);
  let cumCalled = 0;
  for (let i = 0; i < N; i++) {
    cf[i] = -monthly.equity_called[i];
    cumCalled += monthly.equity_called[i];
  }
  // Distribution at last month = final cash balance (assumes full liquidation at horizon end)
  if (N > 0) cf[N - 1] += Math.max(0, monthly.closing_cash[N - 1]);
  return cf;
}

// Distribution waterfall for a single investor's cash flow series.
// Full European-style 5-tier waterfall:
//   1. Return of capital
//   2. Preferred return
//   3a. GP catch-up (100% to sponsor until sponsor has carry % of cumulative pref+catch-up)
//   3b. To-hurdle (between hurdle and where carry kicks in — all to investor)
//   4. Carry split (carry to sponsor, 1-carry to investor)
export function distributionWaterfall(investorCF, investor) {
  const N = investorCF.length;
  const equityIn = investorCF.reduce((a, b) => a + (b < 0 ? -b : 0), 0);
  const grossDistribution = investorCF.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  let firstCall = -1, lastDist = -1;
  for (let i = 0; i < N; i++) {
    if (investorCF[i] < 0 && firstCall < 0) firstCall = i;
    if (investorCF[i] > 0) lastDist = i;
  }
  const holdMonths = (lastDist >= 0 && firstCall >= 0) ? Math.max(1, lastDist - firstCall) : 12;
  const holdYears = holdMonths / 12;

  const pref = investor.preferred_return_pct ?? 0;
  const hurdle = investor.hurdle_pct ?? 0;
  const carry = investor.carry_pct ?? 0.20;

  const prefThreshold = equityIn * (Math.pow(1 + pref, holdYears) - 1);
  const hurdleThreshold = equityIn * (Math.pow(1 + hurdle, holdYears) - 1);
  // GP catch-up amount: sized so that after Tier 2 (pref to LP) + Tier 3a (catch-up to GP),
  // GP has received carry % of the total distributed above return-of-capital.
  // catch_up = pref × carry / (1 - carry), valid when carry < 1
  const gpCatchUp = carry < 1 ? prefThreshold * (carry / (1 - carry)) : 0;
  const postCatchUpToHurdle = Math.max(0, hurdleThreshold - prefThreshold - gpCatchUp);

  let remaining = grossDistribution;
  const tier1 = Math.min(remaining, equityIn);
  remaining -= tier1;
  const tier2 = Math.min(remaining, prefThreshold);
  remaining -= tier2;
  const tier3a_gp_catchup = Math.min(remaining, gpCatchUp);
  remaining -= tier3a_gp_catchup;
  const tier3b_to_hurdle = Math.min(remaining, postCatchUpToHurdle);
  remaining -= tier3b_to_hurdle;
  const tier4_above_hurdle = remaining;
  const tier4_to_investor = tier4_above_hurdle * (1 - carry);
  const tier4_to_sponsor = tier4_above_hurdle * carry;

  // Total to investor / sponsor (excluding sponsor's own pro-rata distribution)
  const total_to_investor = tier1 + tier2 + tier3b_to_hurdle + tier4_to_investor;
  const total_to_sponsor_from_lp = tier3a_gp_catchup + tier4_to_sponsor;

  return {
    holdYears,
    holdMonths,
    equityIn,
    grossDistribution,
    pref_threshold_usd: prefThreshold,
    hurdle_threshold_usd: hurdleThreshold,
    gp_catchup_target_usd: gpCatchUp,
    tier1_return_of_capital: tier1,
    tier2_pref_return: tier2,
    tier3a_gp_catchup,
    tier3b_to_hurdle,
    tier4_above_hurdle,
    tier4_to_investor,
    tier4_to_sponsor,
    net_to_investor: total_to_investor,
    promote_to_sponsor: total_to_sponsor_from_lp,
    // Legacy alias for v8 backwards compatibility
    tier3_to_hurdle: tier3b_to_hurdle,
  };
}

// Per-investor waterfall analysis.
// For each investor, computes their share of the portfolio cash flow, IRR, MOIC, pref/hurdle clearance,
// and full 4-tier distribution split. Sponsor receives promote from each non-sponsor LP's above-hurdle profit.
export function computeWaterfall(monthly, investors, globals = {}) {
  if (!investors || !investors.length) return [];
  const portCF = equityCashFlowFromCalls(monthly);
  // First pass: per-investor stats + their own tier breakdown
  const base = investors.map(inv => {
    const share = inv.equity_share_pct || 0;
    const cf = portCF.map(v => v * share);
    const inFlow = cf.reduce((a, b) => a + (b < 0 ? -b : 0), 0);
    const outFlow = cf.reduce((a, b) => a + (b > 0 ? b : 0), 0);
    const monthlyRate = monthlyIRR(cf);
    const annualRate = annualizedIRR(monthlyRate);
    const tier = distributionWaterfall(cf, inv);
    // Per-investor effective tax rate. If undefined, falls back to portfolio (federal + state).
    const portfolioTaxRate = ((globals?.tax_rate_pct ?? 0) + (globals?.tax_state_rate_pct ?? 0));
    const invTaxRate = inv.tax_rate_pct ?? portfolioTaxRate;
    return { inv, cf, share, inFlow, outFlow, monthlyRate, annualRate, tier, invTaxRate };
  });
  // Sum promote pool from each non-sponsor LP (catch-up + carry tier)
  const sponsorPromote = base.filter(x => !x.inv.is_sponsor)
    .reduce((a, x) => a + (x.tier.tier3a_gp_catchup || 0) + (x.tier.tier4_to_sponsor || 0), 0);
  return base.map(x => {
    const { inv, share, inFlow, outFlow, monthlyRate, annualRate, tier, invTaxRate } = x;
    const isSponsor = !!inv.is_sponsor;
    const netDistribution = isSponsor ? (outFlow + sponsorPromote) : tier.net_to_investor;
    const netGain = netDistribution - inFlow;
    const netMoic = inFlow > 0 ? netDistribution / inFlow : 0;
    // Per-investor tax: applied to net gain (above-cost portion only). Losses give no refund.
    const investorTax = (globals.apply_tax ?? true) ? Math.max(0, netGain) * invTaxRate : 0;
    const afterTaxDistribution = netDistribution - investorTax;
    const afterTaxGain = afterTaxDistribution - inFlow;
    const afterTaxMoic = inFlow > 0 ? afterTaxDistribution / inFlow : 0;
    // After-tax IRR: scale all positive cash flows by (1 - tax rate on gain). Approximation.
    const afterTaxCF = x.cf.map(v => {
      if (v >= 0) {
        // Each distribution is tax-free up to capital, then taxed on gain. Pro-rata simplification.
        const grossRatio = outFlow > 0 ? v / outFlow : 0;
        const taxForThisCF = investorTax * grossRatio;
        return v - taxForThisCF;
      }
      return v;
    });
    const atMonthlyIRR = monthlyIRR(afterTaxCF);
    const atAnnualIRR = annualizedIRR(atMonthlyIRR);
    return {
      id: inv.id,
      name: inv.name,
      share,
      is_sponsor: isSponsor,
      equity_in: inFlow,
      equity_out_gross: outFlow,
      gain_gross: outFlow - inFlow,
      net_distribution: netDistribution,
      net_gain: netGain,
      moic: netMoic,
      moic_gross: inFlow > 0 ? outFlow / inFlow : 0,
      irr_monthly: monthlyRate,
      irr_annual: annualRate,
      tax_rate: invTaxRate,
      tax_paid: investorTax,
      after_tax_distribution: afterTaxDistribution,
      after_tax_gain: afterTaxGain,
      after_tax_moic: afterTaxMoic,
      after_tax_irr_annual: atAnnualIRR,
      preferred_return_pct: inv.preferred_return_pct ?? 0,
      hurdle_pct: inv.hurdle_pct ?? 0,
      carry_pct: inv.carry_pct ?? 0,
      pref_cleared: annualRate != null && annualRate >= (inv.preferred_return_pct ?? 0),
      hurdle_cleared: annualRate != null && annualRate >= (inv.hurdle_pct ?? 0),
      promote_received_from_lps: isSponsor ? sponsorPromote : 0,
      promote_paid_to_sponsor: !isSponsor ? ((tier.tier3a_gp_catchup || 0) + (tier.tier4_to_sponsor || 0)) : 0,
      tiers: tier,
    };
  });
}

// Hypothetical co-investor analysis: what if we brought in an LP at X% equity share?
// Returns side-by-side: current (all KPC) vs scenario (KPC + new LP).
export function hypotheticalLpAnalysis(monthly, globals) {
  const lpShare = globals.hypothetical_lp_share_pct ?? 0;
  if (lpShare <= 0) return null;
  // Build a fictitious investor set with the LP slotted in
  const sponsor = (globals.investors || []).find(i => i.is_sponsor) ?? globals.investors?.[0];
  if (!sponsor) return null;
  const sponsorShare = Math.max(0, 1 - lpShare);
  const altInvestors = [
    { ...sponsor, equity_share_pct: sponsorShare },
    { id: "lp_hypothetical", name: "Hypothetical LP", equity_share_pct: lpShare,
      preferred_return_pct: globals.hypothetical_lp_pref_pct ?? 0.08,
      hurdle_pct: globals.hypothetical_lp_hurdle_pct ?? 0.20,
      carry_pct: globals.hypothetical_lp_carry_pct ?? 0.20,
      is_sponsor: false },
  ];
  return computeWaterfall(monthly, altInvestors, globals);
}
