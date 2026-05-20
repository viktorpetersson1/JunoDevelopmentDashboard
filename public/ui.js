// DOM rendering and event wiring.

import { state, notify, save, updateGlobal, updateScenario,
  toggleProjectExclusion, updateProject, addProject, removeProject,
  setView, setTheme, resetToBaseline,
  saveCurrentScenario, deleteScenario, loadScenario,
  cloneProject, importProjectsFromCSV, reorderProject,
  clearAuditLog, canEdit, isSuperAdmin,
  canSeeFinancials, isRestrictedViewer, hydrateAuthedSession,
  openWizard, closeWizard, discardWizardDraft, setWizardStep,
  updateWizardDraft, submitWizardDraft, setProjectTab,
  duplicateCurrentScenario, classifyScenario, setScenarioLock,
  openSettingsDrawer, closeSettingsDrawer, setSettingsDrawerTab,
  restoreCapTable } from "./state.js";
import { aggregatePortfolio, calcProject, fyOf, monteCarlo, evaluateRisks, generateNudges } from "./engine.js";
import { EXCEL_BENCHMARK, LIFECYCLE_STAGES, STAGE_GROUP_COLORS, ASSET_TYPES, SCENARIO_CLASSES, PROJECT_TEMPLATES } from "./data.js";
import {
  signIn, signUp, signOut, sendPasswordReset, getCurrentUser,
  fetchAllProfiles, updateUserRole,
  askAssistant, fetchPendingSuggestions, reviewSuggestion, fetchMyLlmQuota,
} from "./supabase.js";

// ---------- formatting helpers ----------

const fmt = {
  usd: (n) => n == null || isNaN(n) ? "—" : (n < 0 ? `($${Math.round(-n).toLocaleString()})` : `$${Math.round(n).toLocaleString()}`),
  usdM: (n) => {
    if (n == null || isNaN(n)) return "—";
    const abs = Math.abs(n);
    const v = abs >= 1e6 ? `$${(abs/1e6).toFixed(1)}M` : abs >= 1e3 ? `$${(abs/1e3).toFixed(0)}k` : `$${Math.round(abs)}`;
    return n < 0 ? `(${v})` : v;
  },
  usdSigned: (n) => n == null || isNaN(n) ? "—" : (n < 0 ? `($${Math.round(-n).toLocaleString()})` : Math.round(n).toLocaleString()),
  pct: (n, d=1) => n == null || isNaN(n) ? "—" : `${(n*100).toFixed(d)}%`,
  num: (n, d=0) => n == null || isNaN(n) ? "—" : Number(n).toLocaleString(undefined, {maximumFractionDigits: d}),
  ym: (ym) => ym || "—",
  ymShort: (ym) => { if (!ym) return "—"; const [y,m]=ym.split("-"); return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m,10)-1]} ${y.slice(2)}`; },
  months: (n) => n == null ? "—" : `${n} mo`,
};

// ---------- chart instances cache ----------

const charts = {};
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// v14.20 (design reset Phase 6) — Ramp-calibrated Chart.js theming.
// Pulls colors from the design tokens at render time so dark/light theme
// switches don't need a page reload. Charts default to:
//   - No vertical grid lines
//   - Horizontal grid lines only, faint
//   - No axis border
//   - Monospaced tick labels in the foreground-tertiary colour
//   - Legend bottom-aligned, light
function chartTokens() {
  const css = getComputedStyle(document.documentElement);
  const t = (n) => css.getPropertyValue(n).trim();
  return {
    text:       t("--text-secondary") || "#6B6B68",
    textMuted:  t("--text-tertiary")  || "#9B9A93",
    grid:       t("--border-subtle")  || "#E5E4DF",
    palette: [
      t("--chart-1") || "#0A0A0A",
      t("--chart-2") || "#9CA8E5",
      t("--chart-3") || "#4A8047",
      t("--chart-4") || "#E58940",
      t("--chart-5") || "#C97FA9",
      t("--chart-6") || "#8C7C6E",
    ],
  };
}
function rampChartOptions(opts = {}) {
  const tk = chartTokens();
  const { stacked = false, yIsCurrency = true, indexAxis = "x" } = opts;
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis,
    interaction: { intersect: false, mode: "index" },
    scales: {
      x: {
        stacked,
        grid: { display: false, drawBorder: false },
        ticks: { color: tk.textMuted, font: { size: 11 }, autoSkip: true, maxTicksLimit: 12 },
        border: { display: false },
      },
      y: {
        stacked,
        grid: { color: tk.grid, drawBorder: false, drawTicks: false },
        ticks: {
          color: tk.textMuted, font: { size: 11 }, padding: 8,
          callback: yIsCurrency ? (v) => "$" + (Math.abs(v) >= 1e6 ? (v/1e6).toFixed(1) + "M" : v >= 1e3 ? (v/1e3).toFixed(0) + "k" : Math.round(v)) : undefined,
        },
        border: { display: false },
      },
    },
    plugins: {
      legend: {
        position: "bottom",
        align: "start",
        labels: {
          color: tk.text,
          font: { size: 11 },
          usePointStyle: true,
          pointStyle: "circle",
          boxWidth: 8,
          boxHeight: 8,
          padding: 14,
          // Custom generator so the legend dot is always a SOLID filled circle.
          // Without this, line-chart datasets render hollow rings because their
          // backgroundColor is a transparent gradient — Chart.js's default
          // generator uses backgroundColor for fillStyle, which produces the
          // empty look. We force fillStyle = borderColor (or backgroundColor
          // when no border exists, e.g. on bar datasets) and zero the stroke.
          generateLabels: (chart) => {
            const datasets = chart.data.datasets || [];
            return datasets.map((ds, i) => {
              const solid = ds.borderColor || ds.backgroundColor || "#0A0A0A";
              return {
                text: ds.label,
                fillStyle: typeof solid === "string" ? solid : "#0A0A0A",
                strokeStyle: typeof solid === "string" ? solid : "#0A0A0A",
                lineWidth: 0,
                lineDash: ds.borderDash || [],
                pointStyle: "circle",
                hidden: !chart.isDatasetVisible(i),
                datasetIndex: i,
              };
            });
          },
        },
      },
      tooltip: {
        backgroundColor: "#0A0A0A",
        titleColor: "#FFFFFF",
        bodyColor: "#FFFFFF",
        borderColor: "transparent",
        padding: 10,
        cornerRadius: 6,
        titleFont: { size: 12, weight: "500" },
        bodyFont: { size: 12 },
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatTooltip(indexAxis === "y" ? ctx.parsed.x : ctx.parsed.y)}` },
      },
    },
  };
}

// v12.1 — stage badge helper
function stageBadge(project, excluded = false) {
  if (excluded) return `<span class="badge excluded">excluded</span>`;
  const stageId = project.stage || "sourcing";
  const stages = LIFECYCLE_STAGES;
  const stage = stages.find(s => s.id === stageId) || stages[0];
  const color = STAGE_GROUP_COLORS[stage.group] || "#7a7a73";
  return `<span class="badge" style="background:${color}22;color:${color};border:1px solid ${color}55;" title="${stage.description}">${stage.label}</span>`;
}

// ---------- root render ----------

const root = () => document.getElementById("app-root");

export function render() {
  document.documentElement.dataset.theme = state.ui.theme;
  // v13 — tint the chrome when scenario is not Base so an exec can't miss it
  // v14.20 (design reset) — Scenario state lives in the scenario picker chip
  // (per design.md §5.1). The body.scenario-active class that used to tint the
  // topbar amber is removed; ensure stale state is cleared on every render.
  document.body.classList.remove("scenario-active");

  // Auth gate: while auth is loading, show a quiet splash with an escape hatch.
  // The "Reset" link clears localStorage + Supabase auth cache and reloads —
  // useful if a stale session is hanging the bootstrap.
  if (state.auth.loading) {
    root().innerHTML = `<div class="auth-splash">
      <div class="auth-card">
        <div class="brand">Juno <span>Atlas</span></div>
        <div class="muted" style="margin-top:14px;display:flex;align-items:center;">
          <span>Loading</span>
          <span class="loading-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>
        </div>
        <div style="margin-top:20px;font-size:11px;">
          <button class="link-btn" id="splash-reset">Stuck? Reset and reload</button>
        </div>
      </div>
    </div>`;
    document.getElementById("splash-reset")?.addEventListener("click", () => {
      try { localStorage.clear(); } catch { /* ignore */ }
      location.reload();
    });
    return;
  }
  // Not signed in: show the login screen
  if (!state.auth.user) {
    renderAuthScreen();
    return;
  }
  // Signed in: full app
  const result = aggregatePortfolio(state.projects, state.globals, state.scenario);
  const topbar = renderTopbar();
  const main = renderView(result);
  const footer = renderFooter();
  const wizard = renderWizardOverlay();

  // Preserve focus + selection across the innerHTML wipe. Without this,
  // every render destroys the input the user is typing in, so tabbing between
  // fields or rapid editing loses focus + caret position every keystroke.
  // The render below blows the entire DOM away; we capture a fingerprint of
  // the active element before, and re-focus the matching element after.
  const focusSnap = captureFocus();

  root().innerHTML = topbar + main + footer + wizard;
  attachTopbarEvents();
  attachViewEvents(result);
  renderCharts(result);
  if (state.ui.wizard.open) attachWizardEvents();
  // If the assistant was open before this re-render, re-mount it
  if (document.body.classList.contains("assistant-open")) {
    renderAssistantPanel();
  }

  restoreFocus(focusSnap);
}

// Snapshot the currently-focused element by identity (id or ALL data-* attrs)
// plus caret position, so the matching element in the freshly-rendered DOM
// can take focus back. Returns null when nothing useful is focused.
//
// Important: many inputs in repeated rows (markets, investors, takeoff lines)
// share an outer data-key like data-market="0" but differ on data-field. We
// must compound ALL data-* attributes into the selector — picking just one
// would match a sibling input in the same row, sending focus to the wrong field.
function captureFocus() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const tag = el.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") return null;
  let sel = null;
  if (el.id) sel = `#${CSS.escape(el.id)}`;
  else {
    const parts = [];
    for (const attr of el.attributes) {
      if (attr.name.startsWith("data-")) parts.push(`[${attr.name}="${CSS.escape(attr.value)}"]`);
    }
    if (parts.length) sel = tag.toLowerCase() + parts.join("");
  }
  if (!sel) return null;
  const snap = { selector: sel, tag };
  // Caret/selection for text-y inputs (number inputs throw on selectionStart in some browsers)
  if ((tag === "INPUT" && /^(text|search|url|tel|email|password)$/.test(el.type)) || tag === "TEXTAREA") {
    try { snap.selStart = el.selectionStart; snap.selEnd = el.selectionEnd; } catch { /* ignore */ }
  }
  // For inputs with deferred commit (typed but not yet blurred), capture the
  // current value so we can restore it across the render — otherwise the
  // newly-rendered input shows the stale state value and the user's typed
  // characters appear to vanish.
  if (tag === "INPUT" || tag === "TEXTAREA") snap.value = el.value;
  return snap;
}

function restoreFocus(snap) {
  if (!snap) return;
  const el = document.querySelector(snap.selector);
  if (!el || el.tagName !== snap.tag) return;
  try {
    // Restore uncommitted typed value before focusing, so the user doesn't
    // see their characters flash to the stale state value.
    if (snap.value != null && el.value !== snap.value && (snap.tag === "INPUT" || snap.tag === "TEXTAREA")) {
      el.value = snap.value;
    }
    el.focus({ preventScroll: true });
    if (snap.selStart != null && typeof el.setSelectionRange === "function") {
      el.setSelectionRange(snap.selStart, snap.selEnd);
    } else if (snap.tag === "INPUT" && el.type === "number") {
      // Number inputs throw on setSelectionRange/selectionStart, so we couldn't
      // capture a caret position. After el.focus() the caret defaults to the
      // left (position 0) which is annoying for editing. Force it to the end
      // by briefly switching type to text, setting the range, then switching
      // back. Visually instant; no value change.
      const v = el.value;
      el.type = "text";
      el.setSelectionRange(v.length, v.length);
      el.type = "number";
    }
  } catch { /* ignore */ }
}

function renderAuthScreen() {
  const mode = window.__authMode || "signin";
  const isSignin = mode === "signin";
  const isReset = mode === "reset";
  root().innerHTML = `
    <div class="auth-splash">
      <div class="auth-card">
        <div class="brand">Juno <span>Atlas</span></div>
        <h2 style="margin:16px 0 6px;font-size:18px;">${isReset ? "Reset password" : isSignin ? "Sign in" : "Create account"}</h2>
        <div class="muted" style="margin-bottom:16px;font-size:12px;">${
          isReset ? "We'll send you a reset link." :
          isSignin ? "Use your email + password." :
          "First user to sign up becomes super-admin. Others start as viewer."}</div>
        <form id="auth-form" class="form-grid">
          ${!isReset ? `<div class="form-row full"><label>Email</label><input class="input" type="email" id="auth-email" autocomplete="email" required></div>` : `<div class="form-row full"><label>Email</label><input class="input" type="email" id="auth-email" autocomplete="email" required></div>`}
          ${!isReset ? `<div class="form-row full"><label>Password</label><input class="input" type="password" id="auth-password" autocomplete="${isSignin ? "current-password" : "new-password"}" required minlength="8"></div>` : ""}
          ${!isSignin && !isReset ? `<div class="form-row full"><label>Display name</label><input class="input" type="text" id="auth-display-name" placeholder="How you appear to others"></div>` : ""}
          <div class="form-row full">
            <button class="btn" type="submit" style="width:100%;">${isReset ? "Send reset link" : isSignin ? "Sign in" : "Create account"}</button>
          </div>
        </form>
        <div id="auth-message" class="note" style="display:none;margin-top:12px;"></div>
        <div class="row between" style="margin-top:16px;font-size:12px;">
          ${isSignin
            ? `<button class="link-btn" data-auth-switch="signup">Need an account?</button><button class="link-btn" data-auth-switch="reset">Forgot password?</button>`
            : isReset
              ? `<button class="link-btn" data-auth-switch="signin">Back to sign in</button>`
              : `<button class="link-btn" data-auth-switch="signin">Already have an account? Sign in</button>`}
        </div>
      </div>
    </div>
  `;
  // Wire form
  const form = document.getElementById("auth-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password")?.value;
    const displayName = document.getElementById("auth-display-name")?.value;
    const msg = document.getElementById("auth-message");
    msg.style.display = "block";
    msg.classList.remove("neg", "warn");
    msg.innerText = "Working…";
    try {
      if (isReset) {
        await sendPasswordReset(email);
        msg.classList.add("warn");
        msg.innerText = `Reset link sent to ${email}. Check your inbox.`;
      } else if (isSignin) {
        const { user } = await signIn(email, password);
        msg.innerText = "Signed in.";
        // Belt-and-suspenders — manually hydrate state in case the
        // onAuthStateChange listener didn't catch this SIGNED_IN event.
        const u = user || (await getCurrentUser());
        if (u) hydrateAuthedSession(u);
      } else {
        await signUp(email, password, displayName);
        msg.classList.add("warn");
        msg.innerText = `Account created. Check your email to confirm, then come back and sign in.`;
        window.__authMode = "signin";
        setTimeout(() => render(), 1500);
      }
    } catch (err) {
      msg.classList.add("neg");
      msg.innerText = err?.message || String(err);
    }
  });
  for (const btn of document.querySelectorAll("[data-auth-switch]")) {
    btn.addEventListener("click", () => {
      window.__authMode = btn.dataset.authSwitch;
      render();
    });
  }
}

// ---------- topbar ----------

// Phase 0 — exec-team IA. 6 top-level sections; legacy views surface as sub-nav children.
// `fin` (canSeeFinancials) gates Forecast / Capital / Risks at the section level.
// Later phases will fold sub-views into the parent screens and retire the sub-nav strip.
const NAV_SECTIONS = [
  { key: "portfolio", label: "Portfolio", default: "portfolio", financial: false,
    subviews: [] },
  { key: "projects",  label: "Projects",  default: "projects",  financial: false,
    subviews: [
      { view: "projects",       label: "All projects" },
      { view: "project_detail", label: "Project detail" },
      { view: "pipeline",       label: "Pipeline" },
    ] },
  { key: "forecast",  label: "Forecast",  default: "cashflow",  financial: true,
    subviews: [
      { view: "cashflow", label: "Cash flow" },
      { view: "scenario", label: "Scenarios" },
    ] },
  { key: "capital",   label: "Capital",   default: "capital_overview", financial: true,
    subviews: [
      { view: "capital_overview", label: "Capital overview" },
      { view: "waterfall",        label: "Owner waterfall" },
    ] },
  { key: "risks",     label: "Risks",     default: "risks_center", financial: true,
    subviews: [
      { view: "risks_center", label: "Risks center" },
      { view: "risk",         label: "Stress test" },
      { view: "sensitivity",  label: "Sensitivity" },
    ] },
  { key: "settings",  label: "Settings",  default: "settings",  financial: false,
    subviews: [
      { view: "settings",    label: "General",     gate: "fin"  },
      { view: "activity",    label: "History",     gate: null   },
      { view: "suggestions", label: "Suggestions", gate: "edit" },
      { view: "users",       label: "Users",       gate: "owner"},
    ] },
];

function sectionForView(view) {
  for (const s of NAV_SECTIONS) {
    if (s.default === view) return s;
    if (s.subviews.some(sv => sv.view === view)) return s;
  }
  return NAV_SECTIONS[0];
}

function renderTopbar() {
  // v14.20 (design reset Phase 4) — Top nav restructured into 4 groups:
  // brand · primary nav · scenario chip · avatar dropdown.
  // Sync badge, role, theme toggle, sign-out are all collapsed into the
  // avatar dropdown to reduce visual noise (Ramp pattern).
  const sync = state.sync.status;
  const syncLabel = {
    idle: "All saved",
    loading: "Loading…",
    pending: "Unsaved changes",
    saving: "Saving…",
    saved: `Saved${state.sync.last_saved_at ? ` ${state.sync.last_saved_at.toLocaleTimeString()}` : ""}`,
    conflict: "Reloading (another editor saved)",
    error: `Save error: ${state.sync.last_error || ""}`,
    offline: "Offline — changes cached locally",
  }[sync] || "";
  const syncSeverity = ["pending", "saving", "conflict"].includes(sync) ? "warn"
    : ["error", "offline"].includes(sync) ? "neg"
    : sync === "saved" ? "pos" : "muted";

  const role = state.auth.profile?.role || "viewer";
  const roleLabel = { super_admin: "Owner", editor: "Editor", viewer: "Viewer", viewer_basic: "Basic viewer" }[role] || role;
  const userEmail = state.auth.user?.email || "";
  const userDisplay = state.auth.profile?.display_name || userEmail.split("@")[0];
  const initials = (userDisplay || userEmail || "?").split(/[\s@.\-_]+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join("") || "?";

  const fin = canSeeFinancials();
  const currentSection = sectionForView(state.ui.view);
  const sectionBtn = (s) => {
    if (s.financial && !fin) return "";
    // v14.21 — Settings lives in the avatar dropdown now, not the top nav.
    if (s.key === "settings") return "";
    const label = s.key === "portfolio" && !fin ? "Overview" : s.label;
    return `<button data-section="${s.key}" class="${currentSection.key === s.key ? "active" : ""}">${label}</button>`;
  };

  // v14.21 — Settings drawer menu items (filtered by role gates so users
  // only see settings sections they can actually access).
  const owner = isSuperAdmin();
  const editor = canEdit();
  const settingsItems = [
    { tab: "settings",    label: "General",     show: fin },
    { tab: "activity",    label: "History",     show: true },
    { tab: "suggestions", label: "Suggestions", show: editor },
    { tab: "users",       label: "Users",       show: owner },
  ].filter(i => i.show);

  const scenarioLocked = state.scenario.locked_by_id != null;
  const scenarioChip = fin ? `
    <button class="scenario-chip" id="scenario-chip-btn" title="Switch scenario or open scenario manager">
      <span class="scenario-chip-label">Scenario</span>
      <span class="scenario-chip-name">${escapeHtml(state.scenario.name)}</span>
      ${scenarioLocked ? `<span class="scenario-chip-lock" title="Locked as canonical decision">🔒</span>` : ""}
      <span style="font-size:10px;color:var(--text-tertiary);">▾</span>
    </button>` : "";

  const menuOpen = !!state.ui.avatarMenuOpen;
  const avatarMenu = `
    <div class="avatar-menu${menuOpen ? " open" : ""}" id="avatar-menu" role="menu" aria-label="User menu">
      <div class="menu-user">
        <div class="menu-user-email">${escapeHtml(userDisplay)}</div>
        <div class="menu-user-role">${roleLabel} · ${escapeHtml(userEmail)}</div>
      </div>
      <button class="menu-item" role="menuitem" id="menu-sync-info" disabled style="cursor:default;color:var(--text-secondary);">
        <span class="dot dot-${syncSeverity}" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${syncSeverity === "pos" ? "var(--positive-500)" : syncSeverity === "warn" ? "var(--warning-500)" : syncSeverity === "neg" ? "var(--negative-500)" : "var(--text-tertiary)"};margin-right:8px;vertical-align:middle;"></span>${escapeHtml(syncLabel)}
      </button>
      ${settingsItems.length ? `
      <div class="menu-divider"></div>
      <div class="menu-section-label">Settings</div>
      ${settingsItems.map(i => `<button class="menu-item" role="menuitem" data-settings-tab="${i.tab}">${i.label}</button>`).join("")}
      ` : ""}
      <div class="menu-divider"></div>
      <button class="menu-item" role="menuitem" id="menu-theme-toggle">${state.ui.theme === "light" ? "Switch to dark theme" : "Switch to light theme"}</button>
      <div class="menu-divider"></div>
      <button class="menu-item" role="menuitem" id="menu-sign-out" style="color:var(--negative-500);">Sign out</button>
    </div>`;

  return `
  <header class="topbar">
    <div class="brand">Juno <span>Atlas</span></div>
    <nav>
      ${NAV_SECTIONS.map(sectionBtn).join("")}
    </nav>
    <div class="spacer"></div>
    <div class="actions" style="position:relative;">
      ${scenarioChip}
      <button class="avatar-group" id="avatar-btn" aria-haspopup="menu" aria-expanded="${menuOpen}" title="${escapeHtml(userEmail)}">
        <span class="avatar-circle">${initials}</span>
        <span class="avatar-caret" aria-hidden="true">▾</span>
      </button>
      ${avatarMenu}
    </div>
  </header>
  ${renderSubnav(currentSection, fin)}
  ${renderSettingsDrawer()}
  <button id="assistant-launcher" class="assistant-launcher" title="Ask Juno — your AI assistant">
    ${JUNO_AI_ICON}<span>Ask Juno</span>
  </button>
  <div id="assistant-panel" class="assistant-panel" style="display:none;"></div>
  ${renderBottomTabNav()}
  `;
}

// v14.21 — Half-pane Settings drawer. Opens from the right at ~50% width.
// Internal tabs route between General / History / Suggestions / Users,
// reusing the same render functions as the legacy full-page views.
function renderSettingsDrawer() {
  const drawer = state.ui.settingsDrawer || { open: false, tab: "settings" };
  if (!drawer.open) return "";
  const fin = canSeeFinancials();
  const owner = isSuperAdmin();
  const editor = canEdit();
  const tabs = [
    { tab: "settings",    label: "General",     show: fin },
    { tab: "activity",    label: "History",     show: true },
    { tab: "suggestions", label: "Suggestions", show: editor },
    { tab: "users",       label: "Users",       show: owner },
  ].filter(i => i.show);
  // Pick a safe tab if current selection is now hidden by role change
  let activeTab = drawer.tab;
  if (!tabs.some(t => t.tab === activeTab)) activeTab = tabs[0]?.tab || "activity";

  // Reuse existing view renderers — they return panel-wrapped HTML.
  let body = "";
  switch (activeTab) {
    case "settings":    body = renderSettings(); break;
    case "activity":    body = renderActivity(); break;
    case "suggestions": body = renderSuggestions(); break;
    case "users":       body = renderUsers(); break;
    default:            body = `<div class="note">Unknown settings tab.</div>`;
  }

  return `
    <div class="settings-drawer-backdrop" id="settings-drawer-backdrop"></div>
    <aside class="settings-drawer" role="dialog" aria-label="Settings" aria-modal="true">
      <header class="settings-drawer-header">
        <h2>Settings</h2>
        <button class="btn ghost small" id="settings-drawer-close" aria-label="Close settings">Close ✕</button>
      </header>
      <nav class="settings-drawer-tabs" role="tablist">
        ${tabs.map(t => `<button role="tab" data-settings-tab="${t.tab}" class="${activeTab === t.tab ? "active" : ""}">${t.label}</button>`).join("")}
      </nav>
      <div class="settings-drawer-body" role="tabpanel">
        ${body}
      </div>
    </aside>
  `;
}

function renderSubnav(section, fin) {
  if (!section.subviews.length) return "";
  const owner = isSuperAdmin();
  const editor = canEdit();
  const visible = section.subviews.filter(sv => {
    if (sv.gate === "fin"   && !fin)    return false;
    if (sv.gate === "edit"  && !editor) return false;
    if (sv.gate === "owner" && !owner)  return false;
    return true;
  });
  if (visible.length <= 1) return "";
  return `<div class="subnav">
    ${visible.map(sv =>
      `<button data-view="${sv.view}" class="${state.ui.view === sv.view ? "active" : ""}">${sv.label}</button>`
    ).join("")}
  </div>`;
}

// v13 — bottom-tab nav for mobile (hidden ≥561px via CSS)
function renderBottomTabNav() {
  const fin = canSeeFinancials();
  const v = state.ui.view;
  const items = [
    { key: "portfolio",      label: "Today",    icon: "◐", shown: true },
    { key: "projects",       label: "Projects", icon: "▤", shown: true },
    { key: "cashflow",       label: "Money",    icon: "$", shown: fin },
    { key: "more",           label: "More",     icon: "⋯", shown: true },
  ].filter(i => i.shown).slice(0, 4);
  const moreOpen = state.ui.mobileMoreOpen;
  return `<nav class="bottom-tab-nav">
    ${items.map(i => {
      const active = (i.key === "more" ? moreOpen : v === i.key) ? "active" : "";
      return `<button data-mobile-tab="${i.key}" class="${active}"><span class="bt-icon">${i.icon}</span><span class="bt-label">${i.label}</span></button>`;
    }).join("")}
  </nav>
  ${moreOpen ? `<div class="mobile-more-drawer">
    ${["project_detail","cashflow","pipeline","waterfall","scenario","sensitivity","risk","activity","suggestions","users","settings"].map(k => {
      const label = { project_detail: "Project detail", cashflow: "Cash flow", pipeline: "Pipeline", waterfall: "Waterfall", scenario: "Scenario", sensitivity: "Sensitivity", risk: "Stress test", activity: "History", suggestions: "Suggestions", users: "Users", settings: "Settings" }[k];
      if (k === "users" && !isSuperAdmin()) return "";
      if (k === "suggestions" && !canEdit()) return "";
      if (!fin && ["cashflow","waterfall","scenario","sensitivity","risk","settings"].includes(k)) return "";
      return `<button data-mobile-tab="${k}" class="mobile-more-item">${label}</button>`;
    }).join("")}
  </div>` : ""}
  `;
}

// ---------- Web Worker dispatcher (heavy compute) ----------

let _worker = null;
let _workerJobs = new Map();
function getWorker() {
  if (_worker) return _worker;
  try {
    _worker = new Worker("./worker.js", { type: "module" });
    _worker.addEventListener("message", (e) => {
      const { id, type, result, message, current, total } = e.data;
      const job = _workerJobs.get(id);
      if (!job) return;
      if (type === "progress") {
        job.onProgress?.({ current, total });
      } else if (type === "result") {
        _workerJobs.delete(id);
        job.resolve(result);
      } else if (type === "error") {
        _workerJobs.delete(id);
        job.reject(new Error(message));
      }
    });
    _worker.addEventListener("error", (e) => {
      console.warn("Worker error:", e.message);
    });
  } catch (e) {
    console.warn("Worker init failed (falling back to main thread):", e.message);
    _worker = null;
  }
  return _worker;
}

function runInWorker(jobType, payload, onProgress) {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    if (!w) {
      // Fallback: run synchronously on main thread (will block, but at least work)
      reject(new Error("Worker unavailable"));
      return;
    }
    const id = `${jobType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    _workerJobs.set(id, { resolve, reject, onProgress });
    w.postMessage({ id, type: jobType, ...payload });
  });
}

// Juno AI sparkle — inspired by Claude's mark, recolored to Juno black via currentColor
const JUNO_AI_ICON = `<svg class="juno-ai-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
  <path d="M12 1.5c.55 4.95 1.55 5.95 6.5 6.5-4.95.55-5.95 1.55-6.5 6.5-.55-4.95-1.55-5.95-6.5-6.5 4.95-.55 5.95-1.55 6.5-6.5zM19 14c.25 2.5.95 3.2 3.45 3.45-2.5.25-3.2.95-3.45 3.45-.25-2.5-.95-3.2-3.45-3.45 2.5-.25 3.2-.95 3.45-3.45zM6 16c.2 2 .8 2.6 2.8 2.8-2 .2-2.6.8-2.8 2.8-.2-2-.8-2.6-2.8-2.8 2-.2 2.6-.8 2.8-2.8z"/>
</svg>`;

function attachTopbarEvents() {
  // Top nav: section buttons route to the section's default view
  for (const btn of document.querySelectorAll(".topbar nav button[data-section]")) {
    btn.addEventListener("click", () => {
      const section = NAV_SECTIONS.find(s => s.key === btn.dataset.section);
      if (section) setView(section.default);
    });
  }
  // Sub-nav: direct view buttons
  for (const btn of document.querySelectorAll(".subnav button[data-view]")) {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  }
  // v13 — bottom-tab nav (mobile)
  for (const btn of document.querySelectorAll("[data-mobile-tab]")) {
    btn.addEventListener("click", () => {
      const k = btn.dataset.mobileTab;
      if (k === "more") {
        state.ui.mobileMoreOpen = !state.ui.mobileMoreOpen;
        notify();
      } else {
        state.ui.mobileMoreOpen = false;
        setView(k);
      }
    });
  }
  // v14.20 (design reset Phase 4) — Avatar dropdown menu wiring.
  // Theme toggle and sign-out moved off the topbar into the avatar menu;
  // scenario chip routes to the Scenarios view for management/switching.
  const avatarBtn  = document.getElementById("avatar-btn");
  const avatarMenu = document.getElementById("avatar-menu");
  if (avatarBtn && avatarMenu) {
    avatarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.ui.avatarMenuOpen = !state.ui.avatarMenuOpen;
      notify();
    });
  }
  // Close menu on outside click (one-shot listener — re-installed each render).
  if (state.ui.avatarMenuOpen) {
    const closeOnOutside = (e) => {
      if (!e.target.closest(".avatar-menu") && !e.target.closest("#avatar-btn")) {
        state.ui.avatarMenuOpen = false;
        document.removeEventListener("click", closeOnOutside);
        notify();
      }
    };
    document.addEventListener("click", closeOnOutside);
  }
  document.getElementById("menu-theme-toggle")?.addEventListener("click", () => {
    state.ui.avatarMenuOpen = false;
    setTheme(state.ui.theme === "light" ? "dark" : "light");
  });
  document.getElementById("menu-sign-out")?.addEventListener("click", async () => {
    state.ui.avatarMenuOpen = false;
    if (await confirmAction({ title: "Sign out?", message: "You'll be returned to the sign-in screen.", confirmLabel: "Sign out", danger: true })) {
      await signOut();
    } else {
      notify();
    }
  });
  document.getElementById("scenario-chip-btn")?.addEventListener("click", () => {
    setView("scenario");
  });

  // v14.21 — Settings drawer wiring. The avatar menu has one button per
  // settings sub-tab. Clicking any of them opens the drawer to that tab.
  // The drawer's internal tab bar uses the same data-settings-tab attribute.
  for (const btn of document.querySelectorAll('[data-settings-tab]')) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tab = btn.dataset.settingsTab;
      // Avatar-menu items open the drawer; drawer tabs just switch tab.
      if (state.ui.settingsDrawer.open) {
        setSettingsDrawerTab(tab);
      } else {
        openSettingsDrawer(tab);
      }
    });
  }
  document.getElementById("settings-drawer-close")?.addEventListener("click", () => {
    closeSettingsDrawer();
  });
  document.getElementById("settings-drawer-backdrop")?.addEventListener("click", () => {
    closeSettingsDrawer();
  });
  // Close drawer on Esc
  if (state.ui.settingsDrawer?.open) {
    const onEsc = (e) => {
      if (e.key === "Escape") {
        closeSettingsDrawer();
        document.removeEventListener("keydown", onEsc);
      }
    };
    document.addEventListener("keydown", onEsc);
  }

  // C2 — heatmap is lazy. Wire the "Compute heatmap" button when the Sensitivity view is open.
  document.getElementById("compute-heatmap")?.addEventListener("click", (e) => {
    e.target.disabled = true;
    e.target.innerText = "Starting…";
    // Worker-based, async + non-blocking
    computeAndRenderHeatmap().catch(err => {
      console.warn("Heatmap compute failed:", err);
      e.target.disabled = false;
      e.target.innerText = "Compute heatmap";
    });
  });

  // v12.5 — Ask Juno launcher (toggle docked right sidebar)
  document.getElementById("assistant-launcher")?.addEventListener("click", async () => {
    const panel = document.getElementById("assistant-panel");
    if (!panel) return;
    if (panel.style.display === "none") {
      await refreshAssistantQuota();
      renderAssistantPanel();
      document.body.classList.add("assistant-open");
    } else {
      panel.style.display = "none";
      document.body.classList.remove("assistant-open");
    }
  });
}

// ---------- main view dispatcher ----------

// Views that show financial detail — restricted viewers redirected to overview if they land here
const FINANCIAL_VIEWS = new Set(["cashflow", "waterfall", "scenario", "sensitivity", "risk", "settings"]);

function renderView(result) {
  let html = `<main class="main">`;
  if (isRestrictedViewer()) {
    html += `<div class="readonly-banner" style="border-left-color:var(--info);background:rgba(32,88,168,0.10);">
      You are signed in as <strong>basic viewer</strong>. You can see project information and lifecycle status, but financial detail is hidden. Ask the super-admin to upgrade your role if you need access to budgets, profits, or returns.
    </div>`;
    // Force restricted viewers off any financial view
    if (FINANCIAL_VIEWS.has(state.ui.view)) state.ui.view = "portfolio";
  } else if (!canEdit()) {
    html += `<div class="readonly-banner">
      You are signed in as <strong>viewer</strong>. You can browse all data but cannot edit. Ask the super-admin to upgrade your role if you need to make changes.
    </div>`;
  }
  switch (state.ui.view) {
    case "portfolio": html += isRestrictedViewer() ? renderBasicOverview(result) : renderPortfolio(result); break;
    case "projects": html += renderProjectsList(result); break;
    case "project_detail": html += renderProjectDetail(result); break;
    case "cashflow": html += renderCashflow(result); break;
    case "pipeline": html += renderPipeline(result); break;
    case "capital_overview": html += renderCapitalOverview(result); break;
    case "waterfall": html += renderWaterfall(result); break;
    case "scenario": html += renderScenario(result); break;
    case "sensitivity": html += renderSensitivity(result); break;
    case "risks_center": html += renderRisksCenter(result); break;
    case "risk": html += renderRisk(result); break;
    case "activity": html += renderActivity(); break;
    case "suggestions": html += renderSuggestions(); break;
    case "users": html += renderUsers(); break;
    case "settings": html += renderSettings(); break;
    default: html += `<div class="note neg">Unknown view: ${state.ui.view}</div>`;
  }
  html += `</main>`;
  return html;
}

// v12.2 — restricted-viewer overview. Just project counts by stage, no money.
function renderBasicOverview(r) {
  const stages = LIFECYCLE_STAGES;
  const byStage = {};
  for (const s of stages) byStage[s.id] = [];
  for (const p of state.projects) {
    const stageId = p.stage || "sourcing";
    if (byStage[stageId]) byStage[stageId].push(p);
  }
  const groupCards = {};
  for (const s of stages) {
    if (!groupCards[s.group]) groupCards[s.group] = { count: 0, projects: [], stages: [] };
    groupCards[s.group].count += byStage[s.id].length;
    groupCards[s.group].projects.push(...byStage[s.id]);
    groupCards[s.group].stages.push(s);
  }
  return `
    <div class="section-title">Project pipeline overview · ${state.projects.length} projects</div>
    <div class="kpi-row">
      ${Object.entries(groupCards).map(([group, data]) => `
        <div class="kpi" style="border-left:4px solid ${STAGE_GROUP_COLORS[group] || "#7a7a73"};">
          <div class="label">${group.replace("-", " ").toUpperCase()}</div>
          <div class="value">${data.count}</div>
          <div class="meta">${data.stages.map(s => s.label).join(", ")}</div>
        </div>
      `).join("")}
    </div>
    <div class="panel">
      <h3>Project list</h3>
      <div class="scroll-x"><table class="tbl">
        <thead><tr><th>Project</th><th>Address</th><th>Stage</th><th>Start</th><th>Listing date</th><th>Closing date</th></tr></thead>
        <tbody>${state.projects.map(p => `<tr>
          <td><strong>${p.name}</strong></td>
          <td class="muted">${p.address || "—"}</td>
          <td>${stageBadge(p)}</td>
          <td>${fmt.ymShort(p.start_date)}</td>
          <td>${p.listing_date || "—"}</td>
          <td>${p.closing_date || "—"}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  `;
}

// ---------- Portfolio view ----------

// v14.3 — Portfolio support helpers (Phase 1.3)

// What's the next significant thing for this project? Used in the portfolio table.
function nextMilestone(p, res) {
  if (!p) return { label: "—", date: null };
  const stage = p.stage || "sourcing";
  const computedSale = res?.sale_date;
  switch (stage) {
    case "sold":
    case "archived":         return { label: "Closed",          date: p.closing_date || computedSale };
    case "under_contract":   return { label: "Closing",         date: p.closing_date || computedSale };
    case "pre_sales":        return { label: "Under contract",  date: p.under_contract_date };
    case "construction":     return { label: "Pre-sales / list", date: p.listing_date };
    case "pre_construction": return { label: "Construction",    date: p.start_date };
    case "permitting":       return { label: "Pre-construction", date: null };
    case "design":           return { label: "Permitting",       date: null };
    case "entitlement":      return { label: "Design",           date: null };
    case "land_control":     return { label: "Entitlement",      date: p.start_date };
    case "sourcing":
    default:                 return { label: "Land control",     date: p.start_date };
  }
}

// Returns a short list of risk-flag names that apply to this project right now.
// Shared between the Project Summary risk cards and the Portfolio risk watchlist.
function evaluateProjectRisks(p, res) {
  const k = res?.kpis;
  if (!k) return [];
  const g = state.globals;
  const proRata = 1 / 8;  // per-project share of portfolio tolerance — proxy until Phase 2 LOC modeling
  const flags = [];
  if (k.peak_equity > g.risk_peak_equity_threshold * proRata) flags.push("Peak equity");
  if (k.peak_debt   > g.risk_max_debt_threshold * proRata)    flags.push("Peak debt");
  if (k.irr_annual != null && k.irr_annual < g.risk_min_irr_annual) flags.push("Low IRR");
  if (k.profit_margin_pct < g.risk_min_margin_pct)            flags.push("Low margin");
  if (k.moic != null && k.moic < g.risk_min_moic)             flags.push("Low MOIC");
  return flags;
}

// Compact pipeline-by-stage panel — bar per lifecycle group with count.
function renderPipelineByStage(projects) {
  const counts = {};
  for (const p of projects) {
    const stage = LIFECYCLE_STAGES.find(s => s.id === (p.stage || "sourcing"));
    const group = stage?.group || "pre-deal";
    counts[group] = (counts[group] || 0) + 1;
  }
  const groups = [
    { id: "pre-deal",     label: "Pre-deal" },
    { id: "pre-build",    label: "Pre-build" },
    { id: "build",        label: "Build" },
    { id: "go-to-market", label: "Go-to-market" },
    { id: "closed",       label: "Closed" },
  ];
  const total = projects.length;
  const maxCount = Math.max(1, ...groups.map(g => counts[g.id] || 0));
  return `<div class="panel">
    <h3>Pipeline by stage</h3>
    <div class="panel-subtitle">${total} project${total === 1 ? "" : "s"} across the lifecycle.</div>
    <div class="pipeline-stage-bars">
      ${groups.map(g => {
        const c = counts[g.id] || 0;
        const pct = (c / maxCount) * 100;
        const color = STAGE_GROUP_COLORS[g.id] || "#7a7a73";
        return `<div class="pipeline-stage-row">
          <div class="pipeline-stage-label">${g.label}</div>
          <div class="pipeline-stage-track">
            <div class="pipeline-stage-fill" style="width:${pct}%;background:${color};"></div>
          </div>
          <div class="pipeline-stage-count">${c}</div>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

// Risk watchlist — projects with one or more active risk flags. Click name to open.
function renderRiskWatchlist(by_project) {
  const items = by_project.map(res => {
    const p = state.projects.find(x => x.id === res.project_id);
    const flags = evaluateProjectRisks(p, res);
    return { p, flags };
  }).filter(x => x.p && x.flags.length > 0)
    .sort((a, b) => b.flags.length - a.flags.length);

  if (!items.length) {
    return `<div class="panel">
      <h3>Risk watchlist</h3>
      <div class="muted" style="font-size:12px;">No projects flagged. All within thresholds.</div>
    </div>`;
  }
  return `<div class="panel">
    <h3>Risk watchlist</h3>
    <div class="panel-subtitle">${items.length} project${items.length === 1 ? "" : "s"} with one or more flags. Click a name to open.</div>
    <ul class="risk-watchlist">
      ${items.map(({ p, flags }) => `
        <li>
          <button class="link-btn watchlist-name" data-action="open-project" data-id="${p.id}">${escapeHtml(p.name)}</button>
          <div class="watchlist-flags">${flags.map(f => `<span class="badge excluded">${f}</span>`).join("")}</div>
        </li>
      `).join("")}
    </ul>
  </div>`;
}

// Portfolio table — brief's columns including Next milestone. Lighter than the Projects detail table.
function renderPortfolioTable(by_project) {
  const rows = by_project.map(res => {
    const p = state.projects.find(x => x.id === res.project_id);
    if (!p) return "";
    const excluded = state.scenario.excluded_project_ids.includes(res.project_id);
    const next = nextMilestone(p, res);
    return `<tr>
      <td data-label="Project">
        <button class="link-btn" data-action="open-project" data-id="${p.id}" style="font-weight:600;color:var(--fg);text-decoration:none;">${escapeHtml(p.name)}</button>
        <div class="muted" style="font-size:10.5px;">${escapeHtml(p.address || "")}</div>
      </td>
      <td data-label="Status">${stageBadge(p, excluded)}</td>
      <td data-label="Start">${fmt.ymShort(p.start_date)}</td>
      <td data-label="Sale">${fmt.ymShort(res.sale_date)}</td>
      <td data-label="Peak equity" class="num">${fmt.usdM(res.kpis.peak_equity)}</td>
      <td data-label="Max debt" class="num">${fmt.usdM(res.kpis.peak_debt)}</td>
      <td data-label="Profit" class="num ${res.kpis.gross_profit >= 0 ? "pos" : "neg"}">${fmt.usdM(res.kpis.gross_profit)}</td>
      <td data-label="Margin" class="num">${fmt.pct(res.kpis.profit_margin_pct)}</td>
      <td data-label="Next milestone">
        <div style="font-weight:500;">${next.label}</div>
        ${next.date ? `<div class="muted" style="font-size:10.5px;">${fmt.ymShort(next.date)}</div>` : ""}
      </td>
    </tr>`;
  }).join("");

  return `<div class="panel mb-24">
    <h3>Portfolio</h3>
    <div class="panel-subtitle">Active projects and what comes next. Click a project name to open its workspace.</div>
    <div class="scroll-x"><table class="tbl">
      <thead><tr>
        <th>Project</th><th>Status</th><th>Start</th><th>Sale</th>
        <th>Peak equity</th><th>Max debt</th><th>Profit</th><th>Margin</th>
        <th>Next milestone</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

// Empty state for a brand new account with zero projects.
function renderPortfolioEmpty() {
  const canCreate = canEdit();
  return `<div class="portfolio-empty">
    <div class="portfolio-empty-card">
      <div class="brand">Juno <span>Atlas</span></div>
      <h1>Our development portfolio. One place.</h1>
      <p class="muted">Create a project, enter assumptions, and Atlas generates cash flow, P&amp;L, debt, equity, and risk automatically.</p>
      ${canCreate ? `
        <div class="row gap-sm" style="margin-top:24px;justify-content:center;">
          <button class="btn" id="portfolio-empty-create-btn">+ Create your first project</button>
          <button class="btn secondary" id="portfolio-empty-import-btn">Import from CSV</button>
          <input type="file" id="portfolio-empty-import-file" accept=".csv,text/csv" style="display:none;">
        </div>
        <div class="portfolio-empty-templates muted">
          Quick-start templates coming in Phase 4: Spec home · Ground-up development · Renovation / value-add
        </div>
      ` : `<div class="muted" style="margin-top:16px;font-size:12px;">No projects to display yet. Ask an editor or admin to create the first project.</div>`}
    </div>
  </div>`;
}

function renderPortfolio(r) {
  // v14.3 — Phase 1.3: empty state for fresh installs
  if (state.projects.length === 0) return renderPortfolioEmpty();

  const k = r.kpis;
  const g = state.globals;
  const profitCls = k.total_profit_before_tax >= 0 ? "pos" : "neg";

  // Risk threshold checks (portfolio-level alert banner)
  const alerts = [];
  if (k.peak_equity_required > g.risk_peak_equity_threshold)
    alerts.push({ severity: "warn", msg: `Peak equity ${fmt.usdM(k.peak_equity_required)} exceeds threshold ${fmt.usdM(g.risk_peak_equity_threshold)}` });
  if (k.max_debt_outstanding > g.risk_max_debt_threshold)
    alerts.push({ severity: "warn", msg: `Max debt ${fmt.usdM(k.max_debt_outstanding)} exceeds threshold ${fmt.usdM(g.risk_max_debt_threshold)}` });
  if (k.moic_gross < g.risk_min_moic && k.total_equity_in > 0)
    alerts.push({ severity: "neg", msg: `MOIC ${k.moic_gross.toFixed(2)}x below threshold ${g.risk_min_moic.toFixed(2)}x` });
  if (k.irr_annual != null && k.irr_annual < g.risk_min_irr_annual)
    alerts.push({ severity: "neg", msg: `IRR ${fmt.pct(k.irr_annual)} below threshold ${fmt.pct(g.risk_min_irr_annual)}` });
  const portfolioMargin = k.total_sales > 0 ? k.total_profit_before_tax / k.total_sales : 0;
  if (portfolioMargin < g.risk_min_margin_pct)
    alerts.push({ severity: "neg", msg: `Portfolio profit margin ${fmt.pct(portfolioMargin)} below threshold ${fmt.pct(g.risk_min_margin_pct)}` });

  const alertBanner = alerts.length ? `
    <div class="note ${alerts.some(a => a.severity === "neg") ? "neg" : "warn"} mb-12">
      <strong>${alerts.length} risk threshold${alerts.length === 1 ? "" : "s"} breached:</strong>
      <ul style="margin:4px 0 0 18px;padding:0;">
        ${alerts.map(a => `<li>${a.msg}</li>`).join("")}
      </ul>
    </div>` : "";

  const peakEqCls = k.peak_equity_required > g.risk_peak_equity_threshold ? "warn" : "";
  const maxDebtCls = k.max_debt_outstanding > g.risk_max_debt_threshold ? "warn" : "";
  const moicCls = k.moic_gross < g.risk_min_moic ? "neg" : (k.moic_gross > 2 ? "pos" : "");

  const totalProjects = state.projects.length;
  const soldCount = state.projects.filter(p => p.status === "sold").length;

  return `
    <!-- v14.3 Portfolio header with global controls + CTAs -->
    <div class="portfolio-header mb-24">
      <div>
        <h1 class="page-title">Portfolio</h1>
        <div class="muted" style="font-size:12px;margin-top:4px;">${escapeHtml(state.scenario.name)} · ${k.active_project_count} of ${totalProjects} projects active${soldCount > 0 ? ` · ${soldCount} sold` : ""}</div>
      </div>
      ${canEdit() ? `<div class="row gap-sm wrap">
        <button class="btn" id="portfolio-new-project-btn">+ New project</button>
        <button class="btn secondary" id="portfolio-import-btn">Import CSV</button>
        <input type="file" id="portfolio-import-file" accept=".csv,text/csv" style="display:none;">
      </div>` : ""}
    </div>

    ${alertBanner}

    <!-- v14.20 (design reset Phase 5) — KPIs grouped under eyebrow labels.
         Performance · Capital · Returns. Four cards per row max. -->
    <div class="kpi-section">
      <div class="kpi-section-label">Performance</div>
      <div class="kpi-grid">
        ${kpiCard("Active projects", `${k.active_project_count}`, `${totalProjects} total${soldCount > 0 ? ` · ${soldCount} sold` : ""}`)}
        ${kpiCard("Projected revenue", fmt.usdM(k.total_sales), `Across model horizon`)}
        ${kpiCard("Projected profit", fmt.usdM(k.total_profit_before_tax), state.globals.apply_tax ? `After tax: ${fmt.usdM(k.total_profit_after_tax)}` : `Pre-tax`, profitCls)}
        ${kpiCard("Portfolio margin", fmt.pct(portfolioMargin), `Profit / sales (pre-tax)`)}
      </div>
    </div>
    <div class="kpi-section">
      <div class="kpi-section-label">Capital</div>
      <div class="kpi-grid">
        ${kpiCard("Peak equity required", fmt.usdM(k.peak_equity_required), `Month: ${fmt.ymShort(k.peak_equity_month)}`, peakEqCls)}
        ${kpiCard("Max debt outstanding", fmt.usdM(k.max_debt_outstanding), `Month: ${fmt.ymShort(k.max_debt_month)}`, maxDebtCls)}
        ${kpiCard("Total equity in", fmt.usdM(k.total_equity_in), `Owner cash deployed`)}
        ${kpiCard("Gross MOIC", `${k.moic_gross.toFixed(2)}x`, `Multiple on invested capital`, moicCls)}
      </div>
    </div>

    <!-- Main analytics band: cash flow + debt/equity -->
    <div class="panel-row">
      <div class="panel">
        <h3>Net cash flow</h3>
        <div class="panel-subtitle">Sales positive · costs negative · stacked by category</div>
        <div class="chart-frame"><canvas id="chart-cashflow"></canvas></div>
      </div>
      <div class="panel">
        <h3>Cumulative debt vs equity</h3>
        <div class="panel-subtitle">Running balances across the horizon</div>
        <div class="chart-frame"><canvas id="chart-balances"></canvas></div>
      </div>
    </div>

    <!-- v14.3 Pipeline by stage + Risk watchlist -->
    <div class="panel-row">
      ${renderPipelineByStage(state.projects)}
      ${renderRiskWatchlist(r.by_project)}
    </div>

    <!-- v14.3 Portfolio table with Next milestone -->
    ${renderPortfolioTable(r.by_project)}

    <div class="panel mb-24">
      <h3>Development yield metrics</h3>
      <div class="panel-subtitle">Real-estate development KPIs for benchmarking against market cap rates and competing strategies.</div>
      <div class="kpi-section">
        <div class="kpi-section-label">Returns</div>
        <div class="kpi-grid">
          ${kpiCard("Yield on cost", fmt.pct(k.portfolio_yield_on_cost), "Profit / all-in cost (incl. financing)", k.portfolio_yield_on_cost >= 0.15 ? "pos" : k.portfolio_yield_on_cost >= 0.08 ? "" : "neg")}
          ${kpiCard("Cash-on-cash", k.cash_on_cash == null ? "—" : fmt.pct(k.cash_on_cash), "Annualized equity return", k.cash_on_cash >= 0.15 ? "pos" : k.cash_on_cash >= 0.08 ? "" : "neg")}
          ${kpiCard("Revenue multiple", `${k.portfolio_revenue_multiple.toFixed(2)}x`, "Sales / all-in cost")}
          ${kpiCard("Profit per sqft", `$${Math.round(k.portfolio_profit_per_sqft).toLocaleString()}`, `Total ${fmt.num(k.total_sqft)} sqft built`)}
        </div>
      </div>
      <div class="kpi-section" style="margin-bottom:0;">
        <div class="kpi-section-label">Operating health</div>
        <div class="kpi-grid">
          ${kpiCard("Effective margin", fmt.pct(k.total_sales > 0 ? k.total_profit_before_tax / k.total_sales : 0), "Profit / sales (pre-tax)")}
          ${kpiCard("Contingency burn", fmt.pct(k.contingency.burn_pct), `${fmt.usdM(k.contingency.used_usd)} of ${fmt.usdM(k.contingency.budget_usd)} budget`, k.contingency.burn_pct >= 0.80 ? "neg" : k.contingency.burn_pct >= 0.50 ? "warn" : "pos")}
        </div>
      </div>
    </div>

    ${(() => {
      const s = k.sales_metrics;
      if (!s || s.sold_count === 0) return `<div class="panel mb-24"><h3>Sales-cycle metrics</h3><div class="muted" style="font-size:12px;">No closed sales yet. As projects move through pre-sales → under contract → sold, fill in listing/closing dates and prices on each Project detail to populate these.</div></div>`;
      return `<div class="panel mb-24">
        <h3>Sales-cycle metrics</h3>
        <div class="panel-subtitle">Based on ${s.sold_count} closed sale${s.sold_count === 1 ? "" : "s"}.</div>
        <div class="kpi-row">
          ${kpiCard("Closed sales", s.sold_count, `Total proceeds: ${fmt.usdM(s.total_actual_sales)}`)}
          ${kpiCard("Avg days on market", s.avg_dom == null ? "—" : `${Math.round(s.avg_dom)}d`, "List → under contract")}
          ${kpiCard("Avg listing → close", s.avg_listing_to_close == null ? "—" : `${Math.round(s.avg_listing_to_close)}d`, "List → closed")}
          ${kpiCard("Price-to-listing", s.avg_price_to_listing_ratio == null ? "—" : fmt.pct(s.avg_price_to_listing_ratio - 1, 1) + " vs ask", `${s.avg_price_to_listing_ratio?.toFixed(3)}× listing`, s.avg_price_to_listing_ratio >= 1 ? "pos" : "neg")}
        </div>
      </div>`;
    })()}

    <div class="panel mb-24">
      <h3>Annual P&L roll-up</h3>
      <div class="panel-subtitle">Fiscal-year mode: <strong>${state.globals.fiscal_year_mode === "juno13" ? "Juno 13-month" : "Calendar (Jan–Dec)"}</strong>${state.globals.fiscal_year_mode === "juno13" ? " — matches Juno Forecast cols BA–BD" : " — Jan 2030 shows as a partial FY30 column"}. Toggle in Settings.</div>
      ${renderAnnualTable(r)}
    </div>
  `;
}

function kpiCard(label, value, meta = "", cls = "") {
  // v14.24 — Coerce null/undefined meta to empty string so callers passing
  // `null` (e.g. wizard review page) don't end up rendering the literal "null".
  const metaStr = meta == null ? "" : meta;
  const metaHtml = metaStr === "" ? "" : `<div class="meta">${metaStr}</div>`;
  return `<div class="kpi ${cls}"><div class="label">${label}</div><div class="value">${value}</div>${metaHtml}</div>`;
}

function renderAnnualTable(r) {
  const years = Object.keys(r.annual).sort();
  if (!years.length) return `<div class="note">No data in model window.</div>`;
  const rows = [
    ["Sales", "sales", "pos"],
    ["Land cost", "land", "neg"],
    ["Construction", "build", "neg"],
    ["Kingshaus", "kingshaus", "neg"],
    ["Soft costs", "soft", "neg"],
    ["Overheads", "opex", "neg"],
    ["Financing", "interest", "neg"],
    ["Profit before tax", "profit_before_tax", "bold"],
    ...(state.globals.apply_tax ? [
      ["NOL used (carryforward)", "nol_used", "muted"],
      ["Taxable profit", "taxable_profit", ""],
      ["Tax", "tax", "neg"],
      ["NOL balance carryforward", "nol_balance", "muted"],
      ["Profit after tax", "profit_after_tax", "bold"],
    ] : []),
  ];
  let html = `<div class="scroll-x"><table class="tbl"><thead><tr><th>USD</th>${years.map(y => `<th>${y}</th>`).join("")}<th>Total</th></tr></thead><tbody>`;
  for (const [label, key, cls] of rows) {
    let total = 0;
    let rowHtml = `<tr><td>${label}</td>`;
    for (const y of years) {
      const v = r.annual[y][key];
      total += v;
      rowHtml += `<td class="num ${cls === "bold" ? "" : (v < 0 ? "neg" : "pos")}">${fmt.usdSigned(v)}</td>`;
    }
    rowHtml += `<td class="num ${cls === "bold" ? "" : (total < 0 ? "neg" : "pos")}"><strong>${fmt.usdSigned(total)}</strong></td></tr>`;
    html += rowHtml;
  }
  html += `</tbody></table></div>`;
  return html;
}

// ---------- Projects list ----------

function renderProjectsList(r) {
  const rows = r.by_project.map((res) => {
    const p = state.projects.find((x) => x.id === res.project_id);
    const excluded = state.scenario.excluded_project_ids.includes(res.project_id);
    return `<tr draggable="true" data-project-row="${p.id}">
      <td data-label="Project"><span class="drag-handle" title="Drag to reorder">⋮⋮</span> <strong>${p.name}</strong><div class="muted" style="font-size:10.5px;">${p.address}</div></td>
      <td data-label="Stage" class="muted">${stageBadge(p, excluded)}</td>
      <td data-label="Start">${fmt.ymShort(p.start_date)}</td>
      <td data-label="Sale">${fmt.ymShort(res.sale_date)}</td>
      <td data-label="Sqft" class="num">${fmt.num(p.villa_sqft)}</td>
      <td data-label="Land" class="num neg">${fmt.usdM(p.land_cost_usd)}</td>
      <td data-label="Dev cost" class="num neg">${fmt.usdM(res.kpis.total_dev_cost)}</td>
      <td data-label="Sale price" class="num pos">${fmt.usdM(res.kpis.total_sales)}</td>
      <td data-label="Profit" class="num ${res.kpis.gross_profit >= 0 ? "pos" : "neg"}">${fmt.usdM(Math.abs(res.kpis.gross_profit))}</td>
      <td data-label="Margin" class="num">${fmt.pct(res.kpis.profit_margin_pct)}</td>
      <td data-label="MOIC" class="num">${(res.kpis.moic || 0).toFixed(2)}x</td>
      <td data-label="IRR" class="num">${res.kpis.irr_annual == null ? "—" : fmt.pct(res.kpis.irr_annual)}</td>
      <td data-label="YoC" class="num">${fmt.pct(res.kpis.yield_on_cost)}</td>
      <td data-label="$/sqft profit" class="num">$${Math.round(res.kpis.profit_per_sqft).toLocaleString()}</td>
      <td data-label="Actions">
        <button class="btn small secondary" data-action="open" data-id="${res.project_id}">Open</button>
        <button class="btn small secondary" data-action="exclude" data-id="${res.project_id}" title="${excluded ? "Re-include this project in the active scenario's totals." : "Remove this project from the active scenario's totals only. Does NOT delete the project."}">${excluded ? "Include in scenario" : "Exclude from scenario"}</button>
      </td>
    </tr>`;
  }).join("");

  return `
    <div class="row between mb-12">
      <div class="section-title" style="margin:0;">Projects (${state.projects.length})</div>
      <div class="row gap-sm">
        <button class="btn" id="add-project-btn">+ Add project</button>
        <button class="btn secondary" id="import-csv-btn">Import CSV</button>
        <input type="file" id="import-csv-file" accept=".csv,text/csv" style="display:none;">
      </div>
    </div>
    <div class="panel projects-table-mobile-cards">
      <div class="scroll-x"><table class="tbl">
        <thead><tr>
          <th>Project</th><th>Stage</th><th>Start</th><th>Sale</th><th>Sqft</th>
          <th>Land</th><th>Dev cost</th><th>Sale</th><th>Profit</th><th>Margin</th><th>MOIC</th><th>IRR</th><th>YoC</th><th>$/sqft profit</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>
  `;
}

// ---------- Project detail ----------

// Cached takeoffs (lazy-loaded)
const takeoffCache = {};
async function loadTakeoff(projectId) {
  if (takeoffCache[projectId]) return takeoffCache[projectId];
  if (projectId !== "p2") return null;  // only have 84 SBR takeoff currently
  try {
    const res = await fetch(`./data/84sbr_takeoff.json`);
    if (!res.ok) return null;
    const data = await res.json();
    takeoffCache[projectId] = data;
    return data;
  } catch (e) { return null; }
}

async function renderTakeoffPanel(projectId) {
  const container = document.getElementById("takeoff-panel-container");
  if (!container) return;
  const takeoff = await loadTakeoff(projectId);
  if (!takeoff) { container.style.display = "none"; return; }
  container.style.display = "";
  const total = takeoff.categories.reduce((a, c) => a + c.total, 0);
  const rows = takeoff.categories.map(c => {
    const pct = (c.total / total * 100).toFixed(1);
    const lines = c.lines.map(l => `<tr style="background:var(--surface-2);"><td style="padding-left:24px;">${l.code}</td><td>${l.name}</td><td class="num">${fmt.usd(l.amount)}</td></tr>`).join("");
    return `<tbody class="takeoff-cat"><tr data-toggle-cat><td><strong>${c.name}</strong></td><td class="muted" style="font-size:11px;">${c.lines.length} line items</td><td class="num"><strong>${fmt.usd(c.total)}</strong></td></tr>${lines}</tbody>`;
  }).join("");
  container.innerHTML = `
    <h3>Cost takeoff — ${takeoff.project}</h3>
    <div class="panel-subtitle">Source: ${takeoff.source} (snapshot ${takeoff.snapshot}) · 21 CSI categories · ${takeoff.categories.reduce((a,c)=>a+c.lines.length,0)} line items · Total $${Math.round(total).toLocaleString()}</div>
    <div class="scroll-x"><table class="tbl">
      <thead><tr><th>Category</th><th></th><th>Total</th></tr></thead>
      ${rows}
    </table></div>
    <div class="note mt-16">Click a category row to expand line items. <em>Currently informational only — not yet wired into engine; v6 will use these for per-line monthly spreading.</em></div>
  `;
  // Initially hide line item rows
  container.querySelectorAll("tbody.takeoff-cat tr:not([data-toggle-cat])").forEach(tr => tr.style.display = "none");
  container.querySelectorAll("tr[data-toggle-cat]").forEach(tr => {
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      const tbody = tr.parentElement;
      const lines = Array.from(tbody.querySelectorAll("tr")).slice(1);
      const hidden = lines[0]?.style.display === "none";
      lines.forEach(l => l.style.display = hidden ? "" : "none");
    });
  });
}

// v14.4 (Phase 2.1) — Project workspace tabs
// Each tab is a different perspective on the same selected project. Summary is the existing layout.
// Inputs is the new structured editing surface. Others are placeholders until later Phase 2/3 work.
const PROJECT_TABS = [
  { key: "summary",  label: "Summary",   status: "live" },
  { key: "inputs",   label: "Inputs",    status: "live" },
  { key: "timeline", label: "Timeline",  status: "live" },
  { key: "capital",  label: "Capital",   status: "live" },
  { key: "actuals",  label: "Actuals",   status: "live" },
  { key: "sales",    label: "Sales",     status: "live" },
  { key: "risks",    label: "Risks",     status: "live" },
  { key: "activity", label: "Activity",  status: "live" },
];

function renderProjectDetail(r) {
  const id = state.ui.selected_project_id;
  const p = state.projects.find((x) => x.id === id);
  if (!p) return `<div class="note neg">Project not found. Pick one from the list.</div>`;
  const res = r.by_project.find((x) => x.project_id === id)
    || calcProject(p, state.globals, state.scenario);
  const m = res.monthly;

  // Tab strip — always above the active tab content. Live tabs route, placeholders show a coming-soon panel.
  const activeTab = PROJECT_TABS.find(t => t.key === state.ui.project_tab) ? state.ui.project_tab : "summary";
  const tabStripHtml = `
    <div class="project-tabs mb-24">
      ${PROJECT_TABS.map(t => `
        <button class="project-tab ${activeTab === t.key ? "active" : ""} ${t.status === "coming" ? "coming" : ""}"
                data-project-tab="${t.key}"
                ${t.status === "coming" ? `title="Coming in Phase ${t.phase}"` : ""}>
          ${t.label}${t.status === "coming" ? ` <span class="muted" style="font-weight:400;">·</span>` : ""}
        </button>
      `).join("")}
    </div>`;

  // Compact project header — shared across all tabs
  const headerHtml = renderProjectHeader(p, res);

  // Active tab body
  let tabBody = "";
  if (activeTab === "summary") {
    tabBody = renderProjectSummaryTab(p, res, m);
  } else if (activeTab === "inputs") {
    tabBody = renderProjectInputs(p, res);
  } else if (activeTab === "timeline") {
    tabBody = renderProjectTimelineTab(p, res);
  } else if (activeTab === "capital") {
    tabBody = renderProjectCapitalTab(p, res);
  } else if (activeTab === "actuals") {
    tabBody = renderProjectActualsTab(p, res);
  } else if (activeTab === "risks") {
    tabBody = renderProjectRisksTab(p, res);
  } else if (activeTab === "activity") {
    tabBody = renderProjectActivityTab(p);
  } else if (activeTab === "sales") {
    tabBody = renderProjectSalesTab(p, res);
  } else {
    const t = PROJECT_TABS.find(t => t.key === activeTab);
    tabBody = `<div class="panel" style="text-align:center;padding:48px 24px;">
      <h3 style="margin-bottom:8px;">${t.label} — coming in Phase ${t.phase}</h3>
      <p class="muted" style="font-size:13px;max-width:480px;margin:0 auto;">This view is reserved for the upcoming phase of the Atlas dev plan.</p>
    </div>`;
  }

  return `${headerHtml}${tabStripHtml}${tabBody}`;
}

// Shared project header — sits above the tab strip on every project tab.
function renderProjectHeader(p, res) {
  const isExcluded = state.scenario.excluded_project_ids.includes(p.id);
  const lastEdit = (state.audit_log || []).find(e =>
    e.detail?.project_id === p.id || (e.message || "").toLowerCase().includes((p.name || "").toLowerCase())
  );
  const lastUpdatedText = lastEdit?.ts
    ? new Date(lastEdit.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "no edits yet";
  return `
    <div class="project-summary-header mb-24">
      <div class="project-summary-title">
        <div class="row gap-sm" style="align-items:center;">
          <h1 class="project-name">${escapeHtml(p.name)}</h1>
          ${stageBadge(p, isExcluded)}
          <span class="badge ${p.status || "pipeline"}">${(p.status || "pipeline").replace(/_/g," ")}</span>
        </div>
        <div class="project-summary-meta muted">
          <span>${escapeHtml(p.address || "—")}</span>
          <span>·</span>
          <span>Scenario: <strong style="color:var(--fg);">${escapeHtml(state.scenario.name)}</strong></span>
          <span>·</span>
          <span>Last updated: ${lastUpdatedText}</span>
        </div>
      </div>
      <div class="project-summary-actions row gap-sm wrap">
        <select class="input" id="project-picker" style="max-width:240px;">
          ${state.projects.map(x => `<option value="${x.id}" ${x.id===p.id?"selected":""}>${x.name}</option>`).join("")}
        </select>
        <button class="btn small secondary" data-action="exclude" data-id="${p.id}" title="${isExcluded ? "Re-include this project in the active scenario's totals." : "Remove this project from the active scenario's totals only. Does NOT delete the project."}">${isExcluded ? "Include in scenario" : "Exclude from scenario"}</button>
        <button class="btn small secondary" data-action="clone" data-id="${p.id}">Clone</button>
        <button class="btn small danger" data-action="remove" data-id="${p.id}" title="Permanently delete this project. You'll be asked to confirm.">Delete project</button>
      </div>
    </div>`;
}

// v14.4 — Summary tab: the Phase 1.2 layout, now scoped to its own renderer
function renderProjectSummaryTab(p, res, m) {
  // v13.1 — Sensitivity table.
  // Sale price is PINNED at the current sale price (an override) so cost shocks don't perversely
  // raise the sale price via cost-plus-margin pricing. Margin override cases are excluded for
  // the same reason — they'd no-op against a fixed sale price.
  const baseProfit = res.kpis.gross_profit;
  const pinnedSale = p.sale_price_override_usd ?? res.kpis.total_sales;
  const projForSens = { ...p, sale_price_override_usd: pinnedSale };
  const sensCases = [
    { label: "Build cost +10%", patch: { build_cost_multiplier: 1.1 } },
    { label: "Build cost -10%", patch: { build_cost_multiplier: 0.9 } },
    { label: "Sale price +10%", patch: { sale_price_multiplier: 1.1 } },
    { label: "Sale price -10%", patch: { sale_price_multiplier: 0.9 } },
    { label: "Interest +200bps", patch: { interest_rate_delta_bps: 200 } },
    { label: "Interest -200bps", patch: { interest_rate_delta_bps: -200 } },
    { label: "Timing slip +3 months", patch: { timing_shift_months: 3 } },
    { label: "Timing pull -3 months", patch: { timing_shift_months: -3 } },
  ];
  const sensRows = sensCases.map((c) => {
    const altScenario = { ...state.scenario, ...c.patch };
    const alt = calcProject(projForSens, state.globals, altScenario);
    const delta = alt.kpis.gross_profit - baseProfit;
    return `<tr>
      <td>${c.label}</td>
      <td class="num">${fmt.usdM(alt.kpis.gross_profit)}</td>
      <td class="num ${delta >= 0 ? "pos" : "neg"}">${delta >= 0 ? "+" : ""}${fmt.usdM(delta)}</td>
    </tr>`;
  }).join("");

  return `
    <!-- v14.2 KPI row — 8 cards per brief -->
    <div class="kpi-row">
      ${kpiCard("Total dev cost", fmt.usdM(res.kpis.total_dev_cost), `${fmt.num(res.kpis.total_cost_per_sqft, 0)}/sqft`)}
      ${kpiCard("Gross sale value", fmt.usdM(res.kpis.total_sales), `${fmt.num(res.kpis.sale_price_per_sqft, 0)}/sqft`)}
      ${kpiCard("Projected profit", fmt.usdM(res.kpis.gross_profit), fmt.pct(res.kpis.profit_margin_pct), res.kpis.gross_profit >= 0 ? "pos" : "neg")}
      ${kpiCard("Margin", fmt.pct(res.kpis.profit_margin_pct), `Profit / sales`)}
      ${kpiCard("Peak equity", fmt.usdM(res.kpis.peak_equity), `Project-level`)}
      ${kpiCard("Max debt", fmt.usdM(res.kpis.peak_debt), `Project-level`)}
      ${kpiCard("Annualized IRR", res.kpis.irr_annual == null ? "—" : fmt.pct(res.kpis.irr_annual), `Equity cash flow`)}
      ${kpiCard("MOIC", `${(res.kpis.moic || 0).toFixed(2)}x`, `Equity multiple`)}
    </div>

    <!-- v14.2 Timeline + Cash flow chart -->
    <div class="panel-row">
      ${renderProjectTimeline(p, res)}
      <div class="panel">
        <h3>Monthly cash flow</h3>
        <div class="panel-subtitle">${m.dates[0]} → ${m.dates[m.dates.length-1]} · debt &amp; equity overlay</div>
        <div class="chart-frame"><canvas id="chart-project"></canvas></div>
      </div>
    </div>

    <!-- v14.2 Forecast vs Actuals band (promoted per Phase 1 dev plan) -->
    ${renderActualsVariance(p, res)}

    <!-- v14.2 Lower band: Sources vs Uses · Risks · Recent changes -->
    <div class="panel-three-row mb-24">
      ${renderSourcesUses(p, res)}
      ${renderProjectRiskCards(p, res)}
      ${renderProjectRecentChanges(p)}
    </div>

    <!-- Edit assumptions — collapsed by default. Anchored from the header button. -->
    <div class="panel mb-24" id="edit-assumptions">
      <details ${state.ui._inputs_open ? "open" : ""}>
        <summary style="cursor:pointer;font-weight:600;">Edit assumptions</summary>
        <div class="panel-subtitle" style="margin-top:8px;">Blank override fields use global defaults. Changes save automatically.</div>
        ${renderProjectForm(p, res)}
      </details>
    </div>

    <!-- Sensitivity for this project — Phase 3 will fold this into the Risks center -->
    <div class="panel mb-24">
      <h3>Sensitivity</h3>
      <div class="panel-subtitle">Profit impact of one-factor changes vs current scenario.</div>
      <table class="tbl">
        <thead><tr><th>Case</th><th>Profit</th><th>Δ vs current</th></tr></thead>
        <tbody>${sensRows}</tbody>
      </table>
    </div>

    <div class="panel mb-24" id="takeoff-panel-container"></div>

    <div class="panel mb-24">
      <h3>Monthly forecast</h3>
      <div class="scroll-x">${renderProjectMonthlyTable(res)}</div>
    </div>
  `;
}

// v14.2 — Project Summary: Timeline panel
// Visual milestone bar from project start → sale, with markers for key dates and a "today" indicator.
function renderProjectTimeline(p, res) {
  const start = res.start_date || p.start_date;
  const sale = res.sale_date || addMonthsLite(start, p.program_months || state.globals.default_program_months);
  if (!start || !sale) {
    return `<div class="panel"><h3>Timeline</h3><div class="muted">Set a start date to see the project timeline.</div></div>`;
  }
  const totalMonths = monthsBetween(start, sale);
  if (totalMonths <= 0) {
    return `<div class="panel"><h3>Timeline</h3><div class="muted">Program duration must be positive.</div></div>`;
  }
  const today = new Date();
  const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const milestones = [
    { ym: start,                 label: "Land / start",    kind: "start" },
    { ym: p.listing_date,        label: "Listed",          kind: "list" },
    { ym: p.under_contract_date, label: "Under contract",  kind: "uc" },
    { ym: p.closing_date || sale,label: "Closing",         kind: "close" },
  ].filter(m => m.ym);
  const pos = (ym) => {
    const off = monthsBetween(start, ym);
    return Math.max(0, Math.min(100, (off / totalMonths) * 100));
  };
  const todayPos = pos(todayYM);
  const todayInRange = todayPos > 0 && todayPos < 100;
  const stage = LIFECYCLE_STAGES.find(s => s.id === (p.stage || "sourcing"));
  return `<div class="panel">
    <h3>Timeline <span class="muted" style="font-weight:400;font-size:11px;margin-left:8px;">${fmt.ymShort(start)} → ${fmt.ymShort(sale)} · ${totalMonths} months</span></h3>
    <div class="timeline">
      <div class="timeline-bar">
        <div class="timeline-fill" style="width:${todayInRange ? todayPos : (todayPos >= 100 ? 100 : 0)}%;"></div>
        ${todayInRange ? `<div class="timeline-today" style="left:${todayPos}%;" title="Today">Today</div>` : ""}
        ${milestones.map(m => `
          <div class="timeline-marker" style="left:${pos(m.ym)}%;" title="${m.label}: ${fmt.ymShort(m.ym)}">
            <span class="timeline-marker-dot kind-${m.kind}"></span>
            <span class="timeline-marker-label">${m.label}<br><span class="muted">${fmt.ymShort(m.ym)}</span></span>
          </div>`).join("")}
      </div>
    </div>
    <div class="timeline-stage muted">Current stage: <strong style="color:var(--fg);">${stage?.label || "Sourcing"}</strong>${stage?.description ? ` — ${stage.description}` : ""}</div>
  </div>`;
}

// Local helpers (kept lightweight — engine.js owns the canonical versions but we avoid the import dance here)
function addMonthsLite(ym, n) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split("-").map(Number);
  const nInt = Math.round(n || 0);
  const total = y * 12 + (m - 1) + nInt;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
function monthsBetween(a, b) {
  if (!a || !b) return 0;
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

// v14.2 — Project Summary: Sources vs Uses
function renderSourcesUses(p, res) {
  const k = res.kpis;
  const sources = [
    { label: "Senior construction debt (peak)", value: k.peak_debt },
    { label: "Equity / KPC LOC (peak called)",   value: k.peak_equity },
    { label: "Gross sale proceeds",               value: k.total_sales },
  ];
  const uses = [
    { label: "Land",                              value: -res.monthly.land_cost.reduce((a,b)=>a+b,0) },
    { label: "Construction",                      value: -res.monthly.build_cost.reduce((a,b)=>a+b,0) },
    { label: "Kingshaus / superstructure",        value: -res.monthly.kingshaus.reduce((a,b)=>a+b,0) },
    { label: "Soft costs",                        value: -res.monthly.soft_cost.reduce((a,b)=>a+b,0) },
    { label: "Financing (interest + fees)",       value: k.total_interest },
  ];
  const rowsHtml = (list) => list.map(r => `<tr><td>${r.label}</td><td class="num">${fmt.usdM(r.value)}</td></tr>`).join("");
  return `<div class="panel">
    <h3>Sources vs Uses</h3>
    <div class="panel-subtitle">Capital coming in vs costs going out across the project lifecycle.</div>
    <div class="sources-uses">
      <div>
        <div class="section-title" style="margin-bottom:6px;">Sources</div>
        <table class="tbl">${rowsHtml(sources)}</table>
      </div>
      <div>
        <div class="section-title" style="margin-bottom:6px;">Uses</div>
        <table class="tbl">${rowsHtml(uses)}</table>
      </div>
    </div>
  </div>`;
}

// v14.2 — Project Summary: per-project Risk cards
// Uses the same thresholds as the Portfolio screen but applied at the project level.
function renderProjectRiskCards(p, res) {
  const k = res.kpis;
  const g = state.globals;
  // Per-project pro-rata of portfolio-level peak-equity / max-debt thresholds.
  // For a single project we use a proportionate fraction (1 / typical-pipeline-size = 1/8).
  const proRata = 1 / 8;
  const peakEqProRata = g.risk_peak_equity_threshold * proRata;
  const peakDebtProRata = g.risk_max_debt_threshold * proRata;
  const cards = [
    {
      label: "Peak equity",
      value: fmt.usdM(k.peak_equity),
      ok: k.peak_equity <= peakEqProRata,
      detail: `vs ${fmt.usdM(peakEqProRata)} per-project tolerance`,
    },
    {
      label: "Peak debt",
      value: fmt.usdM(k.peak_debt),
      ok: k.peak_debt <= peakDebtProRata,
      detail: `vs ${fmt.usdM(peakDebtProRata)} per-project tolerance`,
    },
    {
      label: "Annualized IRR",
      value: k.irr_annual == null ? "—" : fmt.pct(k.irr_annual),
      ok: k.irr_annual == null || k.irr_annual >= g.risk_min_irr_annual,
      detail: `min ${fmt.pct(g.risk_min_irr_annual)}`,
    },
    {
      label: "Profit margin",
      value: fmt.pct(k.profit_margin_pct),
      ok: k.profit_margin_pct >= g.risk_min_margin_pct,
      detail: `min ${fmt.pct(g.risk_min_margin_pct)}`,
    },
    {
      label: "MOIC",
      value: `${(k.moic || 0).toFixed(2)}x`,
      ok: k.moic == null || k.moic >= g.risk_min_moic,
      detail: `min ${g.risk_min_moic.toFixed(2)}x`,
    },
  ];
  return `<div class="panel">
    <h3>Risks</h3>
    <div class="panel-subtitle">Health checks for this project against portfolio risk thresholds.</div>
    <div class="risk-cards">
      ${cards.map(c => `
        <div class="risk-card ${c.ok ? "ok" : "warn"}">
          <div class="risk-card-status">${c.ok ? "✓" : "!"}</div>
          <div class="risk-card-body">
            <div class="risk-card-label">${c.label}</div>
            <div class="risk-card-value">${c.value}</div>
            <div class="risk-card-detail muted">${c.detail}</div>
          </div>
        </div>`).join("")}
    </div>
  </div>`;
}

// v14.2 — Project Summary: Recent changes filtered to this project
function renderProjectRecentChanges(p) {
  const log = state.audit_log || [];
  // Filter to entries where the project is mentioned in detail or message
  const entries = log.filter(e => {
    if (e.detail?.project_id === p.id) return true;
    if (e.detail?.source_id === p.id || e.detail?.target_id === p.id) return true;
    if (e.message?.toLowerCase().includes(p.name?.toLowerCase() || "##nope##")) return true;
    return false;
  }).slice(0, 5);
  if (!entries.length) {
    return `<div class="panel">
      <h3>Recent changes</h3>
      <div class="muted" style="font-size:12px;">No edits logged yet for this project.</div>
    </div>`;
  }
  return `<div class="panel">
    <h3>Recent changes</h3>
    <div class="panel-subtitle">Last 5 edits affecting this project.</div>
    <ul class="recent-changes">
      ${entries.map(e => {
        const when = e.ts ? new Date(e.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
        const who = e.user_email ? e.user_email.split("@")[0] : "—";
        return `<li>
          <div class="recent-msg">${escapeHtml(e.message || "(unspecified)")}</div>
          <div class="muted recent-meta">${when} · ${who}</div>
        </li>`;
      }).join("")}
    </ul>
  </div>`;
}

// v12.3 — budget vs actual variance for this project
function renderActualsVariance(p, res) {
  const actuals = p.actuals || {};
  const anyActuals = Object.values(actuals).some(v => v > 0);
  if (!anyActuals) {
    return `<div class="panel mb-24">
      <h3>Budget vs actual</h3>
      <div class="muted" style="font-size:12px;">No actual costs recorded yet. Open the <strong>Actuals</strong> section in the Inputs panel above and fill in amounts paid to date.</div>
    </div>`;
  }
  const land_forecast = -res.monthly.land_cost.reduce((a, b) => a + b, 0);
  const build_forecast = -res.monthly.build_cost.reduce((a, b) => a + b, 0);
  const king_forecast = -res.monthly.kingshaus.reduce((a, b) => a + b, 0);
  const soft_forecast = -res.monthly.soft_cost.reduce((a, b) => a + b, 0);
  const fin_forecast = -res.monthly.interest.reduce((a, b) => a + b, 0);
  const rows = [
    ["Land",         land_forecast,  actuals.land || 0],
    ["Construction", build_forecast, actuals.construction || 0],
    ["Kingshaus",    king_forecast,  actuals.kingshaus || 0],
    ["Soft costs",   soft_forecast,  actuals.soft || 0],
    ["Financing",    fin_forecast,   actuals.financing || 0],
  ];
  const totalF = rows.reduce((a, r) => a + r[1], 0);
  const totalA = rows.reduce((a, r) => a + r[2], 0);
  return `<div class="panel mb-24">
    <h3>Budget vs actual</h3>
    <div class="panel-subtitle">Forecast comes from the model. Actual = what you've actually spent. Variance is actual − forecast (positive = over budget).</div>
    <div class="scroll-x"><table class="tbl">
      <thead><tr><th>Line</th><th>Forecast</th><th>Actual</th><th>Variance ($)</th><th>Variance (%)</th><th>% of forecast spent</th></tr></thead>
      <tbody>
        ${rows.map(([label, f, a]) => {
          const v = a - f;
          const vPct = f > 0 ? v / f : 0;
          const spent = f > 0 ? a / f : 0;
          const cls = v <= 0 ? "pos" : "neg";
          return `<tr>
            <td>${label}</td>
            <td class="num">${fmt.usdM(f)}</td>
            <td class="num">${fmt.usdM(a)}</td>
            <td class="num ${cls}">${(v >= 0 ? "+" : "")}${fmt.usdM(Math.abs(v))}</td>
            <td class="num ${cls}">${fmt.pct(vPct)}</td>
            <td class="num">${fmt.pct(spent)}</td>
          </tr>`;
        }).join("")}
        <tr>
          <td><strong>Total dev cost</strong></td>
          <td class="num"><strong>${fmt.usdM(totalF)}</strong></td>
          <td class="num"><strong>${fmt.usdM(totalA)}</strong></td>
          <td class="num ${totalA - totalF <= 0 ? "pos" : "neg"}"><strong>${(totalA - totalF >= 0 ? "+" : "")}${fmt.usdM(Math.abs(totalA - totalF))}</strong></td>
          <td class="num ${totalA - totalF <= 0 ? "pos" : "neg"}"><strong>${fmt.pct(totalF > 0 ? (totalA - totalF) / totalF : 0)}</strong></td>
          <td class="num"><strong>${fmt.pct(totalF > 0 ? totalA / totalF : 0)}</strong></td>
        </tr>
      </tbody>
    </table></div>
  </div>`;
}

function renderProjectForm(p, res) {
  const f = (key, label, type = "number", step = "any", attrs = "") => {
    const raw = p[key];
    const value = raw == null ? "" : raw;
    const isOverride = ["build_cost_per_sqft","kingshaus_cost_per_sqft","target_margin","interest_rate_apr","ltc_pct"].includes(key);
    const emptyHint = isOverride && raw == null ? "global default" : "";
    return `
      <div class="form-row">
        <label>${label}${isOverride ? ' <span class="muted" style="font-weight:400;">(override)</span>' : ""}</label>
        <input class="input ${isOverride && raw == null ? "override-empty" : ""}" data-field="${key}" type="${type}" step="${step}" value="${value}" placeholder="${emptyHint}" ${attrs}>
      </div>`;
  };
  return `
    <div class="form-grid">
      <div class="form-row full"><label>Name</label><input class="input" data-field="name" type="text" value="${p.name}"></div>
      <div class="form-row"><label>Address</label><input class="input" data-field="address" type="text" value="${p.address || ""}"></div>
      <div class="form-row"><label>Lifecycle stage</label>
        <select class="input" data-field="stage">
          ${LIFECYCLE_STAGES.map(s => `<option value="${s.id}" ${(p.stage || "sourcing") === s.id ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
      </div>
      <div class="form-row"><label>Market</label>
        <select class="input" data-field="market">
          ${(state.globals.markets || []).map(m => `<option value="${m.id}" ${(p.market || "default") === m.id ? "selected" : ""}>${m.name} (sale ${(m.sale_price_multiplier*100).toFixed(0)}% · build ${(m.build_cost_multiplier*100).toFixed(0)}%)</option>`).join("")}
        </select>
      </div>
      ${f("start_date","Start date","month","1")}
      ${f("program_months","Program months","number","1")}
      ${f("villa_sqft","Villa sqft","number","10")}
      ${f("land_cost_usd","Land cost (USD)","number","1000")}
      ${f("build_cost_per_sqft","Build $/sqft")}
      ${f("kingshaus_cost_per_sqft","Kingshaus $/sqft")}
      ${f("target_margin","Target margin")}
      ${f("interest_rate_apr","Interest APR")}
      ${f("ltc_pct","LTC")}
      ${f("soft_costs_lump_sum","Soft costs lump sum (USD)")}
      ${f("sale_price_override_usd","Sale price override (USD)")}
      ${f("sale_price_per_sqft_override","Sale $/sqft override")}
    </div>
    <details style="margin-top:16px;" ${(p.listing_date || p.closing_date) ? "open" : ""}>
      <summary style="cursor:pointer;font-size:12px;color:var(--fg-2);font-weight:500;">Sales tracking (fill in as the deal progresses)</summary>
      <div class="form-grid" style="margin-top:10px;">
        ${f("listing_date","Listing date","date","1")}
        ${f("listing_price_usd","Listing price (USD)")}
        ${f("under_contract_date","Under contract date","date","1")}
        ${f("closing_date","Closing date","date","1")}
        ${f("actual_sale_price_usd","Actual sale price (USD)")}
      </div>
    </details>
    <details style="margin-top:16px;" ${(p.actuals && Object.values(p.actuals).some(v => v > 0)) ? "open" : ""}>
      <summary style="cursor:pointer;font-size:12px;color:var(--fg-2);font-weight:500;">Actuals — cost paid to date (vs forecast)</summary>
      <div class="form-grid" style="margin-top:10px;">
        ${["land","construction","kingshaus","soft","financing"].map(k =>
          `<div class="form-row"><label>${k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} actual (USD)</label>
            <input class="input" data-actual="${k}" type="number" step="1000" value="${p.actuals?.[k] ?? 0}"></div>`
        ).join("")}
        <div class="form-row"><label>Contingency drawn (USD)</label>
          <input class="input" data-field="contingency_used_usd" type="number" step="1000" value="${p.contingency_used_usd ?? 0}"></div>
      </div>
    </details>
    <details style="margin-top:16px;">
      <summary style="cursor:pointer;font-size:12px;color:var(--fg-2);font-weight:500;">Soft cost breakdown (overrides lump sum if any value &gt; 0)</summary>
      <div class="form-grid" style="margin-top:10px;">
        ${["build_tools","sabbeth","craft","zero_design","klas_bsv","permits","other"].map(k =>
          `<div class="form-row"><label>${k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} (USD)</label>
            <input class="input" data-soft="${k}" type="number" step="1000" value="${p.soft_costs?.[k] ?? 0}"></div>`
        ).join("")}
      </div>
    </details>
    ${p._excel_sale_price ? `<div class="row gap-sm mt-16">
      <button class="btn small secondary" data-action="use-excel-price" data-id="${p.id}" data-price="${p._excel_sale_price}">Use Excel sale price (${fmt.usdM(p._excel_sale_price)})</button>
      <button class="btn small secondary" data-action="clear-price-override" data-id="${p.id}">Clear override (use cost-plus-margin)</button>
    </div>` : ""}
    ${p._excel_sale_price && res ? `<div class="note mt-16">
      Excel-reported sale price: <strong>${fmt.usdM(p._excel_sale_price)}</strong>
      · Dashboard: <strong>${fmt.usdM(res.kpis.total_sales)}</strong>
      · Variance: <strong class="${res.kpis.total_sales >= p._excel_sale_price ? "" : ""}">${fmt.pct((res.kpis.total_sales - p._excel_sale_price) / p._excel_sale_price, 2)}</strong>
      <span class="muted" style="margin-left:8px;">See PHASE_4_VALIDATION.md for reconciliation.</span>
    </div>` : ""}
  `;
}

// v14.4 (Phase 2.1) — Inputs screen helpers + renderer
//
// Source tag: tells the user where the current value came from.
//   "override"  — set explicitly on this project (a manual override)
//   "default"   — null on project, falls back to a global default
//   "global"    — this field IS the global default (Overheads, Taxes)
//   "scenario"  — modified by the active scenario
//   "computed"  — derived (e.g. sale_date = start + program_months)
function sourceTagFor({ kind, projectValue }) {
  if (kind === "global") return { label: "Global", title: "Applies to all projects." };
  if (kind === "scenario") return { label: "Scenario", title: "Modified by the active scenario." };
  if (kind === "computed") return { label: "Computed", title: "Derived from other fields." };
  if (kind === "project-required") return { label: "Project value", title: "Required field on every project." };
  if (kind === "project-override") {
    return projectValue == null || projectValue === ""
      ? { label: "Default", title: "Using the global default. Type a value to override." }
      : { label: "Override", title: "Manually overridden on this project." };
  }
  return { label: "", title: "" };
}

// Last-edited lookup: find the most recent audit_log entry that touched `field` on this project.
function lastEditedFor(projectId, field) {
  const log = state.audit_log || [];
  const hit = log.find(e =>
    e.detail?.project_id === projectId
    && e.detail?.changes
    && Object.prototype.hasOwnProperty.call(e.detail.changes, field)
  );
  if (!hit?.ts) return null;
  const when = new Date(hit.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const who = hit.user_email ? hit.user_email.split("@")[0] : "—";
  return `${when} · ${who}`;
}

// Render a single inputs row. Centralizes the layout per the brief:
// label · unit · current value (input) · helper · source tag · last updated
function inputRow(opts) {
  const {
    label, unit, helper,
    field,                       // data-field attribute (also used for last-edited lookup)
    value,                       // raw value (for input)
    placeholder = "",
    type = "text",               // "text" | "number" | "select"
    selectOptions,               // [{ value, label }]
    kind,                        // sourceTagFor kind
    projectId,                   // for lastEditedFor; null = global/scenario
    scope = "project",           // "project" | "global" | "scenario"
    suffix,                      // optional html shown after the input (e.g. unit display)
  } = opts;
  const src = sourceTagFor({ kind, projectValue: value });
  const last = projectId ? lastEditedFor(projectId, field) : null;
  const dataAttr = scope === "global" ? `data-global="${field}"`
                  : scope === "scenario" ? `data-scenario="${field}"`
                  : `data-field="${field}"`;
  const isOverride = kind === "project-override";
  const inputCls = `input ${isOverride && (value == null || value === "") ? "override-empty" : ""}`;
  const inputDisplay = value == null ? "" : value;
  let inputHtml;
  if (type === "select" && selectOptions) {
    inputHtml = `<select class="${inputCls}" ${dataAttr}>
      ${selectOptions.map(o => `<option value="${o.value}" ${value === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
    </select>`;
  } else if (type === "checkbox") {
    inputHtml = `<input type="checkbox" ${dataAttr} ${value ? "checked" : ""}>`;
  } else {
    inputHtml = `<input class="${inputCls}" type="${type}" ${dataAttr} value="${inputDisplay}" placeholder="${escapeHtml(placeholder)}">`;
  }
  return `<div class="input-row">
    <div class="input-row-label">
      <div class="label-text">${label}</div>
      ${unit ? `<div class="label-unit muted">${unit}</div>` : ""}
    </div>
    <div class="input-row-control">
      ${inputHtml}
      ${suffix || ""}
    </div>
    <div class="input-row-meta">
      ${src.label ? `<span class="src-tag ${src.label.toLowerCase().replace(/\s/g, "-")}" title="${escapeHtml(src.title)}">${src.label}</span>` : ""}
      ${last ? `<span class="last-edited muted">${last}</span>` : ""}
    </div>
    ${helper ? `<div class="input-row-helper muted">${helper}</div>` : ""}
  </div>`;
}

// Section panel — one per logical group, contains a stack of input rows.
function inputsSection(title, sub, rows) {
  return `<div class="panel inputs-section">
    <h3>${title}</h3>
    ${sub ? `<div class="panel-subtitle">${sub}</div>` : ""}
    <div class="input-rows">${rows.join("")}</div>
  </div>`;
}

function renderProjectInputs(p, res) {
  const g = state.globals;
  const sc = state.scenario;
  const markets = g.markets || [];
  const stageOptions = LIFECYCLE_STAGES.map(s => ({ value: s.id, label: s.label }));
  const marketOptions = markets.map(m => ({ value: m.id, label: m.name }));
  const assetOptions = ASSET_TYPES.map(t => ({ value: t.id, label: t.label }));
  const statusOptions = [
    { value: "pipeline",  label: "Pipeline" },
    { value: "committed", label: "Committed" },
  ];

  // ----- Sections per the brief -----

  const basics = inputsSection("Basics", "Identification and lifecycle status.", [
    inputRow({ label: "Project name", field: "name", value: p.name, kind: "project-required", projectId: p.id }),
    inputRow({ label: "Address", field: "address", value: p.address, kind: "project-required", projectId: p.id, placeholder: "Site address" }),
    inputRow({ label: "Entity / SPV", field: "entity_spv", value: p.entity_spv || "", kind: "project-required", projectId: p.id, placeholder: "Optional", helper: "The LLC that holds the project." }),
    inputRow({ label: "Market", field: "market", value: p.market || "hamptons", kind: "project-required", projectId: p.id, type: "select", selectOptions: marketOptions, helper: "Market multiplier affects sale price and build cost." }),
    inputRow({ label: "Asset type", field: "asset_type", value: p.asset_type || "spec_home", kind: "project-required", projectId: p.id, type: "select", selectOptions: assetOptions }),
    inputRow({ label: "Stage", field: "stage", value: p.stage || "sourcing", kind: "project-required", projectId: p.id, type: "select", selectOptions: stageOptions, helper: "Where this project sits in the lifecycle right now." }),
    inputRow({ label: "Status", field: "status", value: p.status || "pipeline", kind: "project-required", projectId: p.id, type: "select", selectOptions: statusOptions }),
  ]);

  const program = inputsSection("Program", "Build size and duration.", [
    inputRow({ label: "Villa size", unit: "sqft", field: "villa_sqft", value: p.villa_sqft, kind: "project-required", projectId: p.id, type: "number", helper: "Total conditioned floor area." }),
    inputRow({ label: "Program duration", unit: "months", field: "program_months", value: p.program_months, kind: "project-required", projectId: p.id, type: "number", helper: "Land purchase → final sale closing." }),
  ]);

  const timing = inputsSection("Timing", "Key dates. Sale date is computed from start + program months unless a closing date is set.", [
    inputRow({ label: "Start date", field: "start_date", value: p.start_date, kind: "project-required", projectId: p.id, placeholder: "YYYY-MM", helper: "Land purchase / project kick-off month." }),
    inputRow({ label: "Listing date", field: "listing_date", value: p.listing_date || "", kind: "project-override", projectId: p.id, placeholder: "YYYY-MM-DD", helper: "When you intend to list. Optional." }),
    inputRow({ label: "Under contract date", field: "under_contract_date", value: p.under_contract_date || "", kind: "project-override", projectId: p.id, placeholder: "YYYY-MM-DD" }),
    inputRow({ label: "Closing date", field: "closing_date", value: p.closing_date || "", kind: "project-override", projectId: p.id, placeholder: "YYYY-MM-DD" }),
  ]);

  const land = inputsSection("Land", null, [
    inputRow({ label: "Land cost", unit: "USD", field: "land_cost_usd", value: p.land_cost_usd, kind: "project-required", projectId: p.id, type: "number" }),
  ]);

  const buildCosts = inputsSection("Build costs", "Hard construction. Blank fields use the global default.", [
    inputRow({ label: "Build cost", unit: "$/sqft", field: "build_cost_per_sqft", value: p.build_cost_per_sqft, kind: "project-override", projectId: p.id, type: "number", placeholder: `Default: $${g.default_build_cost_per_sqft}` }),
    inputRow({ label: "Soft costs (lump sum)", unit: "USD", field: "soft_costs_lump_sum", value: p.soft_costs_lump_sum ?? 0, kind: "project-required", projectId: p.id, type: "number", helper: "Permits, design, legal, etc. Used unless the soft-cost breakdown below has nonzero values." }),
  ]);

  const kingshaus = inputsSection("Kingshaus / superstructure", "Prefab timber panel + Kingshaus contribution.", [
    inputRow({ label: "Kingshaus cost", unit: "$/sqft", field: "kingshaus_cost_per_sqft", value: p.kingshaus_cost_per_sqft, kind: "project-override", projectId: p.id, type: "number", placeholder: `Default: $${g.default_kingshaus_cost_per_sqft}` }),
  ]);

  const financing = inputsSection("Financing", "Senior construction debt. KPC LOC ($6M @ 6%) is modeled portfolio-wide and shown on the Capital screen.", [
    inputRow({ label: "Interest rate", unit: "APR (decimal)", field: "interest_rate_apr", value: p.interest_rate_apr, kind: "project-override", projectId: p.id, type: "number", placeholder: `Default: ${g.interest_rate_apr}`, helper: `Default ${(g.interest_rate_apr * 100).toFixed(2)}% — senior construction loan rate.` }),
    inputRow({ label: "Loan-to-cost (build)", unit: "decimal", field: "ltc_pct", value: p.ltc_pct, kind: "project-override", projectId: p.id, type: "number", placeholder: `Default: ${g.ltc_pct}`, helper: `Default ${(g.ltc_pct * 100).toFixed(0)}%.` }),
  ]);

  const revenue = inputsSection("Revenue", "If you have a target sale price, set it here. Otherwise leave blank and the engine derives sale from cost × (1 + margin).", [
    inputRow({ label: "Goal sale price", unit: "USD", field: "sale_price_override_usd", value: p.sale_price_override_usd, kind: "project-override", projectId: p.id, type: "number", placeholder: "Derived from cost+margin" }),
    inputRow({ label: "Sale price", unit: "$/sqft", field: "sale_price_per_sqft_override", value: p.sale_price_per_sqft_override, kind: "project-override", projectId: p.id, type: "number", placeholder: "Alternative to total $" }),
    inputRow({ label: "Target margin", unit: "decimal", field: "target_margin", value: p.target_margin, kind: "project-override", projectId: p.id, type: "number", placeholder: `Default: ${g.target_margin}`, helper: `Default ${(g.target_margin * 100).toFixed(0)}%.` }),
    inputRow({ label: "Listing price", unit: "USD", field: "listing_price_usd", value: p.listing_price_usd, kind: "project-override", projectId: p.id, type: "number", placeholder: "Set when listed" }),
    inputRow({ label: "Actual sale price", unit: "USD", field: "actual_sale_price_usd", value: p.actual_sale_price_usd, kind: "project-override", projectId: p.id, type: "number", placeholder: "Set when closed" }),
  ]);

  const overheads = inputsSection("Overheads <span class='muted' style='font-weight:400;'>· applies to all projects</span>", "Juno's annual operating expenses, spread monthly and escalated.", [
    inputRow({ label: "Annual opex", unit: "USD", field: "annual_opex_usd", value: g.annual_opex_usd, kind: "global", scope: "global", type: "number" }),
    inputRow({ label: "Opex growth rate", unit: "decimal/yr", field: "opex_growth_rate", value: g.opex_growth_rate, kind: "global", scope: "global", type: "number", placeholder: "0 = flat", helper: "Excel shows ~9% YoY growth. Default is 0 (flat)." }),
  ]);

  const taxes = inputsSection("Taxes <span class='muted' style='font-weight:400;'>· applies to all projects</span>", "Federal + state tax model. NOL carryforward is enabled.", [
    inputRow({ label: "Federal tax rate", unit: "decimal", field: "tax_rate_pct", value: g.tax_rate_pct, kind: "global", scope: "global", type: "number" }),
    inputRow({ label: "State tax rate", unit: "decimal", field: "tax_state_rate_pct", value: g.tax_state_rate_pct, kind: "global", scope: "global", type: "number" }),
    inputRow({ label: "Apply tax", field: "apply_tax", value: g.apply_tax, kind: "global", scope: "global", type: "checkbox", helper: "Toggle to show pre-tax vs after-tax view." }),
  ]);

  const scenarioOverrides = inputsSection(`Scenario overrides <span class="muted" style="font-weight:400;">· scenario: ${escapeHtml(sc.name)}</span>`, "These multipliers/deltas affect every project in the active scenario. Change scenario from the topbar.", [
    inputRow({ label: "Sale price multiplier", unit: "x", field: "sale_price_multiplier", value: sc.sale_price_multiplier ?? 1, kind: "scenario", scope: "scenario", type: "number", helper: "1.0 = no change. 1.1 = +10%." }),
    inputRow({ label: "Build cost multiplier", unit: "x", field: "build_cost_multiplier", value: sc.build_cost_multiplier ?? 1, kind: "scenario", scope: "scenario", type: "number" }),
    inputRow({ label: "Interest rate delta", unit: "bps", field: "interest_rate_delta_bps", value: sc.interest_rate_delta_bps ?? 0, kind: "scenario", scope: "scenario", type: "number" }),
    inputRow({ label: "Timing shift", unit: "months", field: "timing_shift_months", value: sc.timing_shift_months ?? 0, kind: "scenario", scope: "scenario", type: "number" }),
  ]);

  return `
    <div class="inputs-grid">
      <div class="inputs-col">${basics}${program}${timing}${land}</div>
      <div class="inputs-col">${buildCosts}${kingshaus}${financing}${revenue}</div>
    </div>
    <div class="inputs-grid">
      <div class="inputs-col">${overheads}${taxes}</div>
      <div class="inputs-col">${scenarioOverrides}</div>
    </div>
  `;
}

// v14.6 (Phase 2.3) — Top-level Capital screen
// Portfolio-wide capital orchestration: how the KPC $6M LOC is being consumed across
// the pipeline, when senior debt and the LOC are at peak, where funding gaps appear,
// total accrued LOC interest, and per-owner equity exposure.
function renderCapitalOverview(r) {
  const port = r.monthly;
  const k = r.kpis;
  const loc = state.globals.kpc_loc || {};
  const ownership = state.globals.investors || [];
  const totalEquityCalled = port.cum_equity_called?.[port.cum_equity_called.length - 1] ?? 0;
  const peakLoc = port.loc_peak_balance ?? 0;
  const peakDrawnPct = port.loc_peak_drawn_pct ?? 0;
  const totalLocInterest = port.loc_total_interest ?? 0;
  const trueEquityTotal = port.true_equity_total_drawn ?? 0;
  const breachMonths = port.cap_breach_months ?? 0;
  const peakDebt = k.max_debt_outstanding ?? 0;

  // Funding-gap banner: only show if true equity is needed (LOC exhausted)
  const gapBanner = breachMonths > 0 ? `
    <div class="note neg mb-12">
      <strong>Funding gap:</strong> The $${(loc.facility_size_usd/1e6).toFixed(0)}M KPC LOC is exhausted for ${breachMonths} month${breachMonths === 1 ? "" : "s"} of the forecast.
      ${fmt.usdM(trueEquityTotal)} of owner equity must be called pro-rata to cover the shortfall.
    </div>` : `<div class="note mb-12">
      <strong>KPC LOC sufficient:</strong> The $${(loc.facility_size_usd/1e6).toFixed(0)}M facility covers projected equity demand across the horizon. Peak draw: ${fmt.usdM(peakLoc)} (${fmt.pct(peakDrawnPct)}).
    </div>`;

  // Sources vs uses summary (portfolio)
  const totalDevCost = k.total_dev_cost ?? 0;
  const totalSales = k.total_sales ?? 0;
  const totalInterest = k.total_interest ?? 0;
  const sources = [
    { label: "Senior construction debt (peak)", value: peakDebt },
    { label: `KPC LOC drawn (peak / ${fmt.usdM(loc.facility_size_usd || 0)} cap)`, value: peakLoc },
    { label: "Owner equity calls", value: trueEquityTotal },
    { label: "Sales proceeds (gross)", value: totalSales },
  ];
  const uses = [
    { label: "Total development cost", value: totalDevCost },
    { label: "Financing (senior interest + fees)", value: totalInterest },
    { label: "KPC LOC interest (accrued)", value: -totalLocInterest },
  ];
  const rowsHtml = (list) => list.map(r => `<tr><td>${r.label}</td><td class="num">${fmt.usdM(r.value)}</td></tr>`).join("");

  // Per-owner cap-table view — pro-rata of the true_equity_total_drawn
  const ownerRowsHtml = ownership.map(o => {
    const share = o.equity_share_pct || 0;
    const ownerCall = trueEquityTotal * share;
    const ownerProfit = (k.total_profit_before_tax || 0) * share;
    return `<tr>
      <td>${escapeHtml(o.name)}</td>
      <td class="num">${fmt.pct(share, 1)}</td>
      <td class="num">${fmt.usdM(ownerCall)}</td>
      <td class="num ${ownerProfit >= 0 ? "pos" : "neg"}">${fmt.usdM(ownerProfit)}</td>
    </tr>`;
  }).join("");

  // High-level KPI strip
  return `
    <div class="row between mb-12">
      <div>
        <h1 class="page-title">Capital</h1>
        <div class="muted" style="font-size:12px;margin-top:4px;">
          ${escapeHtml(state.scenario.name)} · senior loan → KPC LOC → owner equity
        </div>
      </div>
    </div>

    ${gapBanner}

    <div class="kpi-row">
      ${kpiCard("KPC LOC peak", fmt.usdM(peakLoc), `${fmt.pct(peakDrawnPct)} of ${fmt.usdM(loc.facility_size_usd || 0)} cap`, peakDrawnPct > 0.9 ? "warn" : "")}
      ${kpiCard("LOC interest accrued", fmt.usdM(totalLocInterest), `${(loc.interest_rate_apr * 100).toFixed(1)}% APR · capitalized`)}
      ${kpiCard("Owner equity needed", fmt.usdM(trueEquityTotal), trueEquityTotal > 0 ? "Above LOC cap" : "LOC covers everything", trueEquityTotal > 0 ? "warn" : "pos")}
      ${kpiCard("Funding-gap months", `${breachMonths}`, breachMonths > 0 ? "LOC insufficient" : "All covered by LOC", breachMonths > 0 ? "neg" : "pos")}
      ${kpiCard("Senior debt peak", fmt.usdM(peakDebt), `Month: ${fmt.ymShort(k.max_debt_month)}`)}
      ${kpiCard("Total equity called", fmt.usdM(totalEquityCalled), "LOC + owner equity")}
    </div>

    <div class="panel-row">
      <div class="panel">
        <h3>KPC LOC drawdown</h3>
        <div class="panel-subtitle">Outstanding balance vs facility cap over the model horizon.</div>
        <div class="chart-frame"><canvas id="chart-loc-drawdown"></canvas></div>
      </div>
      <div class="panel">
        <h3>Capital sources stacked</h3>
        <div class="panel-subtitle">Cumulative draws: senior debt + KPC LOC + owner equity.</div>
        <div class="chart-frame"><canvas id="chart-capital-stack"></canvas></div>
      </div>
    </div>

    <div class="panel-row">
      <div class="panel">
        <h3>Sources vs Uses</h3>
        <div class="panel-subtitle">Portfolio totals across the horizon.</div>
        <div class="sources-uses">
          <div>
            <div class="section-title" style="margin-bottom:6px;">Sources</div>
            <table class="tbl">${rowsHtml(sources)}</table>
          </div>
          <div>
            <div class="section-title" style="margin-bottom:6px;">Uses</div>
            <table class="tbl">${rowsHtml(uses)}</table>
          </div>
        </div>
      </div>
      <div class="panel">
        <h3>Owner cap-table</h3>
        <div class="panel-subtitle">Equity share, owner-equity call exposure, profit allocation. KPC provides debt (not equity) via the LOC and so does not appear in this table.</div>
        <table class="tbl">
          <thead><tr><th>Owner</th><th>Share</th><th>Owner equity call</th><th>Profit share</th></tr></thead>
          <tbody>${ownerRowsHtml}</tbody>
        </table>
      </div>
    </div>
  `;
}

// v14.7 (Phase 3.1) — Top-level Risks center
// Six risk categories per the brief. Each card shows severity, trigger, financial impact,
// timing impact, and a suggested mitigation. Risks are tied to actions, not decoration.
function renderRisksCenter(r) {
  const risks = evaluateRisks(state, r);
  const sev = risks.summary;

  const severityIcon = (s) => s === "high" ? "!" : s === "medium" ? "·" : "•";
  const severityLabel = (s) => s === "high" ? "High" : s === "medium" ? "Medium" : "Low";

  const renderCard = (f) => `
    <div class="risk-finding ${f.severity}">
      <div class="risk-finding-header">
        <div class="risk-severity-chip ${f.severity}" title="${severityLabel(f.severity)} severity">${severityIcon(f.severity)} ${severityLabel(f.severity)}</div>
        <div class="risk-finding-target">
          ${f.scope === "portfolio"
            ? `<strong>Portfolio</strong>`
            : `<button class="link-btn" data-action="open-project" data-id="${f.project.id}" style="color:var(--fg);font-weight:600;text-decoration:none;">${escapeHtml(f.project.name)}</button>`}
        </div>
        <div class="risk-finding-impact">${f.financial_impact_usd < 0 ? `<span class="neg">${fmt.usdM(Math.abs(f.financial_impact_usd))}</span> at risk` : f.financial_impact_usd > 0 ? `<span class="pos">${fmt.usdM(f.financial_impact_usd)}</span> upside` : "Impact: timing only"}</div>
      </div>
      <div class="risk-finding-body">
        <div class="risk-finding-trigger"><span class="risk-label muted">Trigger:</span> ${escapeHtml(f.trigger)}</div>
        ${f.timing_impact ? `<div class="risk-finding-timing"><span class="risk-label muted">Timing:</span> ${escapeHtml(f.timing_impact)}</div>` : ""}
        <div class="risk-finding-mitigation"><span class="risk-label muted">Mitigation:</span> ${escapeHtml(f.mitigation)}</div>
      </div>
    </div>
  `;

  const categoryPanels = risks.categories.map(cat => {
    const findings = cat.findings.sort((a, b) => sevWeight(b.severity) - sevWeight(a.severity));
    const count = findings.length;
    const cardsHtml = count > 0
      ? findings.map(renderCard).join("")
      : `<div class="muted" style="font-size:12px;padding:12px 4px;">No active findings in this category.</div>`;
    return `<div class="panel risk-category">
      <div class="risk-category-header">
        <h3>${cat.label}</h3>
        <span class="risk-category-count ${count > 0 ? "active" : ""}">${count} finding${count === 1 ? "" : "s"}</span>
      </div>
      <div class="panel-subtitle" style="margin-top :10px !important;">${cat.description}</div>
      ${cardsHtml}
    </div>`;
  }).join("");

  return `
    <div class="row between mb-12">
      <div>
        <h1 class="page-title">Risks</h1>
        <div class="muted" style="font-size:12px;margin-top:4px;">${escapeHtml(state.scenario.name)} · six categories tied to actions</div>
      </div>
    </div>

    <div class="kpi-row">
      ${kpiCard("Total findings", `${sev.total}`, sev.total === 0 ? "All clear" : `${sev.high} high · ${sev.medium} medium · ${sev.low} low`, sev.high > 0 ? "neg" : sev.medium > 0 ? "warn" : "pos")}
      ${kpiCard("High severity", `${sev.high}`, "Act now", sev.high > 0 ? "neg" : "")}
      ${kpiCard("Medium severity", `${sev.medium}`, "Plan a mitigation", sev.medium > 0 ? "warn" : "")}
      ${kpiCard("Low severity", `${sev.low}`, "Monitor", sev.low > 0 ? "" : "")}
      ${kpiCard("Categories with findings", `${Object.values(sev.by_category).filter(n => n > 0).length} of 6`, "Where to focus next")}
      ${kpiCard("Capital findings", `${sev.by_category.equity_cluster + sev.by_category.funding_gap}`, "Equity / LOC pressure", (sev.by_category.equity_cluster + sev.by_category.funding_gap) > 0 ? "warn" : "")}
    </div>

    <div class="risk-category-grid">
      ${categoryPanels}
    </div>
  `;
}

function sevWeight(s) { return s === "high" ? 3 : s === "medium" ? 2 : 1; }

// v14.6 (Phase 2.3) — Project Capital tab
// Shows THIS project's contribution to the capital stack. Pro-rata of the portfolio LOC
// at each month is approximated by the project's share of total equity demand.
function renderProjectCapitalTab(p, res) {
  const k = res.kpis;
  const loc = state.globals.kpc_loc || {};

  return `
    <div class="panel mb-24">
      <h3>This project's capital stack</h3>
      <div class="panel-subtitle">Project-level view of how this villa is funded. Portfolio-wide LOC capacity is enforced on the top-level Capital screen.</div>
      <div class="kpi-row">
        ${kpiCard("Senior debt peak", fmt.usdM(k.peak_debt), `Construction loan`)}
        ${kpiCard("Equity / LOC peak", fmt.usdM(k.peak_equity), `Funded via KPC LOC until exhausted`)}
        ${kpiCard("Total dev cost", fmt.usdM(k.total_dev_cost), `Across project lifecycle`)}
        ${kpiCard("Sale proceeds", fmt.usdM(k.total_sales), `Repays debt + LOC, then owners`)}
      </div>
    </div>

    <div class="panel mb-24">
      <h3>Sources vs Uses (this project)</h3>
      <div class="panel-subtitle">Where capital comes from vs where it goes for this single project.</div>
      ${renderSourcesUses(p, res).replace(/<div class="panel">|<\/div>$/g, "").replace(/<h3>.*?<\/h3>/, "").replace(/<div class="panel-subtitle">.*?<\/div>/, "")}
    </div>

    <div class="note mb-24">
      <strong>Note on LOC allocation:</strong> The KPC LOC is portfolio-wide ($${(loc.facility_size_usd/1e6).toFixed(0)}M @ ${(loc.interest_rate_apr * 100).toFixed(1)}% APR).
      The top-level Capital screen shows the actual LOC drawdown curve and any funding gaps.
      Until the engine allocates LOC capacity per project explicitly, this tab treats "equity" as a single bucket
      (LOC + owner equity).
    </div>
  `;
}

// v14.9 (Phase 3.3) — Project Actuals tab
// Forecast vs actuals tracking for cost lines. Entry inputs sit on top, variance table below.
// Each line gets a variance flag chip with severity: on-budget / over / way over.
function renderProjectActualsTab(p, res) {
  const actuals = p.actuals || {};
  const m = res.monthly;
  const lines = [
    { key: "land",         label: "Land",                forecast: -m.land_cost.reduce((a,b)=>a+b,0) },
    { key: "construction", label: "Construction",        forecast: -m.build_cost.reduce((a,b)=>a+b,0) },
    { key: "kingshaus",    label: "Kingshaus / superstructure", forecast: -m.kingshaus.reduce((a,b)=>a+b,0) },
    { key: "soft",         label: "Soft costs",          forecast: -m.soft_cost.reduce((a,b)=>a+b,0) },
    { key: "financing",    label: "Financing",           forecast: -m.interest.reduce((a,b)=>a+b,0) },
  ];
  const totalForecast = lines.reduce((a, l) => a + l.forecast, 0);
  const totalActual = lines.reduce((a, l) => a + (actuals[l.key] || 0), 0);
  const totalVariance = totalActual - totalForecast;
  const totalVariancePct = totalForecast > 0 ? totalVariance / totalForecast : 0;

  const contingency = p.contingency_used_usd ?? 0;
  const contingencyBudget = (totalForecast * (state.globals.contingency_pct ?? 0.05));
  const contingencyBurnPct = contingencyBudget > 0 ? contingency / contingencyBudget : 0;

  const varianceFlag = (vPct) => {
    if (vPct <= 0) return { label: "On budget", cls: "ok" };
    if (vPct < 0.05) return { label: "Slight over", cls: "low" };
    if (vPct < 0.15) return { label: "Over budget", cls: "medium" };
    return { label: "Way over", cls: "high" };
  };

  const anyActuals = lines.some(l => (actuals[l.key] || 0) > 0);

  // KPI strip — top of the tab
  const totalFlag = varianceFlag(totalVariancePct);
  const kpiStrip = `<div class="kpi-row">
    ${kpiCard("Forecast", fmt.usdM(totalForecast), "Total dev cost (planned)")}
    ${kpiCard("Actual to date", fmt.usdM(totalActual), anyActuals ? "Across all lines" : "No actuals entered yet", anyActuals ? "" : "")}
    ${kpiCard("Variance", `${totalVariance >= 0 ? "+" : "−"}${fmt.usdM(Math.abs(totalVariance))}`, fmt.pct(totalVariancePct), totalVariance <= 0 ? "pos" : totalVariance < totalForecast * 0.05 ? "warn" : "neg")}
    ${kpiCard("Contingency burn", fmt.pct(contingencyBurnPct), `${fmt.usdM(contingency)} of ${fmt.usdM(contingencyBudget)} budget`, contingencyBurnPct >= 0.8 ? "neg" : contingencyBurnPct >= 0.5 ? "warn" : "pos")}
  </div>`;

  // Entry panel — number inputs side-by-side with forecast labels
  const entryRowsHtml = lines.map(l => {
    const actual = actuals[l.key] || 0;
    const variance = actual - l.forecast;
    const vPct = l.forecast > 0 ? variance / l.forecast : 0;
    const flag = actual > 0 ? varianceFlag(vPct) : null;
    return `<div class="actuals-row">
      <div class="actuals-row-label"><strong>${l.label}</strong></div>
      <div class="actuals-row-forecast">
        <div class="muted" style="font-size:10px;letter-spacing:0.04em;text-transform:uppercase;">Forecast</div>
        <div>${fmt.usdM(l.forecast)}</div>
      </div>
      <div class="actuals-row-actual">
        <div class="muted" style="font-size:10px;letter-spacing:0.04em;text-transform:uppercase;">Actual paid</div>
        <input class="input" type="number" inputmode="decimal" step="1000" data-actual="${l.key}" value="${actual}" placeholder="0">
      </div>
      <div class="actuals-row-variance">
        ${actual > 0 ? `
          <div class="muted" style="font-size:10px;letter-spacing:0.04em;text-transform:uppercase;">Variance</div>
          <div class="num ${variance <= 0 ? "pos" : "neg"}">${variance >= 0 ? "+" : "−"}${fmt.usdM(Math.abs(variance))} <span class="muted" style="font-weight:400;">(${fmt.pct(vPct)})</span></div>
        ` : `<div class="muted" style="font-size:11px;font-style:italic;">No data</div>`}
      </div>
      <div class="actuals-row-flag">
        ${flag ? `<span class="variance-flag ${flag.cls}">${flag.label}</span>` : ""}
      </div>
    </div>`;
  }).join("");

  return `
    ${kpiStrip}

    <div class="panel mb-24">
      <h3>Forecast vs actuals</h3>
      <div class="panel-subtitle">Enter the amount paid to date for each line. Variance is computed live (actual − forecast). Save is automatic.</div>
      <div class="actuals-list">
        ${entryRowsHtml}
      </div>
      <div class="actuals-row actuals-total" style="margin-top:14px;">
        <div class="actuals-row-label"><strong>Total dev cost</strong></div>
        <div class="actuals-row-forecast">
          <div class="muted" style="font-size:10px;letter-spacing:0.04em;text-transform:uppercase;">Forecast</div>
          <div><strong>${fmt.usdM(totalForecast)}</strong></div>
        </div>
        <div class="actuals-row-actual">
          <div class="muted" style="font-size:10px;letter-spacing:0.04em;text-transform:uppercase;">Actual paid</div>
          <div><strong>${fmt.usdM(totalActual)}</strong></div>
        </div>
        <div class="actuals-row-variance">
          <div class="muted" style="font-size:10px;letter-spacing:0.04em;text-transform:uppercase;">Variance</div>
          <div class="num ${totalVariance <= 0 ? "pos" : "neg"}"><strong>${totalVariance >= 0 ? "+" : "−"}${fmt.usdM(Math.abs(totalVariance))}</strong> <span class="muted" style="font-weight:400;">(${fmt.pct(totalVariancePct)})</span></div>
        </div>
        <div class="actuals-row-flag">
          <span class="variance-flag ${totalFlag.cls}">${totalFlag.label}</span>
        </div>
      </div>
    </div>

    <div class="panel mb-24">
      <h3>Contingency tracking</h3>
      <div class="panel-subtitle">${fmt.pct(state.globals.contingency_pct ?? 0.05)} standard contingency on hard costs. Drawing here absorbs cost overruns before they hit margin.</div>
      <div class="form-grid">
        <div class="form-row">
          <label>Contingency budget</label>
          <input class="input" type="text" value="${fmt.usdM(contingencyBudget)}" disabled>
          <div class="hint">${fmt.pct(state.globals.contingency_pct ?? 0.05)} × total hard cost forecast</div>
        </div>
        <div class="form-row">
          <label>Contingency drawn (USD)</label>
          <input class="input" type="number" inputmode="decimal" step="1000" data-field="contingency_used_usd" value="${contingency}">
          <div class="hint">${fmt.pct(contingencyBurnPct)} of budget consumed</div>
        </div>
      </div>
      ${contingencyBurnPct >= 0.8 ? `<div class="note neg" style="margin-top:14px;">
        <strong>Contingency nearly exhausted (${fmt.pct(contingencyBurnPct)}).</strong> Overruns from here flow directly to margin compression.
      </div>` : contingencyBurnPct >= 0.5 ? `<div class="note warn" style="margin-top:14px;">
        Contingency burn over 50%. Track closely; consider scope freeze on discretionary items.
      </div>` : ""}
    </div>

    <div class="panel mb-24">
      <h3>What's next</h3>
      <div class="muted" style="font-size:12px;line-height:1.6;">
        Phase 4 will add: <strong>notes per line</strong> (free-form explanation of overruns),
        <strong>actuals timeline view</strong> (monthly cumulative actuals vs forecast curve),
        and <strong>change order log</strong> tying contingency draws to specific events.
      </div>
    </div>
  `;
}

// v14.10 (Phase 3.4) — Project Risks tab
// Shows the per-project health checks (reused from the Summary card) PLUS any cross-portfolio
// findings from evaluateRisks() that name this project specifically. Acts as the project's
// dedicated risk register.
function renderProjectRisksTab(p, res) {
  const r = aggregatePortfolio(state.projects, state.globals, state.scenario);
  const allRisks = evaluateRisks(state, r);
  // Filter to findings about THIS project (project-scope where project.id matches)
  const findings = allRisks.all.filter(f => f.scope === "project" && f.project?.id === p.id);

  const severityChip = (s) => {
    const label = s === "high" ? "High" : s === "medium" ? "Medium" : "Low";
    const icon = s === "high" ? "!" : s === "medium" ? "·" : "•";
    return `<div class="risk-severity-chip ${s}">${icon} ${label}</div>`;
  };

  const findingsHtml = findings.length === 0
    ? `<div class="muted" style="font-size:13px;padding:24px 4px;text-align:center;">No active findings for this project. All checks within thresholds.</div>`
    : findings
        .sort((a, b) => sevWeight(b.severity) - sevWeight(a.severity))
        .map(f => `
          <div class="risk-finding ${f.severity}">
            <div class="risk-finding-header">
              ${severityChip(f.severity)}
              <div class="risk-finding-target"><strong>${escapeHtml(allRisks.categories.find(c => c.id === f.category)?.label || f.category)}</strong></div>
              <div class="risk-finding-impact">${f.financial_impact_usd < 0 ? `<span class="neg">${fmt.usdM(Math.abs(f.financial_impact_usd))}</span> at risk` : f.financial_impact_usd > 0 ? `<span class="pos">${fmt.usdM(f.financial_impact_usd)}</span> upside` : "Impact: timing only"}</div>
            </div>
            <div class="risk-finding-body">
              <div><span class="risk-label muted">Trigger:</span> ${escapeHtml(f.trigger)}</div>
              ${f.timing_impact ? `<div><span class="risk-label muted">Timing:</span> ${escapeHtml(f.timing_impact)}</div>` : ""}
              <div><span class="risk-label muted">Mitigation:</span> ${escapeHtml(f.mitigation)}</div>
            </div>
          </div>
        `).join("");

  const severityCounts = {
    high: findings.filter(f => f.severity === "high").length,
    medium: findings.filter(f => f.severity === "medium").length,
    low: findings.filter(f => f.severity === "low").length,
  };

  return `
    <div class="kpi-row">
      ${kpiCard("Active findings", `${findings.length}`, findings.length === 0 ? "All clear" : "Review and act", findings.length === 0 ? "pos" : "")}
      ${kpiCard("High severity", `${severityCounts.high}`, "Act now", severityCounts.high > 0 ? "neg" : "")}
      ${kpiCard("Medium severity", `${severityCounts.medium}`, "Plan a mitigation", severityCounts.medium > 0 ? "warn" : "")}
      ${kpiCard("Low severity", `${severityCounts.low}`, "Monitor", severityCounts.low > 0 ? "" : "")}
    </div>

    ${renderProjectRiskCards(p, res)}

    <div class="panel mb-24">
      <h3>Active findings for this project</h3>
      <div class="panel-subtitle">Sourced from the portfolio-wide risk engine. Findings here cite ${escapeHtml(p.name)} specifically.</div>
      ${findingsHtml}
    </div>

    <div class="panel mb-24">
      <h3>What's next</h3>
      <div class="muted" style="font-size:12px;line-height:1.6;">
        Future iterations: <strong>acknowledge / dismiss</strong> findings, <strong>assign owners</strong>, and
        <strong>track mitigations to completion</strong>. For now the engine recomputes on every state change,
        so resolved triggers (e.g. fixing an over-LTC project) disappear from this view automatically.
      </div>
    </div>
  `;
}

// v14.10 (Phase 3.4) — Project Activity tab
// Full chronological feed of audit_log entries that touch this project. Replaces the
// "last 5" sample on the Summary tab with a complete history view.
function renderProjectActivityTab(p) {
  const log = state.audit_log || [];
  const entries = log.filter(e => {
    if (e.detail?.project_id === p.id) return true;
    if (e.detail?.source_id === p.id || e.detail?.target_id === p.id) return true;
    if (e.message?.toLowerCase().includes((p.name || "##nope##").toLowerCase())) return true;
    return false;
  });

  if (!entries.length) {
    return `<div class="panel">
      <h3>Activity</h3>
      <div class="muted" style="font-size:13px;padding:24px 4px;text-align:center;">
        No activity recorded for this project yet. Every assumption change, scenario edit,
        and lifecycle move that touches <strong>${escapeHtml(p.name)}</strong> will appear here.
      </div>
    </div>`;
  }

  // Group entries by day
  const groups = {};
  for (const e of entries) {
    const day = e.ts ? new Date(e.ts).toISOString().slice(0, 10) : "—";
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  }
  const days = Object.keys(groups).sort().reverse();

  const dayLabel = (iso) => {
    if (iso === "—") return "Unknown date";
    const d = new Date(iso + "T00:00:00");
    const todayIso = new Date().toISOString().slice(0, 10);
    if (iso === todayIso) return "Today";
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (iso === yesterday) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  };

  const categoryChip = (cat) => {
    const map = {
      project:  { label: "Project",  cls: "in-build" },
      global:   { label: "Global",   cls: "committed" },
      scenario: { label: "Scenario", cls: "sold" },
    };
    const t = map[cat] || { label: cat, cls: "pipeline" };
    return `<span class="badge ${t.cls}" style="font-size:9px;">${t.label}</span>`;
  };

  const detailSnippet = (entry) => {
    if (!entry.detail) return "";
    const changes = entry.detail.changes;
    if (changes && typeof changes === "object") {
      const keys = Object.keys(changes).slice(0, 3);
      const summary = keys.map(k => {
        const c = changes[k];
        const prev = c?.prev == null ? "—" : (typeof c.prev === "number" ? c.prev.toLocaleString() : escapeHtml(String(c.prev)));
        const next = c?.next == null ? "—" : (typeof c.next === "number" ? c.next.toLocaleString() : escapeHtml(String(c.next)));
        return `<code>${escapeHtml(k)}</code>: ${prev} → ${next}`;
      }).join(" · ");
      const more = Object.keys(changes).length > keys.length ? ` <span class="muted">+${Object.keys(changes).length - keys.length} more</span>` : "";
      return `<div class="activity-detail muted">${summary}${more}</div>`;
    }
    return "";
  };

  return `
    <div class="kpi-row">
      ${kpiCard("Total events", `${entries.length}`, `Across ${days.length} day${days.length === 1 ? "" : "s"}`)}
      ${kpiCard("Project edits", `${entries.filter(e => e.category === "project").length}`, "Direct project changes")}
      ${kpiCard("Scenario events", `${entries.filter(e => e.category === "scenario").length}`, "Scenario changes affecting this project")}
      ${kpiCard("Last activity", entries[0]?.ts ? new Date(entries[0].ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—", "Most recent event")}
    </div>

    <div class="panel mb-24">
      <h3>Project history</h3>
      <div class="panel-subtitle">Every edit that touches ${escapeHtml(p.name)}, newest first. Synced server-side via activity_log.</div>
      <div class="activity-feed">
        ${days.map(day => `
          <div class="activity-day">
            <div class="activity-day-label">${dayLabel(day)}</div>
            <div class="activity-day-entries">
              ${groups[day].map(e => `
                <div class="activity-entry">
                  <div class="activity-entry-time muted">${e.ts ? new Date(e.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                  <div class="activity-entry-body">
                    <div class="activity-entry-line">
                      ${categoryChip(e.category)}
                      <span class="activity-entry-message">${escapeHtml(e.message || "(unspecified)")}</span>
                    </div>
                    ${detailSnippet(e)}
                    <div class="activity-entry-meta muted">${e.user_email ? escapeHtml(e.user_email) : "system"}</div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// v14.11 (Phase 4.1) — Project Sales tab
// Closes the project workspace. Tracks listing → under-contract → closing lifecycle,
// shows actuals vs forecast on the sale itself, and runs a per-project sale waterfall
// that distributes net proceeds to the 7 owners pro-rata.
function renderProjectSalesTab(p, res) {
  const k = res.kpis;
  const ownership = state.globals.investors || [];

  // Lifecycle stage helper — which step are we on?
  const lifecycleSteps = [
    { key: "listed",    label: "Listed",        date: p.listing_date,        price: p.listing_price_usd,        flag: "list" },
    { key: "uc",        label: "Under contract", date: p.under_contract_date, price: null,                       flag: "uc" },
    { key: "closed",    label: "Closed",         date: p.closing_date,        price: p.actual_sale_price_usd,    flag: "close" },
  ];
  const lastCompletedIdx = lifecycleSteps.reduce((acc, s, i) => s.date ? i : acc, -1);
  const stageId = p.stage || "sourcing";
  const inactive = ["sourcing", "land_control", "entitlement", "design", "permitting", "pre_construction", "construction"].includes(stageId);

  // KPI strip
  const grossSale = p.actual_sale_price_usd ?? p.listing_price_usd ?? k.total_sales;
  const listPrice = p.listing_price_usd;
  const actualSale = p.actual_sale_price_usd;
  const priceToList = (listPrice && actualSale) ? (actualSale / listPrice - 1) : null;
  const dom = (p.listing_date && p.under_contract_date)
    ? Math.max(0, Math.round((new Date(p.under_contract_date) - new Date(p.listing_date)) / 86400000))
    : null;
  const listingToClose = (p.listing_date && p.closing_date)
    ? Math.max(0, Math.round((new Date(p.closing_date) - new Date(p.listing_date)) / 86400000))
    : null;

  // Sale waterfall — gross sale → senior debt → KPC LOC (project share) → 7 owners pro-rata
  const totalInterest = k.total_interest || 0;          // already negative (a cost)
  const seniorDebtAtSale = k.peak_debt || 0;             // best estimate — peak debt typically near sale
  const projectEquityCalls = k.peak_equity || 0;         // total equity called for this project
  // Project's slice of portfolio LOC: use min(equity call, $6M / N projects) as a pro-rata proxy
  const activeProjects = (state.projects || []).filter(x => !["sold", "archived"].includes(x.stage || "")).length || 1;
  const locShare = Math.min(projectEquityCalls, (state.globals.kpc_loc?.facility_size_usd || 0) / activeProjects);
  const ownerEquityShare = Math.max(0, projectEquityCalls - locShare);
  // Approximate accrued LOC interest for this project (pro-rata of portfolio LOC interest)
  // Simple: project_equity_share / portfolio_total_true_equity_and_loc × total_loc_interest
  // For Phase 4.1 we'll keep this as a rough estimate; engine refinement is Phase 4.2+
  const netToOwners = grossSale - seniorDebtAtSale + (totalInterest) - locShare - ownerEquityShare;
  // Distribute to 7 owners pro-rata to share
  const distributions = ownership.map(o => ({
    name: o.name,
    share_pct: o.equity_share_pct || 0,
    distribution: netToOwners * (o.equity_share_pct || 0),
  }));

  // KPI strip rendering
  const kpiStrip = `<div class="kpi-row">
    ${kpiCard("List price",    listPrice ? fmt.usdM(listPrice) : "—", listPrice ? `Listed ${fmt.ymShort(p.listing_date)}` : "Not yet listed")}
    ${kpiCard("Days on market", dom != null ? `${dom} d` : "—",         dom != null ? "List → under contract" : "Awaiting offer")}
    ${kpiCard("Sale price",    actualSale ? fmt.usdM(actualSale) : "—",  actualSale ? `Closed ${fmt.ymShort(p.closing_date)}` : "Not yet closed")}
    ${kpiCard("Net to owners", actualSale || stageId === "sold" ? fmt.usdM(netToOwners) : "—", actualSale || stageId === "sold" ? "After debt + LOC repay" : "Pending close", actualSale && netToOwners > 0 ? "pos" : actualSale && netToOwners < 0 ? "neg" : "")}
  </div>`;

  // Lifecycle bar
  const lifecycleBar = `<div class="panel mb-24">
    <h3>Lifecycle</h3>
    <div class="panel-subtitle">Sale milestones from listing through closing. Fill in dates on the Inputs tab as the deal progresses.</div>
    <div class="sales-lifecycle">
      ${lifecycleSteps.map((s, i) => {
        const done = !!s.date;
        const isNext = !done && i === lastCompletedIdx + 1;
        const cls = done ? "done" : isNext ? "next" : "future";
        return `<div class="sales-step ${cls}">
          <div class="sales-step-marker">${done ? "✓" : i + 1}</div>
          <div class="sales-step-body">
            <div class="sales-step-label">${s.label}</div>
            <div class="sales-step-meta muted">${s.date ? fmt.ymShort(s.date) : isNext ? "next" : "—"}</div>
            ${s.price ? `<div class="sales-step-price">${fmt.usdM(s.price)}</div>` : ""}
          </div>
        </div>`;
      }).join("")}
    </div>
    ${inactive ? `<div class="note" style="margin-top:14px;">Project is in <strong>${escapeHtml(LIFECYCLE_STAGES.find(s => s.id === stageId)?.label || stageId)}</strong> — sales workflow opens once it moves into <strong>Pre-sales</strong>.</div>` : ""}
  </div>`;

  // Price-to-list summary (only if closed)
  const priceToListPanel = (listPrice && actualSale) ? `<div class="panel mb-24">
    <h3>Price realization</h3>
    <div class="panel-subtitle">Actual sale vs the list price you put in market.</div>
    <table class="tbl">
      <tbody>
        <tr><td>List price</td><td class="num">${fmt.usdM(listPrice)}</td></tr>
        <tr><td>Actual sale price</td><td class="num">${fmt.usdM(actualSale)}</td></tr>
        <tr><td><strong>Variance</strong></td><td class="num ${actualSale >= listPrice ? "pos" : "neg"}"><strong>${actualSale >= listPrice ? "+" : "−"}${fmt.usdM(Math.abs(actualSale - listPrice))}</strong> <span class="muted" style="font-weight:400;">(${fmt.pct(priceToList)})</span></td></tr>
        ${listingToClose != null ? `<tr><td>List → close</td><td class="num">${listingToClose} d</td></tr>` : ""}
      </tbody>
    </table>
  </div>` : "";

  // Sale waterfall — single table that walks gross → owners
  const waterfallPanel = `<div class="panel mb-24">
    <h3>Sale waterfall</h3>
    <div class="panel-subtitle">How proceeds flow from the buyer to the cap table. Uses ${actualSale ? `<strong>actual sale price</strong>` : `forecasted sale price`}; LOC and equity allocations are project pro-rata of the portfolio totals.</div>
    <table class="tbl">
      <tbody>
        <tr><td>Gross sale proceeds</td><td class="num pos">${fmt.usdM(grossSale)}</td></tr>
        <tr><td>Senior construction debt repayment</td><td class="num neg">${fmt.usdM(-seniorDebtAtSale)}</td></tr>
        <tr><td>Senior debt accrued interest</td><td class="num neg">${fmt.usdM(totalInterest)}</td></tr>
        <tr><td>KPC LOC repayment (project share)</td><td class="num neg">${fmt.usdM(-locShare)}</td></tr>
        <tr><td>Owner equity contribution returned</td><td class="num neg">${fmt.usdM(-ownerEquityShare)}</td></tr>
        <tr><td><strong>Net to owners</strong></td><td class="num ${netToOwners >= 0 ? "pos" : "neg"}"><strong>${fmt.usdM(netToOwners)}</strong></td></tr>
      </tbody>
    </table>
  </div>`;

  // Per-owner distribution table
  const ownerTable = `<div class="panel mb-24">
    <h3>Owner distributions</h3>
    <div class="panel-subtitle">Net proceeds distributed pro-rata to ownership share. KPC is NOT in this table — it provided debt (LOC), not equity.</div>
    <table class="tbl">
      <thead><tr><th>Owner</th><th>Share</th><th>Distribution</th></tr></thead>
      <tbody>
        ${distributions.map(d => `<tr>
          <td>${escapeHtml(d.name)}</td>
          <td class="num">${fmt.pct(d.share_pct, 1)}</td>
          <td class="num ${d.distribution >= 0 ? "pos" : "neg"}">${fmt.usdM(d.distribution)}</td>
        </tr>`).join("")}
      </tbody>
      <tfoot>
        <tr><td><strong>Total</strong></td><td class="num"><strong>100.0%</strong></td><td class="num ${netToOwners >= 0 ? "pos" : "neg"}"><strong>${fmt.usdM(netToOwners)}</strong></td></tr>
      </tfoot>
    </table>
  </div>`;

  return `
    ${kpiStrip}
    ${lifecycleBar}
    ${priceToListPanel}
    ${waterfallPanel}
    ${ownerTable}
  `;
}

// v14.5 (Phase 2.2) — Timeline tab
// A dedicated, full-width view of the project's sequence: milestones, monthly burn,
// capital pressure heatmap, sales events, and a delay simulator that previews KPI
// impact without saving anything.
function renderProjectTimelineTab(p, res) {
  return `
    ${renderTimelineHeader(p, res)}
    ${renderTimelineMilestoneBar(p, res)}
    <div class="panel mb-24">
      <h3>Monthly burn schedule</h3>
      <div class="panel-subtitle">Outflows by category — land, construction, Kingshaus, soft costs, financing.</div>
      <div class="chart-frame"><canvas id="chart-burn"></canvas></div>
    </div>
    ${renderCapitalPressureHeatmap(p, res)}
    ${renderDelaySimulator(p, res)}
    ${renderSalesEvents(p, res)}
  `;
}

function renderTimelineHeader(p, res) {
  const start = res.start_date || p.start_date;
  const sale = res.sale_date;
  const total = monthsBetween(start, sale);
  return `<div class="mb-12 muted" style="font-size:12px;">
    Project sequence from <strong style="color:var(--fg);">${fmt.ymShort(start)}</strong>
    to <strong style="color:var(--fg);">${fmt.ymShort(sale)}</strong>
    · ${total} months · scenario <strong style="color:var(--fg);">${escapeHtml(state.scenario.name)}</strong>
  </div>`;
}

// Big version of the Summary timeline. Uses the same .timeline CSS but in a full-width panel.
function renderTimelineMilestoneBar(p, res) {
  return `<div class="panel mb-24">
    <h3>Milestones</h3>
    <div class="panel-subtitle">Key dates from land control through to close.</div>
    ${renderProjectTimeline(p, res).replace(/^<div class="panel">|<\/div>$/g, "").replace(/<h3>.*?<\/h3>/, "")}
  </div>`;
}

// Capital pressure heatmap — strip of monthly cells colored by equity called that month.
function renderCapitalPressureHeatmap(p, res) {
  const m = res.monthly;
  const drawn = m.equity_drawn || [];
  const startIdx = m.dates.findIndex(d => d === res.start_date);
  const saleIdx = m.dates.findIndex(d => d === res.sale_date);
  const lo = Math.max(0, startIdx - 1);
  const hi = Math.min(m.dates.length, saleIdx + 2);
  const slice = drawn.slice(lo, hi);
  const sliceDates = m.dates.slice(lo, hi);
  const maxVal = Math.max(1, ...slice);
  const cells = slice.map((v, i) => {
    const intensity = Math.max(0, v) / maxVal;
    const opacity = intensity > 0 ? 0.15 + intensity * 0.7 : 0;
    return `<div class="heatmap-cell" style="background: rgba(159, 18, 57, ${opacity.toFixed(3)});" title="${sliceDates[i]}: ${fmt.usdM(v)}">
      <span class="heatmap-cell-label">${sliceDates[i].slice(2, 4)}-${sliceDates[i].slice(5, 7)}</span>
    </div>`;
  }).join("");
  return `<div class="panel mb-24">
    <h3>Capital pressure</h3>
    <div class="panel-subtitle">Months where you need new equity called. Darker = more capital pulled that month. Peak: ${fmt.usdM(maxVal)}.</div>
    <div class="heatmap-strip">${cells}</div>
    <div class="heatmap-legend muted">
      <span>Low</span>
      <div class="heatmap-gradient"></div>
      <span>High</span>
    </div>
  </div>`;
}

// Delay simulator — slider that shifts dates and recomputes KPIs live without saving.
function renderDelaySimulator(p, res) {
  const shift = state.ui.timeline_preview_shift ?? 0;
  // Build a hypothetical project + scenario with the shift applied, just for preview.
  const altScenario = { ...state.scenario, timing_shift_months: (state.scenario.timing_shift_months ?? 0) + shift };
  let preview = null, err = null;
  try { preview = calcProject(p, state.globals, altScenario); } catch (e) { err = e?.message; }

  const base = res.kpis;
  const alt = preview?.kpis;
  const dKpi = (label, get, fmtFn, betterDown = false) => {
    if (!alt) return kpiCard(label, "—", "—");
    const b = get(base), a = get(alt);
    const delta = a - b;
    const pos = betterDown ? delta < 0 : delta > 0;
    const cls = delta === 0 ? "" : (pos ? "pos" : "neg");
    const sign = delta > 0 ? "+" : (delta < 0 ? "−" : "");
    return kpiCard(label, fmtFn(a), `${sign}${fmtFn(Math.abs(delta))} vs current`, cls);
  };
  const dPct = (label, get, betterDown = false) => {
    if (!alt) return kpiCard(label, "—", "—");
    const b = get(base), a = get(alt);
    const delta = (a ?? 0) - (b ?? 0);
    const pos = betterDown ? delta < 0 : delta > 0;
    const cls = delta === 0 ? "" : (pos ? "pos" : "neg");
    const sign = delta > 0 ? "+" : (delta < 0 ? "−" : "");
    return kpiCard(label, fmt.pct(a), `${sign}${fmt.pct(Math.abs(delta))} vs current`, cls);
  };

  return `<div class="panel mb-24">
    <h3>Delay simulator</h3>
    <div class="panel-subtitle">Drag the slider to shift start/closing by ±months. KPIs recompute live. Nothing is saved.</div>
    <div class="delay-slider-row">
      <input type="range" id="delay-slider" min="-6" max="12" step="1" value="${shift}">
      <div class="delay-slider-value">
        <span class="delta-num">${shift > 0 ? "+" : ""}${shift}</span>
        <span class="muted" style="font-size:11px;">month${Math.abs(shift) === 1 ? "" : "s"}</span>
      </div>
      <button class="link-btn" id="delay-reset" ${shift === 0 ? 'style="visibility:hidden;"' : ""}>Reset</button>
    </div>
    ${err ? `<div class="note neg">Simulation error: ${escapeHtml(err)}</div>` : ""}
    <div class="kpi-row" style="margin-top:18px;">
      ${dKpi("Projected profit", k => k.gross_profit, fmt.usdM)}
      ${dKpi("Peak equity",      k => k.peak_equity,  fmt.usdM, true)}
      ${dKpi("Max debt",         k => k.peak_debt,    fmt.usdM, true)}
      ${dPct("IRR",              k => k.irr_annual)}
      ${dKpi("Gross sale",       k => k.total_sales,  fmt.usdM)}
      ${dPct("Margin",           k => k.profit_margin_pct)}
    </div>
  </div>`;
}

// Sales events panel — listing / under-contract / closing dates and prices.
function renderSalesEvents(p, res) {
  const events = [
    { label: "Listed",         date: p.listing_date,        price: p.listing_price_usd },
    { label: "Under contract", date: p.under_contract_date, price: null },
    { label: "Closed",         date: p.closing_date,        price: p.actual_sale_price_usd },
  ];
  const anyEvent = events.some(e => e.date);
  if (!anyEvent) {
    return `<div class="panel mb-24">
      <h3>Sales events</h3>
      <div class="muted" style="font-size:12px;">No sales events recorded yet. Once the project moves into pre-sales, fill in listing / contract / closing dates on the Inputs tab.</div>
    </div>`;
  }
  return `<div class="panel mb-24">
    <h3>Sales events</h3>
    <div class="panel-subtitle">Actuals as the deal progresses. Edit dates and prices on the Inputs tab.</div>
    <table class="tbl">
      <thead><tr><th>Event</th><th>Date</th><th>Price</th></tr></thead>
      <tbody>
        ${events.map(e => `<tr>
          <td>${e.label}</td>
          <td>${e.date ? fmt.ymShort(e.date) : "—"}</td>
          <td class="num">${e.price != null ? fmt.usdM(e.price) : "—"}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

function renderProjectMonthlyTable(res) {
  const m = res.monthly;
  const startIdx = m.dates.findIndex(d => d === res.start_date);
  const saleIdx = m.dates.findIndex(d => d === res.sale_date);
  const lo = Math.max(0, startIdx - 1);
  const hi = Math.min(m.dates.length, saleIdx + 2);
  let html = `<table class="tbl"><thead><tr><th>USD</th>`;
  for (let i = lo; i < hi; i++) html += `<th>${fmt.ymShort(m.dates[i])}</th>`;
  html += `</tr></thead><tbody>`;
  const rows = [
    ["Sales", "sales"],
    ["Land cost", "land_cost"],
    ["Build cost", "build_cost"],
    ["Kingshaus", "kingshaus"],
    ["Interest", "interest"],
    ["Debt drawn", "debt_drawn"],
    ["Debt repaid", "debt_repaid"],
    ["Debt balance", "debt_balance"],
    ["Equity drawn", "equity_drawn"],
    ["Equity returned", "equity_returned"],
    ["Equity balance", "equity_balance"],
  ];
  for (const [label, key] of rows) {
    html += `<tr><td>${label}</td>`;
    for (let i = lo; i < hi; i++) {
      const v = m[key][i];
      html += `<td class="num ${v < 0 ? "neg" : v > 0 ? "" : "muted"}">${v === 0 ? "—" : fmt.usdSigned(v)}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  return html;
}

// ---------- Cash flow view (portfolio wide grid) ----------

function renderCashflow(r) {
  const m = r.monthly;
  const horizonStart = 0, horizonEnd = m.dates.length;
  const rows = [
    ["Sales", "sales"],
    ["Land cost", "land_cost"],
    ["Construction", "build_cost"],
    ["Kingshaus", "kingshaus"],
    ["Overhead", "overhead"],
    ["Interest", "interest"],
    ["Debt drawn", "debt_drawn"],
    ["Debt repaid", "debt_repaid"],
    ["Debt balance", "debt_balance"],
    ["Equity drawn", "equity_drawn"],
    ["Equity returned", "equity_returned"],
    ["Equity balance", "equity_balance"],
    ["Net cash", "net_cash"],
  ];
  let html = `<div class="section-title">Portfolio cash flow · 49 months · all USD</div>
  <div class="panel"><div class="scroll-x"><table class="tbl"><thead><tr><th>USD</th>`;
  for (let i = horizonStart; i < horizonEnd; i++) html += `<th>${fmt.ymShort(m.dates[i])}</th>`;
  html += `<th>Total</th></tr></thead><tbody>`;
  for (const [label, key] of rows) {
    html += `<tr><td>${label}</td>`;
    let total = 0;
    for (let i = horizonStart; i < horizonEnd; i++) {
      const v = m[key][i];
      total += v;
      html += `<td class="num ${v < 0 ? "neg" : v > 0 ? "" : "muted"}">${v === 0 ? "—" : fmt.usdSigned(v)}</td>`;
    }
    html += `<td class="num"><strong>${fmt.usdSigned(total)}</strong></td></tr>`;
  }
  html += `</tbody></table></div></div>`;
  return html;
}

// ---------- Pipeline view ----------

function renderPipeline(r) {
  // Gantt: 1 row per project, bar from start to sale date
  const start0 = state.globals.model_start;
  const N = state.globals.horizon_months;
  const projects = state.projects;

  let html = `<div class="section-title">Development pipeline · ${start0} to ${r.timeline[N-1]}</div>
    <div class="panel"><div class="gantt">
      <div class="gantt-label" style="background:var(--surface);font-weight:600;">Project</div>
      <div class="gantt-track" style="background:var(--surface);">
        <div style="position:absolute;left:0;right:0;top:6px;display:flex;justify-content:space-between;font-size:10px;color:var(--fg-3);">
          ${r.timeline.filter((_,i)=>i%6===0).map(d=>`<span>${fmt.ymShort(d)}</span>`).join("")}
        </div>
      </div>`;
  for (const p of projects) {
    const startIdx = r.timeline.indexOf(p.start_date);
    const saleIdx = r.timeline.indexOf(addMonthsHelper(p.start_date, p.program_months));
    const leftPct = startIdx >= 0 ? (startIdx / N) * 100 : 0;
    const rightPct = saleIdx >= 0 ? (saleIdx / N) * 100 : 100;
    const excluded = state.scenario.excluded_project_ids.includes(p.id);
    const cls = excluded ? "pipeline" : p.status;
    html += `<div class="gantt-label">${p.name} ${stageBadge(p, excluded)}</div>
             <div class="gantt-track">
               <div class="gantt-bar ${cls}" style="left:${leftPct.toFixed(1)}%;width:${(rightPct - leftPct).toFixed(1)}%;">
                 ${fmt.ymShort(p.start_date)} → ${fmt.ymShort(addMonthsHelper(p.start_date, p.program_months))}
               </div>
             </div>`;
  }
  html += `</div></div>`;
  return html;
}

function addMonthsHelper(s, n) {
  const [y, m] = s.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// ---------- Waterfall view ----------

function renderWaterfall(r) {
  const projects = r.by_project;
  const m = r.monthly;
  const totalIn = r.kpis.total_equity_in;
  const totalOut = r.kpis.total_equity_out;
  const netGain = totalOut - totalIn;

  // Per-project equity timeline rows
  const projRows = projects.map((res) => {
    const equityIn = res.monthly.equity_drawn.reduce((a,b)=>a+b,0);
    const equityOut = res.monthly.equity_returned.reduce((a,b)=>a+b,0);
    const firstCall = res.monthly.equity_drawn.findIndex(v => v > 0);
    const lastReturn = res.monthly.equity_returned.findIndex(v => v > 0);
    const moic = res.kpis.moic || 0;
    const irr = res.kpis.irr_annual;
    const hold = (lastReturn >= 0 && firstCall >= 0) ? (lastReturn - firstCall) : null;
    return `<tr>
      <td><strong>${res.project_name}</strong></td>
      <td class="num neg">${fmt.usdM(equityIn)}</td>
      <td>${firstCall >= 0 ? fmt.ymShort(res.monthly.dates[firstCall]) : "—"}</td>
      <td class="num pos">${fmt.usdM(equityOut)}</td>
      <td>${lastReturn >= 0 ? fmt.ymShort(res.monthly.dates[lastReturn]) : "—"}</td>
      <td>${hold == null ? "—" : `${hold} mo`}</td>
      <td class="num">${moic.toFixed(2)}x</td>
      <td class="num">${irr == null ? "—" : fmt.pct(irr)}</td>
      <td class="num ${equityOut - equityIn >= 0 ? "pos" : "neg"}">${fmt.usdM(Math.abs(equityOut - equityIn))}</td>
    </tr>`;
  }).join("");

  // Annual equity flow table
  const annual = {};
  for (let i = 0; i < m.dates.length; i++) {
    const fy = "FY" + m.dates[i].slice(2, 4);
    if (!annual[fy]) annual[fy] = { drawn: 0, returned: 0 };
    annual[fy].drawn += m.equity_drawn[i];
    annual[fy].returned += m.equity_returned[i];
  }
  const yearKeys = Object.keys(annual).sort();
  let cum = 0;
  const annRows = yearKeys.map(fy => {
    cum += annual[fy].returned - annual[fy].drawn;
    return `<tr>
      <td><strong>${fy}</strong></td>
      <td class="num neg">${fmt.usdM(annual[fy].drawn)}</td>
      <td class="num pos">${fmt.usdM(annual[fy].returned)}</td>
      <td class="num ${annual[fy].returned - annual[fy].drawn >= 0 ? "pos" : "neg"}">${fmt.usdM(Math.abs(annual[fy].returned - annual[fy].drawn))}</td>
      <td class="num ${cum >= 0 ? "pos" : "neg"}">${fmt.usdM(Math.abs(cum))}</td>
    </tr>`;
  }).join("");

  return `
    <div class="section-title">Investor waterfall · KPC equity flow</div>
    <div class="kpi-row">
      ${kpiCard("Total equity in", fmt.usdM(totalIn), "Capital deployed across all projects")}
      ${kpiCard("Total equity returned", fmt.usdM(totalOut), "Distributions to KPC")}
      ${kpiCard("Net gain", fmt.usdM(netGain), `${(totalOut/Math.max(1,totalIn)).toFixed(2)}x MOIC`, netGain >= 0 ? "pos" : "neg")}
      ${kpiCard("Portfolio IRR", r.kpis.irr_annual == null ? "—" : fmt.pct(r.kpis.irr_annual), "Annualized")}
      ${kpiCard("Payback", r.kpis.payback_months == null ? "—" : fmt.months(r.kpis.payback_months), "Months to recoup deployed equity")}
      ${kpiCard("Peak deployed", fmt.usdM(r.kpis.peak_equity_required), `Peak in ${fmt.ymShort(r.kpis.peak_equity_month)}`)}
    </div>

    <div class="panel mb-24">
      <h3>Equity timeline — cumulative deployed vs returned</h3>
      <div class="panel-subtitle">Source: matches KPC Equity Flow tab structure</div>
      <div class="chart-frame"><canvas id="chart-waterfall"></canvas></div>
    </div>

    <div class="panel-row">
      <div class="panel">
        <h3>By project</h3>
        <div class="scroll-x"><table class="tbl">
          <thead><tr><th>Project</th><th>Equity in</th><th>First call</th><th>Returned</th><th>Returned at</th><th>Hold</th><th>MOIC</th><th>IRR</th><th>Gain</th></tr></thead>
          <tbody>${projRows}</tbody>
        </table></div>
      </div>
      <div class="panel">
        <h3>By fiscal year</h3>
        <div class="scroll-x"><table class="tbl">
          <thead><tr><th>FY</th><th>Equity drawn</th><th>Equity returned</th><th>Net</th><th>Cumulative net</th></tr></thead>
          <tbody>${annRows}</tbody>
        </table></div>
      </div>
    </div>

    <div class="panel mb-24">
      <h3>Monthly equity movement</h3>
      <div class="panel-subtitle">Drawn (negative) vs returned (positive) by month</div>
      <div class="chart-frame"><canvas id="chart-equity-monthly"></canvas></div>
    </div>

    ${r.waterfall && r.waterfall.length > 0 ? `
    <div class="panel mb-24">
      <h3>Equity waterfall — by investor</h3>
      <div class="panel-subtitle">Per-investor IRR/MOIC, pref/hurdle clearance, and tier-by-tier distribution split.</div>
      <div class="scroll-x"><table class="tbl">
        <thead><tr>
          <th>Investor</th><th>Role</th><th>Share</th>
          <th>Equity in</th><th>Gross distribution</th><th>Promote</th><th>Net distribution</th>
          <th>Net MOIC</th><th>IRR</th>
          <th>Pref/Hurdle</th><th>Status</th>
        </tr></thead>
        <tbody>${r.waterfall.map(w => {
          // I6 — show pref + hurdle status both, not just whichever is the highest tier cleared.
          const statusBadge = w.irr_annual == null
            ? `<span class="badge pipeline">—</span>`
            : `<span class="badge ${w.pref_cleared ? "sold" : "excluded"}" style="font-size:9px;">Pref ${w.pref_cleared ? "✓" : "✗"}</span>
               <span class="badge ${w.hurdle_cleared ? "sold" : "excluded"}" style="font-size:9px;margin-left:4px;">Hurdle ${w.hurdle_cleared ? "✓" : "✗"}</span>`;
          const promoteCell = w.is_sponsor
            ? (w.promote_received_from_lps > 0 ? `<span class="pos">+${fmt.usdM(w.promote_received_from_lps)}</span>` : "—")
            : (w.promote_paid_to_sponsor > 0 ? `<span class="neg">−${fmt.usdM(w.promote_paid_to_sponsor)}</span>` : "—");
          return `<tr>
            <td><strong>${w.name}</strong></td>
            <td>${w.is_sponsor ? '<span class="badge committed">Sponsor (GP)</span>' : '<span class="badge pipeline">LP</span>'}</td>
            <td class="num">${fmt.pct(w.share)}</td>
            <td class="num neg">${fmt.usdM(w.equity_in)}</td>
            <td class="num pos">${fmt.usdM(w.equity_out_gross)}</td>
            <td class="num">${promoteCell}</td>
            <td class="num pos">${fmt.usdM(w.net_distribution)}</td>
            <td class="num">${w.moic.toFixed(2)}x</td>
            <td class="num">${w.irr_annual == null ? "—" : fmt.pct(w.irr_annual)}</td>
            <td class="num muted">${fmt.pct(w.preferred_return_pct)} / ${fmt.pct(w.hurdle_pct)}</td>
            <td>${statusBadge}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>

      ${state.globals.apply_tax ? `
      <h3 class="mt-16">After-tax returns (per investor)</h3>
      <div class="panel-subtitle">Tax applied to net gain at each investor's configured tax rate. Loss years generate no refund.</div>
      <div class="scroll-x"><table class="tbl">
        <thead><tr>
          <th>Investor</th><th>Tax rate</th><th>Net dist. (pre-tax)</th><th>Tax paid</th><th>Net dist. (after-tax)</th><th>After-tax MOIC</th><th>After-tax IRR</th>
        </tr></thead>
        <tbody>${r.waterfall.map(w => `<tr>
          <td><strong>${w.name}</strong></td>
          <td class="num">${fmt.pct(w.tax_rate)}</td>
          <td class="num pos">${fmt.usdM(w.net_distribution)}</td>
          <td class="num neg">${fmt.usdM(w.tax_paid)}</td>
          <td class="num pos">${fmt.usdM(w.after_tax_distribution)}</td>
          <td class="num">${w.after_tax_moic.toFixed(2)}x</td>
          <td class="num">${w.after_tax_irr_annual == null ? "—" : fmt.pct(w.after_tax_irr_annual)}</td>
        </tr>`).join("")}</tbody>
      </table></div>
      ` : ""}

      <h3 class="mt-16">Distribution tiers (full European waterfall)</h3>
      <div class="panel-subtitle">5-tier: capital → preferred return → GP catch-up → to hurdle → above-hurdle carry split. GP catch-up sizes so that after tier 2+3a, sponsor has carry % of the cumulative LP pref + catch-up.</div>
      <div class="scroll-x"><table class="tbl">
        <thead><tr>
          <th>Investor</th><th>Hold</th>
          <th>1. ROC</th><th>2. Pref to LP</th><th>3a. GP catch-up</th><th>3b. To hurdle (LP)</th>
          <th>4a. Above hurdle to LP</th><th>4b. Carry to GP</th>
        </tr></thead>
        <tbody>${r.waterfall.map(w => `<tr>
          <td><strong>${w.name}</strong></td>
          <td>${w.tiers.holdYears.toFixed(1)}y</td>
          <td class="num pos">${fmt.usdM(w.tiers.tier1_return_of_capital)}</td>
          <td class="num pos">${fmt.usdM(w.tiers.tier2_pref_return)}</td>
          <td class="num ${w.is_sponsor ? "muted" : ""}">${w.is_sponsor ? "n/a (self)" : fmt.usdM(w.tiers.tier3a_gp_catchup)}</td>
          <td class="num pos">${fmt.usdM(w.tiers.tier3b_to_hurdle)}</td>
          <td class="num pos">${fmt.usdM(w.tiers.tier4_to_investor)}</td>
          <td class="num ${w.is_sponsor ? "muted" : ""}">${w.is_sponsor ? "n/a (self)" : fmt.usdM(w.tiers.tier4_to_sponsor)}</td>
        </tr>
        <tr style="background:var(--surface-2);font-weight:500;">
          <td>${w.name} — sum check</td>
          <td></td>
          <td colspan="6" class="num">
            ${(() => {
              const summed = (w.tiers.tier1_return_of_capital || 0) + (w.tiers.tier2_pref_return || 0)
                + (w.tiers.tier3a_gp_catchup || 0) + (w.tiers.tier3b_to_hurdle || 0)
                + (w.tiers.tier4_to_investor || 0) + (w.tiers.tier4_to_sponsor || 0);
              const gross = w.equity_out_gross || w.tiers.grossDistribution || 0;
              const ok = Math.abs(summed - gross) < 1;
              return `Σ all tiers = ${fmt.usdM(summed)} ${ok ? "✓ matches" : "<span class=\"neg\">≠"} gross distribution ${fmt.usdM(gross)}${ok ? "" : "</span>"}`;
            })()}
          </td>
        </tr>`).join("")}</tbody>
      </table></div>

      <div class="note mt-16">
        Tier breakdown uses a European-style waterfall with pref/hurdle thresholds compounded over each investor's holding period. Tier 4 above-hurdle is split <strong>(1 − carry)</strong> to the investor and <strong>carry</strong> to the sponsor. <strong>Sum check</strong> confirms tier columns reconcile to gross distribution — even for the sole-sponsor case where GP catch-up and carry are paid to the same entity.
      </div>
    </div>` : ""}

    ${r.hypothetical_lp ? `
    <div class="panel mb-24">
      <h3>Hypothetical: what if you brought in a co-investor?</h3>
      <div class="panel-subtitle">Simulates an LP at the specified equity share, with their pref/hurdle/carry assumptions. Adjust in Settings → Investors.</div>
      <div class="scroll-x"><table class="tbl">
        <thead><tr>
          <th>Investor</th><th>Role</th><th>Share</th>
          <th>Equity in</th><th>Gross dist.</th><th>Promote</th><th>Net dist.</th>
          <th>Net MOIC</th><th>IRR</th><th>Status</th>
        </tr></thead>
        <tbody>${r.hypothetical_lp.map(w => {
          const statusBadge = w.hurdle_cleared
            ? `<span class="badge sold">Above hurdle</span>`
            : w.pref_cleared
              ? `<span class="badge committed">Pref cleared</span>`
              : (w.irr_annual == null ? `<span class="badge pipeline">—</span>` : `<span class="badge excluded">Below pref</span>`);
          const promoteCell = w.is_sponsor
            ? (w.promote_received_from_lps > 0 ? `<span class="pos">+${fmt.usdM(w.promote_received_from_lps)}</span>` : "—")
            : (w.promote_paid_to_sponsor > 0 ? `<span class="neg">−${fmt.usdM(w.promote_paid_to_sponsor)}</span>` : "—");
          return `<tr>
            <td><strong>${w.name}</strong></td>
            <td>${w.is_sponsor ? '<span class="badge committed">Sponsor (GP)</span>' : '<span class="badge pipeline">LP</span>'}</td>
            <td class="num">${fmt.pct(w.share)}</td>
            <td class="num neg">${fmt.usdM(w.equity_in)}</td>
            <td class="num pos">${fmt.usdM(w.equity_out_gross)}</td>
            <td class="num">${promoteCell}</td>
            <td class="num pos">${fmt.usdM(w.net_distribution)}</td>
            <td class="num">${w.moic.toFixed(2)}x</td>
            <td class="num">${w.irr_annual == null ? "—" : fmt.pct(w.irr_annual)}</td>
            <td>${statusBadge}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>` : ""}

    ${r.waterfall && r.waterfall.length > 1 ? `
    <div class="panel mb-24">
      <h3>Pro-rata distribution check</h3>
      <div class="panel-subtitle">Equity shares should sum to 100%.</div>
      <table class="tbl">
        <thead><tr><th>Sum of shares</th><th>Total equity in (allocated)</th><th>Total equity out (allocated)</th></tr></thead>
        <tbody><tr>
          <td class="num"><strong>${fmt.pct(r.waterfall.reduce((a,w)=>a+w.share, 0))}</strong></td>
          <td class="num neg">${fmt.usdM(r.waterfall.reduce((a,w)=>a+w.equity_in, 0))}</td>
          <td class="num pos">${fmt.usdM(r.waterfall.reduce((a,w)=>a+w.equity_out, 0))}</td>
        </tr></tbody>
      </table>
    </div>` : ""}
  `;
}

// ---------- Scenario view ----------

function renderScenario(r) {
  const s = state.scenario;
  const cls = SCENARIO_CLASSES.find(c => c.id === (s.class || "custom")) || SCENARIO_CLASSES[4];
  const classChipHtml = `<span class="scenario-class-chip ${cls.id}" title="${cls.description}">${cls.label}</span>`;
  const lockIcon = s.locked ? `<span class="scenario-lock-icon" title="Locked as the decision scenario">🔒</span>` : "";
  return `
    <div class="row between mb-12" style="align-items:flex-start;flex-wrap:wrap;gap:12px;">
      <div>
        <h1 class="page-title">Scenarios</h1>
        <div class="muted" style="font-size:12px;margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          Active: <strong style="color:var(--fg);">${escapeHtml(s.name)}</strong>
          ${classChipHtml}
          ${lockIcon}
        </div>
      </div>
      <div class="row gap-sm wrap">
        <button class="btn" id="scn-duplicate">Duplicate scenario</button>
        ${canEdit() ? `<button class="btn secondary" id="scn-save">Save changes</button>` : ""}
        <button class="btn secondary" id="scn-reset">Reset to base</button>
      </div>
    </div>
    <div class="panel-row">
      <div class="panel">
        <h3>Active scenario</h3>
        <div class="panel-subtitle">Edit any driver and Apply to update KPIs. Classify and lock once you're confident this is the deal you're underwriting against.</div>
        <div class="form-grid">
          <div class="form-row full"><label>Scenario name</label><input class="input" id="scn-name" type="text" value="${escapeHtml(s.name)}"></div>
          <div class="form-row">
            <label>Classification</label>
            <select class="input" id="scn-class">
              ${SCENARIO_CLASSES.map(c => `<option value="${c.id}" ${cls.id === c.id ? "selected" : ""}>${c.label}</option>`).join("")}
            </select>
            <div class="hint">${cls.description}</div>
          </div>
          <div class="form-row"><label>Locked as decision</label>
            <label class="toggle" style="padding-top:4px;"><input type="checkbox" id="scn-locked" ${s.locked ? "checked" : ""}> ${s.locked ? "This is the locked decision scenario" : "Lock to mark as the canonical decision"}</label>
          </div>
          <div class="form-row"><label>Interest rate Δ (bps)</label><input class="input" id="scn-interest-bps" type="number" step="25" value="${s.interest_rate_delta_bps}"></div>
          <div class="form-row"><label>Build cost ×</label><input class="input" id="scn-build-mult" type="number" step="0.05" value="${s.build_cost_multiplier}"></div>
          <div class="form-row"><label>Sale price ×</label><input class="input" id="scn-sale-mult" type="number" step="0.05" value="${s.sale_price_multiplier}"></div>
          <div class="form-row"><label>Margin override</label><input class="input" id="scn-margin" type="number" step="0.01" value="${s.margin_override ?? ""}" placeholder="leave blank for per-project / global"></div>
          <div class="form-row"><label>Timing shift (months)</label><input class="input" id="scn-timing" type="number" step="1" value="${s.timing_shift_months}"></div>
        </div>
        <div class="row mt-16 gap-sm wrap">
          <button class="btn" id="scn-apply">Apply</button>
          <button class="btn secondary" data-preset="stress">Stress preset</button>
          <button class="btn secondary" data-preset="optimistic">Optimistic preset</button>
        </div>
      </div>
      <div class="panel">
        <h3>Project exclusions</h3>
        <div class="panel-subtitle">Toggle off any project to exclude it from portfolio totals</div>
        ${state.projects.map(p => {
          const ex = state.scenario.excluded_project_ids.includes(p.id);
          return `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--border);">
            <div><strong>${p.name}</strong> <span class="muted" style="font-size:11px;">${fmt.ymShort(p.start_date)}</span></div>
            <label class="toggle"><input type="checkbox" data-exclude-id="${p.id}" ${ex ? "" : "checked"}> ${ex ? "Excluded" : "Active"}</label>
          </div>`;
        }).join("")}
      </div>
    </div>

    <div class="panel mb-24">
      <h3>Effect of current scenario on KPIs</h3>
      <div class="panel-subtitle">Comparison vs base case (all-default scenario)</div>
      ${renderScenarioComparison()}
    </div>

    ${renderVarianceDrivers(s)}

    ${state.scenarios.length > 0 ? `
    <div class="panel mb-24">
      <h3>Saved scenarios — side-by-side KPIs</h3>
      <div class="panel-subtitle">${state.scenarios.length} saved · Click a cell to load that scenario, × to delete</div>
      ${renderSavedScenarios()}
    </div>

    <div class="panel mb-24">
      <h3>Annual P&L by scenario</h3>
      <div class="panel-subtitle">Profit before tax per FY for each saved scenario.</div>
      ${renderScenarioAnnualComparison()}
    </div>

    <div class="panel mb-24">
      <h3>Scenario overlay — cumulative equity balance over time</h3>
      <div class="panel-subtitle">Compare the equity trajectory across all saved scenarios + base + current.</div>
      <div class="chart-frame tall"><canvas id="chart-scenario-overlay"></canvas></div>
    </div>

    <div class="panel mb-24">
      <h3>Scenario overlay — monthly net cash flow</h3>
      <div class="panel-subtitle">Compare cash flow profiles across scenarios.</div>
      <div class="chart-frame tall"><canvas id="chart-scenario-cashflow"></canvas></div>
    </div>` : ""}
  `;
}

function renderScenarioAnnualComparison() {
  const baseScn = { name:"Base", interest_rate_delta_bps:0, build_cost_multiplier:1, sale_price_multiplier:1, margin_override:null, timing_shift_months:0, excluded_project_ids:[] };
  const scenarios = [baseScn, state.scenario, ...state.scenarios.filter(s => s.name !== state.scenario.name && s.name !== "Base")];
  const results = scenarios.map(s => ({ scn: s, r: aggregatePortfolio(state.projects, state.globals, s) }));
  // Collect all FY keys across scenarios
  const fySet = new Set();
  for (const x of results) for (const fy of Object.keys(x.r.annual)) fySet.add(fy);
  const years = Array.from(fySet).sort();

  const metrics = [
    ["Sales", "sales"],
    ["Profit before tax", "profit_before_tax"],
  ];
  let html = `<div class="scroll-x"><table class="tbl"><thead><tr><th>Scenario</th><th>Metric</th>${years.map(y => `<th>${y}</th>`).join("")}<th>Total</th></tr></thead><tbody>`;
  for (const x of results) {
    for (const [label, key] of metrics) {
      let total = 0;
      const cells = years.map(y => {
        const v = x.r.annual[y]?.[key] ?? 0;
        total += v;
        return `<td class="num ${v < 0 ? "neg" : v > 0 ? "pos" : "muted"}">${fmt.usdSigned(v)}</td>`;
      }).join("");
      const isCurrent = x.scn.name === state.scenario.name;
      html += `<tr>
        <td>${isCurrent ? "<strong>" : ""}${x.scn.name}${isCurrent ? " (current)</strong>" : ""}</td>
        <td>${label}</td>
        ${cells}
        <td class="num ${total < 0 ? "neg" : "pos"}"><strong>${fmt.usdSigned(total)}</strong></td>
      </tr>`;
    }
  }
  html += `</tbody></table></div>`;
  return html;
}

function renderSavedScenarios() {
  const baseScn = { name:"Base", interest_rate_delta_bps:0, build_cost_multiplier:1, sale_price_multiplier:1, margin_override:null, timing_shift_months:0, excluded_project_ids:[] };
  const scenarios = [baseScn, ...state.scenarios];
  const results = scenarios.map(s => ({ scn: s, r: aggregatePortfolio(state.projects, state.globals, s) }));
  const metrics = [
    ["Total profit pre-tax", r => r.kpis.total_profit_before_tax, "usdM"],
    ["Total sales", r => r.kpis.total_sales, "usdM"],
    ["Peak equity", r => r.kpis.peak_equity_required, "usdM"],
    ["Max debt", r => r.kpis.max_debt_outstanding, "usdM"],
    ["MOIC", r => r.kpis.moic_gross, "moic"],
    ["IRR (annual)", r => r.kpis.irr_annual, "pct"],
    ["Payback (months)", r => r.kpis.payback_months, "months"],
  ];
  const fmtFn = {
    usdM: fmt.usdM,
    moic: v => v == null ? "—" : `${v.toFixed(2)}x`,
    pct: v => v == null ? "—" : fmt.pct(v),
    months: v => v == null ? "—" : `${v} mo`,
  };
  let html = `<div class="scroll-x"><table class="tbl"><thead><tr><th>Metric</th>`;
  for (const x of results) {
    const cls = SCENARIO_CLASSES.find(c => c.id === (x.scn.class || (x.scn === baseScn ? "base" : "custom")));
    const chip = `<span class="scenario-class-chip ${cls?.id || 'custom'} small">${cls?.label || "Custom"}</span>`;
    const lockIcon = x.scn.locked ? `<span class="scenario-lock-icon" title="Locked as the decision scenario">🔒</span>` : "";
    const deleteBtn = x.scn !== baseScn && !x.scn.locked
      ? ` <button class="btn small danger" data-delete-scenario="${x.scn.name}" style="margin-left:6px;padding:0 6px;">×</button>`
      : "";
    const lockBtn = x.scn !== baseScn
      ? ` <button class="link-btn small" data-toggle-lock="${x.scn.name}" style="margin-left:4px;font-size:10px;">${x.scn.locked ? "Unlock" : "Lock"}</button>`
      : "";
    html += `<th><div style="display:flex;flex-direction:column;gap:2px;align-items:flex-start;">
      <div style="display:flex;align-items:center;gap:4px;">${escapeHtml(x.scn.name)} ${lockIcon}${deleteBtn}</div>
      <div style="display:flex;align-items:center;gap:4px;">${chip}${lockBtn}</div>
    </div></th>`;
  }
  html += `</tr></thead><tbody>`;
  for (const [label, getter, fmtKey] of metrics) {
    const base = getter(results[0].r);
    html += `<tr><td>${label}</td>`;
    for (const x of results) {
      const v = getter(x.r);
      const isCurrent = x.scn === results[0].scn;
      const cls = isCurrent ? "muted" : (v >= base ? "pos" : "neg");
      html += `<td class="num ${cls}" data-load-scenario="${x.scn.name}" style="cursor:pointer;">${fmtFn[fmtKey](v)}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;
  return html;
}

// v14.8 (Phase 3.2) — Variance drivers: explains which scenario assumptions are
// different from base, so users can read the KPI deltas with context.
function renderVarianceDrivers(s) {
  const drivers = [];
  if ((s.interest_rate_delta_bps ?? 0) !== 0) {
    drivers.push({
      label: "Interest rate",
      value: `${s.interest_rate_delta_bps > 0 ? "+" : ""}${s.interest_rate_delta_bps} bps`,
      effect: s.interest_rate_delta_bps > 0
        ? "Higher financing cost; compresses profit."
        : "Lower financing cost; lifts profit.",
    });
  }
  if ((s.build_cost_multiplier ?? 1) !== 1) {
    const pct = (s.build_cost_multiplier - 1) * 100;
    drivers.push({
      label: "Build cost",
      value: `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`,
      effect: pct > 0
        ? "Higher hard costs; compresses margin unless sale price keeps up."
        : "Lower hard costs; expands margin.",
    });
  }
  if ((s.sale_price_multiplier ?? 1) !== 1) {
    const pct = (s.sale_price_multiplier - 1) * 100;
    drivers.push({
      label: "Sale price",
      value: `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`,
      effect: pct > 0
        ? "Stronger pricing; lifts profit dollar-for-dollar."
        : "Softer pricing; reduces profit dollar-for-dollar.",
    });
  }
  if (s.margin_override != null && s.margin_override !== "") {
    drivers.push({
      label: "Margin override",
      value: `${(Number(s.margin_override) * 100).toFixed(0)}%`,
      effect: "Forces target margin across the portfolio; sale prices are derived to hit it.",
    });
  }
  if ((s.timing_shift_months ?? 0) !== 0) {
    drivers.push({
      label: "Timing shift",
      value: `${s.timing_shift_months > 0 ? "+" : ""}${s.timing_shift_months} months`,
      effect: s.timing_shift_months > 0
        ? "All projects pushed later; can change interest accrual and fiscal-year tax recognition."
        : "All projects pulled forward; capital cycles faster.",
    });
  }
  if ((s.excluded_project_ids || []).length > 0) {
    const names = (s.excluded_project_ids || [])
      .map(id => state.projects.find(p => p.id === id)?.name)
      .filter(Boolean);
    drivers.push({
      label: "Excluded projects",
      value: `${names.length}`,
      effect: `Removed from portfolio totals: ${names.join(", ")}.`,
    });
  }

  if (drivers.length === 0) {
    return `<div class="panel mb-24">
      <h3>Variance drivers</h3>
      <div class="muted" style="font-size:12px;">This scenario matches base — no overrides active. Edit any driver above and apply to see what changes.</div>
    </div>`;
  }
  return `<div class="panel mb-24">
    <h3>Variance drivers</h3>
    <div class="panel-subtitle">What's different in this scenario vs base, and how each change moves the KPIs.</div>
    <table class="tbl">
      <thead><tr><th>Driver</th><th>Change</th><th>Why it matters</th></tr></thead>
      <tbody>
        ${drivers.map(d => `<tr>
          <td><strong>${d.label}</strong></td>
          <td class="num">${d.value}</td>
          <td style="max-width:500px;">${d.effect}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

function renderScenarioComparison() {
  const base = aggregatePortfolio(state.projects, state.globals,
    { name:"Base", interest_rate_delta_bps:0, build_cost_multiplier:1, sale_price_multiplier:1, margin_override:null, timing_shift_months:0, excluded_project_ids:[] });
  const cur = aggregatePortfolio(state.projects, state.globals, state.scenario);
  const rows = [
    ["Total profit (pre-tax)", "total_profit_before_tax"],
    ["Peak equity required", "peak_equity_required"],
    ["Max debt outstanding", "max_debt_outstanding"],
    ["Total sales", "total_sales"],
    ["Total interest paid", "total_interest"],
    ["Gross MOIC", "moic_gross"],
  ];
  return `<table class="tbl">
    <thead><tr><th>KPI</th><th>Base case</th><th>${state.scenario.name}</th><th>Δ</th></tr></thead>
    <tbody>
      ${rows.map(([label, key]) => {
        const b = base.kpis[key], c = cur.kpis[key];
        const isMOIC = key === "moic_gross";
        const isCount = key === "active_project_count";
        const d = c - b;
        return `<tr>
          <td>${label}</td>
          <td class="num">${isMOIC ? b.toFixed(2)+"x" : fmt.usdM(b)}</td>
          <td class="num">${isMOIC ? c.toFixed(2)+"x" : fmt.usdM(c)}</td>
          <td class="num ${d>=0?"pos":"neg"}">${isMOIC ? (d>=0?"+":"")+d.toFixed(2)+"x" : (d>=0?"+":"")+fmt.usdM(d)}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>`;
}

// ---------- Sensitivity view ----------

// v13.1 — helper: produce a projects array with sale prices pinned so cost shocks don't
// perversely raise sale price via cost-plus-margin. Sensitivity must compare like-for-like.
function projectsWithPinnedSalePrice(projects, baselineResult) {
  return projects.map(p => {
    const projRes = baselineResult?.by_project?.find(x => x.project_id === p.id);
    const pinnedSale = p.sale_price_override_usd ?? projRes?.kpis?.total_sales ?? null;
    return pinnedSale ? { ...p, sale_price_override_usd: pinnedSale } : p;
  });
}

function renderSensitivity(r) {
  const baseProfit = r.kpis.total_profit_before_tax;
  // Pin sale prices so build-cost / interest / timing shocks don't move sale price via cost-plus.
  const pinnedProjects = projectsWithPinnedSalePrice(state.projects, r);

  // Tornado factors. "Margin target" intentionally excluded — with sale prices pinned, margin shocks no-op.
  const factors = [
    { name: "Sale price",       low: { sale_price_multiplier: 0.95 }, high: { sale_price_multiplier: 1.05 } },
    { name: "Build cost",       low: { build_cost_multiplier: 1.10 }, high: { build_cost_multiplier: 0.90 } },
    { name: "Interest rate",    low: { interest_rate_delta_bps: 200 }, high: { interest_rate_delta_bps: -200 } },
    { name: "Timing (months)",  low: { timing_shift_months: 3 },        high: { timing_shift_months: -3 } },
  ];
  const tornadoData = factors.map(f => {
    const lowAlt = aggregatePortfolio(pinnedProjects, state.globals, { ...state.scenario, ...f.low });
    const highAlt = aggregatePortfolio(pinnedProjects, state.globals, { ...state.scenario, ...f.high });
    return {
      label: f.name,
      low: lowAlt.kpis.total_profit_before_tax - baseProfit,
      high: highAlt.kpis.total_profit_before_tax - baseProfit,
    };
  });
  tornadoData.sort((a, b) => Math.max(Math.abs(b.low), Math.abs(b.high)) - Math.max(Math.abs(a.low), Math.abs(a.high)));
  if (typeof window !== "undefined") window.__tornadoData = tornadoData;

  const tests = [
    { label: "Interest rate +200bps", patch: { interest_rate_delta_bps: 200 } },
    { label: "Interest rate -200bps", patch: { interest_rate_delta_bps: -200 } },
    { label: "Build cost +10%", patch: { build_cost_multiplier: 1.1 } },
    { label: "Build cost -10%", patch: { build_cost_multiplier: 0.9 } },
    { label: "Sale price +5%", patch: { sale_price_multiplier: 1.05 } },
    { label: "Sale price -5%", patch: { sale_price_multiplier: 0.95 } },
    { label: "Timing slip +3 months", patch: { timing_shift_months: 3 } },
    { label: "Timing pull-forward -3 months", patch: { timing_shift_months: -3 } },
  ];
  const rows = tests.map((t) => {
    const altScn = { ...state.scenario, ...t.patch };
    const alt = aggregatePortfolio(pinnedProjects, state.globals, altScn);
    const d = alt.kpis.total_profit_before_tax - baseProfit;
    const deq = alt.kpis.peak_equity_required - r.kpis.peak_equity_required;
    return `<tr>
      <td>${t.label}</td>
      <td class="num">${fmt.usdM(alt.kpis.total_profit_before_tax)}</td>
      <td class="num ${d>=0?"pos":"neg"}">${(d>=0?"+":"")}${fmt.usdM(d)}</td>
      <td class="num">${fmt.usdM(alt.kpis.peak_equity_required)}</td>
      <td class="num ${deq<=0?"pos":"neg"}">${(deq>=0?"+":"")}${fmt.usdM(deq)}</td>
    </tr>`;
  }).join("");

  // C2 fix: heatmap is HEAVY (42 portfolio recomputes). Only build it when the user asks for it.
  const hmRendered = window.__sensitivityHeatmap || null;
  let hmHtml = "";
  if (hmRendered) {
    const { hmRows: rowsHtml, signature } = hmRendered;
    // Stale-check: regenerate if scenario changed since cached
    const currentSig = `${state.scenario.name}|${JSON.stringify(state.scenario)}|${state.projects.length}`;
    if (signature !== currentSig) {
      delete window.__sensitivityHeatmap;
      hmHtml = renderHeatmapPlaceholder();
    } else {
      hmHtml = `<div class="scroll-x"><table class="tbl">
        <thead><tr><th>Interest \\ Build</th>${[0.90, 0.95, 1.00, 1.05, 1.10, 1.15].map(bc => `<th>${(bc*100).toFixed(0)}%</th>`).join("")}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>`;
    }
  } else {
    hmHtml = renderHeatmapPlaceholder();
  }

  return `
    <div class="section-title">Sensitivity · single-factor swings vs current scenario</div>
    <div class="panel mb-24">
      <h3>Tornado — profit impact ranked by driver</h3>
      <div class="panel-subtitle">Δ profit at ±5–10% / ±200bps swings on each driver. Red = downside, green = upside.</div>
      <div class="chart-frame tall"><canvas id="chart-tornado"></canvas></div>
    </div>
    <div class="panel mb-24">
      <h3>Two-way heatmap — Profit at varying interest rate × build cost</h3>
      <div class="panel-subtitle">Total profit before tax (USD). Rows = interest rate delta. Columns = build cost multiplier. Outlined cell = current scenario.</div>
      ${hmHtml}
    </div>
    <div class="panel">
      <h3>Detailed swings (table)</h3>
      <table class="tbl">
        <thead><tr><th>Stress</th><th>Profit</th><th>Δ profit</th><th>Peak equity</th><th>Δ equity</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderHeatmapPlaceholder() {
  const progress = window.__heatmapProgress;
  if (progress) {
    return `<div style="text-align:center;padding:24px;">
      <div class="muted" style="font-size:12px;margin-bottom:12px;">Computing… ${progress.current} / ${progress.total} scenarios</div>
      <div style="height:4px;background:var(--surface-3);border-radius:2px;max-width:240px;margin:0 auto;overflow:hidden;">
        <div style="height:100%;width:${(progress.current / progress.total * 100).toFixed(0)}%;background:var(--accent);transition:width 0.1s;"></div>
      </div>
    </div>`;
  }
  return `<div style="text-align:center;padding:24px;">
    <div class="muted" style="font-size:12px;margin-bottom:12px;">Two-way heatmap is heavy to compute (42 portfolio recomputes). Runs in a background worker so the UI stays responsive.</div>
    <button class="btn" id="compute-heatmap">Compute heatmap</button>
  </div>`;
}

async function computeAndRenderHeatmap() {
  const baselineR = aggregatePortfolio(state.projects, state.globals, state.scenario);
  const pinnedProjects = projectsWithPinnedSalePrice(state.projects, baselineR);
  const irSteps = [-200, -100, 0, 100, 200, 300, 400];
  const bcSteps = [0.90, 0.95, 1.00, 1.05, 1.10, 1.15];
  window.__heatmapProgress = { current: 0, total: irSteps.length * bcSteps.length };
  notify();
  let result;
  try {
    result = await runInWorker(
      "heatmap",
      {
        projects: pinnedProjects,
        globals: state.globals,
        scenario: state.scenario,
        axes: {
          rows: { key: "interest_rate_delta_bps", values: irSteps },
          cols: { key: "build_cost_multiplier",  values: bcSteps },
        },
      },
      (p) => { window.__heatmapProgress = p; notify(); }
    );
  } catch (err) {
    // Fallback: main-thread compute
    let hmMin = Infinity, hmMax = -Infinity;
    const grid = irSteps.map(ir => bcSteps.map(bc => {
      const alt = aggregatePortfolio(pinnedProjects, state.globals,
        { ...state.scenario, interest_rate_delta_bps: ir, build_cost_multiplier: bc });
      const v = alt.kpis.total_profit_before_tax;
      if (v < hmMin) hmMin = v;
      if (v > hmMax) hmMax = v;
      return v;
    }));
    result = { grid, hmMin, hmMax, rows: irSteps, cols: bcSteps };
  } finally {
    window.__heatmapProgress = null;
  }
  const { grid, hmMin, hmMax } = result;
  const cellColor = (v) => v >= 0
    ? `rgba(31, 122, 77, ${0.15 + 0.55 * (hmMax === 0 ? 0 : v / Math.max(1, hmMax))})`
    : `rgba(179, 38, 30, ${0.15 + 0.55 * (hmMin === 0 ? 0 : v / hmMin)})`;
  const hmRows = irSteps.map((ir, i) => {
    const cells = bcSteps.map((bc, j) => {
      const v = grid[i][j];
      const isBase = ir === 0 && bc === 1.0;
      return `<td class="num" style="background:${cellColor(v)};${isBase ? "border:2px solid var(--accent);" : ""}">${fmt.usdM(v)}</td>`;
    }).join("");
    return `<tr><td><strong>${ir >= 0 ? "+" : ""}${ir} bps</strong></td>${cells}</tr>`;
  }).join("");
  const signature = `${state.scenario.name}|${JSON.stringify(state.scenario)}|${state.projects.length}`;
  window.__sensitivityHeatmap = { hmRows, signature };
  notify();
}

// ---------- Risk (Monte Carlo) view ----------

const DEFAULT_DISTRIBUTIONS = {
  build_cost_multiplier: { type: "triangular", min: 0.92, mode: 1.00, max: 1.20, label: "Build cost ×" },
  sale_price_multiplier: { type: "triangular", min: 0.85, mode: 1.00, max: 1.10, label: "Sale price ×" },
  interest_rate_delta_bps: { type: "triangular", min: -150, mode: 0, max: 400, label: "Interest Δ (bps)" },
  timing_shift_months: { type: "triangular", min: -1, mode: 0, max: 6, label: "Timing slip (months)" },
};

function renderRisk(r) {
  const mc = window.__mcResult;
  const distributions = window.__mcDistributions || DEFAULT_DISTRIBUTIONS;
  const trials = window.__mcTrials || 1000;

  const distRows = Object.entries(distributions).map(([key, d]) => {
    return `<div class="row gap-sm wrap" style="padding:6px 0;border-bottom:1px solid var(--border);">
      <div style="flex:2;font-weight:500;font-size:12px;">${d.label || key}</div>
      <input class="input" style="flex:1;" type="number" step="0.01" data-dist="${key}" data-edge="min" value="${d.min}" placeholder="min">
      <input class="input" style="flex:1;" type="number" step="0.01" data-dist="${key}" data-edge="mode" value="${d.mode}" placeholder="mode">
      <input class="input" style="flex:1;" type="number" step="0.01" data-dist="${key}" data-edge="max" value="${d.max}" placeholder="max">
    </div>`;
  }).join("");

  const summaryTable = mc ? `
    <div class="scroll-x"><table class="tbl">
      <thead><tr><th>Outcome</th><th>Min</th><th>P10</th><th>P25</th><th>P50 (median)</th><th>Mean</th><th>P75</th><th>P90</th><th>Max</th><th>P(loss)</th></tr></thead>
      <tbody>
        ${[
          ["Profit pre-tax", "profit_pre_tax", "usdM"],
          ["Profit after-tax", "profit_after_tax", "usdM"],
          ["Peak equity", "peak_equity", "usdM"],
          ["Max debt", "max_debt", "usdM"],
          ["MOIC", "moic", "moic"],
          ["IRR (annual)", "irr_annual", "pct"],
          ["Yield on cost", "yield_on_cost", "pct"],
        ].map(([label, key, fmtKey]) => {
          const s = mc.summary[key];
          if (!s) return "";
          const fmtFn = { usdM: fmt.usdM, moic: v => `${v.toFixed(2)}x`, pct: v => fmt.pct(v) }[fmtKey];
          return `<tr>
            <td><strong>${label}</strong></td>
            <td class="num">${fmtFn(s.min)}</td>
            <td class="num">${fmtFn(s.p10)}</td>
            <td class="num">${fmtFn(s.p25)}</td>
            <td class="num"><strong>${fmtFn(s.p50)}</strong></td>
            <td class="num muted">${fmtFn(s.mean)}</td>
            <td class="num">${fmtFn(s.p75)}</td>
            <td class="num">${fmtFn(s.p90)}</td>
            <td class="num">${fmtFn(s.max)}</td>
            <td class="num ${s.prob_loss != null && s.prob_loss > 0.10 ? "neg" : s.prob_loss != null ? "pos" : "muted"}">${s.prob_loss != null ? fmt.pct(s.prob_loss, 1) : "—"}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>
  ` : `<div class="note">Configure distributions above and click <strong>Run simulation</strong>. Each trial samples one value from each distribution, runs the full portfolio model, and the results are aggregated into a percentile distribution.</div>`;

  return `
    <div class="section-title">Risk — Monte Carlo stress test</div>

    <div class="panel-row">
      <div class="panel">
        <h3>Driver distributions (triangular)</h3>
        <div class="panel-subtitle">Each driver samples from a triangular distribution [min, mode, max]. Mode is the most likely value.</div>
        ${distRows}
        <div class="row gap-sm mt-16">
          <input class="input" id="mc-trials" type="number" step="100" min="100" max="10000" value="${trials}" style="max-width:120px;" placeholder="trials">
          <button class="btn" id="run-mc">Run simulation</button>
          <button class="btn secondary" id="reset-mc-dist">Reset distributions</button>
          ${mc ? `<span class="muted" style="font-size:11px;align-self:center;">Last run: ${mc.trials} trials</span>` : ""}
        </div>
      </div>
      <div class="panel">
        <h3>Quick interpretation</h3>
        <div class="panel-subtitle">What this means for management decisions.</div>
        ${mc ? (() => {
          const profit = mc.summary.profit_pre_tax;
          const equity = mc.summary.peak_equity;
          return `
            <ul style="margin:0;padding-left:16px;font-size:12px;">
              <li>P10 (downside) profit: <strong>${fmt.usdM(profit.p10)}</strong> — 90% chance you do better.</li>
              <li>P50 (median) profit: <strong>${fmt.usdM(profit.p50)}</strong> — most likely outcome.</li>
              <li>P90 (upside) profit: <strong>${fmt.usdM(profit.p90)}</strong> — 10% chance you do better.</li>
              <li>Range of profit outcomes: ${fmt.usdM(profit.max - profit.min)} (P90 − P10 = ${fmt.usdM(profit.p90 - profit.p10)}).</li>
              <li>Peak equity stays in <strong>${fmt.usdM(equity.p10)} – ${fmt.usdM(equity.p90)}</strong> in 80% of scenarios.</li>
              <li>Probability of loss: <strong>${fmt.pct(profit.prob_loss, 1)}</strong>.</li>
            </ul>
          `;
        })() : `<div class="muted" style="font-size:12px;">Run a simulation to see the interpretation.</div>`}
      </div>
    </div>

    ${mc ? `
    <div class="panel mb-24">
      <h3>Outcome percentiles</h3>
      <div class="panel-subtitle">${mc.trials.toLocaleString()} simulations × ${state.projects.length} projects × ${state.globals.horizon_months} months.</div>
      ${summaryTable}
    </div>

    <div class="panel-row">
      <div class="panel">
        <h3>Profit distribution (histogram)</h3>
        <div class="chart-frame"><canvas id="chart-mc-profit"></canvas></div>
      </div>
      <div class="panel">
        <h3>Peak equity distribution</h3>
        <div class="chart-frame"><canvas id="chart-mc-equity"></canvas></div>
      </div>
    </div>` : ""}
  `;
}

function renderMcCharts(isDark) {
  const mc = window.__mcResult;
  if (!mc) return;

  for (const [chartId, key, color] of [
    ["chart-mc-profit", "profit_pre_tax", "#2058a8"],
    ["chart-mc-equity", "peak_equity", "#b3261e"],
  ]) {
    destroyChart(chartId);
    const ctx = document.getElementById(chartId);
    if (!ctx) continue;
    const values = mc.summary[key].sorted;
    const bins = 20;
    const min = values[0], max = values[values.length - 1];
    const binSize = (max - min) / bins;
    const counts = new Array(bins).fill(0);
    const labels = [];
    for (let i = 0; i < bins; i++) {
      const lo = min + i * binSize;
      labels.push(fmt.usdM(lo + binSize / 2));
    }
    for (const v of values) {
      let idx = Math.min(bins - 1, Math.floor((v - min) / binSize));
      counts[idx]++;
    }
    charts[chartId] = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Trials", data: counts, backgroundColor: color }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 10 } }, y: { beginAtZero: true } },
        plugins: { legend: { display: false } },
      },
    });
  }
}

// ---------- Users view (super_admin only) ----------

let _usersCache = null;
async function loadUsers() {
  _usersCache = await fetchAllProfiles();
  notify();
}
function renderUsers() {
  if (!isSuperAdmin()) {
    return `<div class="note neg">You need super-admin privileges to access this view.</div>`;
  }
  // Trigger async load if no cache
  if (_usersCache == null) {
    _usersCache = [];
    loadUsers();
  }
  const rows = _usersCache.map(u => {
    const isCurrent = u.id === state.auth.user?.id;
    const created = new Date(u.created_at).toLocaleDateString();
    return `<tr>
      <td>${u.display_name || u.email.split("@")[0]}${isCurrent ? ' <span class="muted" style="font-size:10px;">(you)</span>' : ''}</td>
      <td class="muted">${u.email}</td>
      <td>${created}</td>
      <td>
        <select class="input" data-set-role="${u.id}" style="max-width:160px;">
          <option value="viewer_basic" ${u.role === "viewer_basic" ? "selected" : ""}>Basic viewer (no $)</option>
          <option value="viewer" ${u.role === "viewer" ? "selected" : ""}>Viewer (full read)</option>
          <option value="editor" ${u.role === "editor" ? "selected" : ""}>Editor</option>
          <option value="super_admin" ${u.role === "super_admin" ? "selected" : ""}>Super admin</option>
        </select>
      </td>
    </tr>`;
  }).join("");
  return `
    <div class="row between mb-12">
      <div class="section-title" style="margin:0;">Users · ${_usersCache.length} ${_usersCache.length === 1 ? "person" : "people"}</div>
      <button class="btn secondary" id="refresh-users">Refresh</button>
    </div>
    <div class="panel">
      <div class="panel-subtitle">As super-admin, you control who can sign in and what they can do. Change a role from the dropdown — it takes effect on their next page load.</div>
      <div class="scroll-x"><table class="tbl">
        <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Role</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted center">Loading…</td></tr>`}</tbody>
      </table></div>
    </div>
    <div class="note mt-16">
      <strong>How to invite someone:</strong> Send them the dashboard URL. They click "Need an account?" on the sign-in screen and create their own account with their email. Their account starts as <strong>Viewer</strong> by default — promote them here once they've signed up.
    </div>
  `;
}

// ---------- LLM assistant chat panel ----------

const assistantState = { messages: [], busy: false, quota: null, mode: "query" };

// v14.23 — Thinking-indicator timer. Lives at module scope so the elapsed
// counter survives partial re-renders during the in-flight LLM request.
let _thinkingTimer = null;
let _thinkingStartedAt = null;

async function refreshAssistantQuota() {
  try { assistantState.quota = await fetchMyLlmQuota(); } catch { /* ignore */ }
}

// v14.13 (Phase 4.3) — Welcome state for Ask Juno with contextual nudges.
// Heuristic recommendations based on current portfolio + risk state. Clicking a chip
// drops the prepared question into the input so users can edit before sending.
function renderAssistantWelcome() {
  const mode = assistantState.mode;
  let nudges = [];
  if (mode === "query") {
    try {
      const r = aggregatePortfolio(state.projects, state.globals, state.scenario);
      nudges = generateNudges(state, r, 5);
    } catch { nudges = []; }
  }
  const intro = mode === "suggest"
    ? `<strong>Suggest mode:</strong> describe a change you'd like to make. It will be routed to an admin for approval — nothing is applied automatically.`
    : `<strong>Question mode:</strong> ask anything about projects, financial assumptions, the pipeline. I only use data you have access to.`;
  const nudgeChips = nudges.length ? `
    <div class="assistant-nudges-label">Suggested for your portfolio right now</div>
    <div class="assistant-nudges">
      ${nudges.map(n => `<button class="assistant-nudge-chip" data-nudge-prompt="${escapeHtml(n.prompt)}">${escapeHtml(n.chip)}</button>`).join("")}
    </div>
  ` : "";
  return `<div class="assistant-welcome">
    <div class="muted" style="font-size:12px;line-height:1.6;">${intro}</div>
    ${nudgeChips}
  </div>`;
}

function renderAssistantPanel() {
  const panel = document.getElementById("assistant-panel");
  if (!panel) return;
  const messagesHtml = assistantState.messages.map(m => {
    if (m.role === "user") return `<div class="msg user"><div class="bubble user-bubble">${escapeHtml(m.content)}</div></div>`;
    if (m.role === "error") return `<div class="msg"><div class="bubble error-bubble">${escapeHtml(m.content)}</div></div>`;
    return `<div class="msg"><div class="bubble assistant-bubble">${escapeHtml(m.content).replace(/\n/g, "<br>")}${m.suggestion_id ? `<div class="muted mt-16" style="font-size:11px;">Suggestion #${m.suggestion_id} routed to admin for review.</div>` : ""}</div></div>`;
  }).join("");

  // v14.23 — Live "thinking" indicator while a query is in flight.
  // Pulsing Juno sparkle + animated dots + elapsed seconds, in the
  // conversation flow itself so the user sees that something IS happening
  // (not just a disabled button). Inspired by Claude's pulsing brand mark.
  const thinkingHtml = assistantState.busy ? `
    <div class="msg msg-thinking">
      <div class="bubble thinking-bubble">
        <span class="thinking-icon">${JUNO_AI_ICON}</span>
        <span class="thinking-text">Juno is thinking</span>
        <span class="thinking-dots"><span></span><span></span><span></span></span>
        <span class="thinking-time" id="thinking-time">0s</span>
      </div>
    </div>` : "";

  const quota = assistantState.quota;
  // v12.5 — quota is unlimited; only show today's usage (count + spend) as a soft indicator
  const quotaText = (quota && quota.query_count > 0)
    ? `${quota.query_count} ${quota.query_count === 1 ? "query" : "queries"} today`
    : "";
  panel.innerHTML = `
    <div class="assistant-header">
      <div class="assistant-title">
        <span class="juno-ai-icon-wrap${assistantState.busy ? " thinking" : ""}">${JUNO_AI_ICON}</span>
        <strong>Ask Juno</strong>
        <span class="muted" style="font-size:11px;margin-left:6px;">${quotaText}</span>
      </div>
      <button class="link-btn" id="assistant-close" aria-label="Close assistant">✕</button>
    </div>
    <div class="assistant-modes">
      <button class="btn small ${assistantState.mode === "query" ? "" : "secondary"}" data-mode="query">Question</button>
      <button class="btn small ${assistantState.mode === "suggest" ? "" : "secondary"}" data-mode="suggest">Suggest a change</button>
    </div>
    <div class="assistant-body">${messagesHtml || renderAssistantWelcome()}${thinkingHtml}</div>
    <form id="assistant-form" class="assistant-input">
      <textarea id="assistant-input" rows="2" placeholder="${assistantState.mode === "suggest" ? "Describe the change you'd like to suggest…" : "Ask a question about projects, scenarios, or financials…"}" ${assistantState.busy ? "disabled" : ""}></textarea>
      <button type="submit" class="btn" ${assistantState.busy ? "disabled" : ""}>${assistantState.busy ? "Thinking…" : "Send"}</button>
    </form>
    <div class="assistant-footer muted">Powered by Anthropic Claude · ${quota ? `~${(quota.cost_usd * 1).toFixed(4)} USD spent today` : ""}</div>
  `;
  panel.style.display = "flex";

  // Manage the elapsed-time counter on the thinking bubble.
  // Module-level _thinkingTimer + _thinkingStartedAt persist across renders
  // so we don't reset the counter to 0 if renderAssistantPanel() fires
  // mid-thinking (e.g. on a state update from elsewhere).
  if (assistantState.busy) {
    if (!_thinkingTimer) {
      _thinkingStartedAt = Date.now();
      const tick = () => {
        const el = document.getElementById("thinking-time");
        if (!el) return;
        const sec = Math.floor((Date.now() - _thinkingStartedAt) / 1000);
        el.textContent = `${sec}s`;
      };
      tick();
      _thinkingTimer = setInterval(tick, 1000);
    }
    // Auto-scroll so the user sees the thinking bubble
    const body = panel.querySelector(".assistant-body");
    if (body) body.scrollTop = body.scrollHeight;
  } else if (_thinkingTimer) {
    clearInterval(_thinkingTimer);
    _thinkingTimer = null;
    _thinkingStartedAt = null;
  }

  document.getElementById("assistant-close").onclick = () => {
    panel.style.display = "none";
    document.body.classList.remove("assistant-open");
  };
  for (const btn of panel.querySelectorAll("[data-mode]")) {
    btn.addEventListener("click", () => { assistantState.mode = btn.dataset.mode; renderAssistantPanel(); });
  }
  // v14.13 (Phase 4.3) — Nudge chips drop a prompt into the input
  for (const chip of panel.querySelectorAll("[data-nudge-prompt]")) {
    chip.addEventListener("click", () => {
      const inp = document.getElementById("assistant-input");
      if (inp) {
        inp.value = chip.dataset.nudgePrompt;
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    });
  }
  const form = document.getElementById("assistant-form");
  const inp = document.getElementById("assistant-input");
  inp?.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = inp.value.trim();
    if (!message || assistantState.busy) return;
    assistantState.messages.push({ role: "user", content: message });
    assistantState.busy = true;
    inp.value = "";
    renderAssistantPanel();
    try {
      const result = await askAssistant(message, assistantState.mode);
      assistantState.messages.push({ role: "assistant", content: result.response, suggestion_id: result.suggestion_id });
      assistantState.quota = { query_count: result.queries_today, cost_usd: result.cost_today_usd };
    } catch (err) {
      assistantState.messages.push({ role: "error", content: err?.message || String(err) });
    } finally {
      assistantState.busy = false;
      renderAssistantPanel();
      // Scroll to bottom
      const body = document.querySelector(".assistant-body");
      if (body) body.scrollTop = body.scrollHeight;
    }
  });
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// v14.17 (2026-05-19) — In-app confirmation modal.
// Replaces the native confirm() dialog for destructive actions. Native confirms are
// easy to miss (small banner near the address bar) and some browsers auto-suppress
// after multiple uses. This is a styled overlay that's hard to dismiss accidentally:
//   - Big card centered on screen with title, message, and explicit Cancel / Confirm
//   - Confirm button is focused by default — but Enter doesn't auto-fire
//   - Esc or click outside the card cancels (no destructive action without intent)
//
// Usage:
//   confirmDialog({
//     title: "Delete project?",
//     message: "This will permanently remove ...",
//     confirmLabel: "Delete",
//     danger: true,
//     onConfirm: () => removeProject(id),
//   });
function confirmDialog(opts) {
  const { title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, onConfirm, onCancel } = opts || {};
  document.querySelector(".confirm-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="confirm-modal">
      <h3 class="confirm-title">${escapeHtml(title || "Are you sure?")}</h3>
      ${message ? `<p class="confirm-message">${escapeHtml(message)}</p>` : ""}
      <div class="confirm-actions">
        <button class="btn secondary" data-confirm-action="cancel">${escapeHtml(cancelLabel)}</button>
        <button class="btn ${danger ? "danger" : ""}" data-confirm-action="confirm">${escapeHtml(confirmLabel)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
  const onKey = (e) => {
    if (e.key === "Escape") { close(); onCancel?.(); }
  };
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) { close(); onCancel?.(); }
  });
  overlay.querySelector('[data-confirm-action="cancel"]').addEventListener("click", () => { close(); onCancel?.(); });
  overlay.querySelector('[data-confirm-action="confirm"]').addEventListener("click", () => { close(); onConfirm?.(); });
  overlay.querySelector('[data-confirm-action="cancel"]').focus({ preventScroll: true });
}

// Promise-based wrapper around confirmDialog so callers can `await confirmAction(...)`
// instead of nesting callbacks. Resolves to true on confirm, false on cancel.
function confirmAction(opts) {
  return new Promise((resolve) => {
    confirmDialog({
      ...opts,
      onConfirm: () => resolve(true),
      onCancel:  () => resolve(false),
    });
  });
}

// ---------- Suggestions view (admin queue) ----------

let _suggestionsCache = null;
async function loadSuggestions() {
  _suggestionsCache = await fetchPendingSuggestions();
  notify();
}
function renderSuggestions() {
  if (!canEdit()) return `<div class="note neg">You need editor or super-admin role to review suggestions.</div>`;
  if (_suggestionsCache == null) { _suggestionsCache = []; loadSuggestions(); }
  const rows = _suggestionsCache.map(s => {
    const statusBadge = {
      pending:  `<span class="badge committed">Pending</span>`,
      approved: `<span class="badge in-build">Approved</span>`,
      applied:  `<span class="badge sold">Applied</span>`,
      rejected: `<span class="badge excluded">Rejected</span>`,
    }[s.status] || `<span class="badge pipeline">${s.status}</span>`;
    return `<tr>
      <td>${new Date(s.created_at).toLocaleString()}</td>
      <td>${s.user_email || "—"}</td>
      <td style="max-width:340px;">${escapeHtml(s.original_message).slice(0, 200)}</td>
      <td style="max-width:340px;font-size:11px;color:var(--fg-2);">${escapeHtml(s.llm_summary).slice(0, 240)}</td>
      <td>${statusBadge}</td>
      <td>
        ${s.status === "pending" ? `
          <button class="btn small" data-sug-action="approve" data-sug-id="${s.id}">Approve</button>
          <button class="btn small danger" data-sug-action="reject" data-sug-id="${s.id}">Reject</button>
        ` : ""}
        ${s.status === "approved" ? `<button class="btn small" data-sug-action="apply" data-sug-id="${s.id}">Mark applied</button>` : ""}
        ${s.proposed_patch ? `<details><summary class="muted" style="cursor:pointer;font-size:11px;">Show patch</summary><pre style="font-size:10px;max-width:300px;overflow-x:auto;">${escapeHtml(JSON.stringify(s.proposed_patch, null, 2))}</pre></details>` : ""}
      </td>
    </tr>`;
  }).join("");
  return `
    <div class="row between mb-12">
      <div class="section-title" style="margin:0;">Suggestions · ${_suggestionsCache.length} total</div>
      <button class="btn secondary" id="refresh-suggestions">Refresh</button>
    </div>
    <div class="panel">
      <div class="panel-subtitle">Changes proposed by users via the Ask Juno assistant in "Suggest a change" mode. Nothing is applied automatically — review, then either approve + apply manually, or reject.</div>
      <div class="scroll-x"><table class="tbl">
        <thead><tr><th>When</th><th>From</th><th>Request</th><th>Assistant summary</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="muted center">No suggestions yet. Use Ask Juno → Suggest a change to create one.</td></tr>`}</tbody>
      </table></div>
    </div>
  `;
}

// ---------- Activity view ----------

function renderActivity() {
  const log = state.audit_log || [];
  const categoryBadge = (cat) => {
    const cls = { project: "committed", scenario: "in-build", global: "pipeline" }[cat] || "pipeline";
    return `<span class="badge ${cls}">${cat}</span>`;
  };
  const formatDetail = (d) => {
    if (!d) return "";
    if (d.changes) {
      return Object.entries(d.changes).map(([k, v]) => `<code>${k}</code>: ${formatVal(v.prev)} → ${formatVal(v.next)}`).join("<br>");
    }
    if (d.key && "next" in d) {
      return `<code>${d.key}</code>: ${formatVal(d.prev)} → ${formatVal(d.next)}`;
    }
    if (d.patch) {
      return Object.entries(d.patch).map(([k, v]) => `<code>${k}</code> = ${formatVal(v)}`).join("<br>");
    }
    return Object.entries(d).filter(([k]) => k !== "project_id" && k !== "source_id" && k !== "target_id").map(([k, v]) => `${k}: ${formatVal(v)}`).join("<br>");
  };
  const formatVal = (v) => {
    if (v == null) return "<em class='muted'>null</em>";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "object") return `<code>${JSON.stringify(v).slice(0, 60)}</code>`;
    return String(v).slice(0, 60);
  };
  const rows = log.map(e => {
    const d = new Date(e.ts);
    const timeStr = d.toLocaleString();
    return `<tr>
      <td class="muted" style="white-space:nowrap;">${timeStr}</td>
      <td>${categoryBadge(e.category)}</td>
      <td>${e.message}</td>
      <td style="font-size:11px;color:var(--fg-3);">${formatDetail(e.detail)}</td>
    </tr>`;
  }).join("");
  return `
    <div class="row between mb-12">
      <div class="section-title" style="margin:0;">Activity log · ${log.length} entries</div>
      <div class="row gap-sm">
        <button class="btn secondary" id="export-audit-csv">Export CSV</button>
        <button class="btn danger" id="clear-audit-log">Clear log</button>
      </div>
    </div>
    <div class="panel">
      ${log.length === 0
        ? `<div class="note">No activity logged yet. Make changes to projects, scenarios, or globals — they'll appear here.</div>`
        : `<div class="scroll-x"><table class="tbl">
            <thead><tr><th style="width:170px;">Timestamp</th><th>Type</th><th>Action</th><th>Detail</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`
      }
    </div>
    <div class="hint mt-16">Log keeps the most recent 200 mutations. Server-side authoritative log lives in the Supabase <code>activity_log</code> table — super-admin can pull it any time.</div>
  `;
}

// ---------- Settings view ----------

function renderSettings() {
  const g = state.globals;
  const f = (k, label, type="number", step="any") => `
    <div class="form-row">
      <label>${label}</label>
      <input class="input" data-global="${k}" type="${type}" step="${step}" value="${g[k]}">
    </div>`;
  return `
    <div class="section-title">Global drivers · used as defaults across all projects</div>
    <div class="panel-row">
      <div class="panel">
        <h3>Financial assumptions</h3>
        <div class="form-grid">
          ${f("interest_rate_apr","Interest rate APR")}
          ${f("ltc_pct","LTC (build / Kingshaus / soft)")}
          ${f("ltc_land_pct","LTC (land)")}
          ${f("contingency_pct","Contingency % of hard costs")}
          ${f("cash_equity_ratio","Cash equity ratio")}
          ${f("equity_at_closing_pct","Equity at closing")}
          ${f("default_build_cost_per_sqft","Default build $/sqft")}
          ${f("default_kingshaus_cost_per_sqft","Default Kingshaus $/sqft")}
          ${f("target_margin","Target margin")}
          ${f("default_land_cost_usd","Default land cost (USD)")}
          ${f("default_program_months","Default program months","number","1")}
          ${f("annual_opex_usd","Annual OPEX (USD)")}
          ${f("opex_growth_rate","OPEX growth rate (per year)")}
          ${f("model_start","Model start (YYYY-MM)","month","1")}
          ${f("horizon_months","Horizon months","number","1")}
          ${f("financing_fees_per_project_usd","Financing fees per project (USD)")}
          ${f("tax_rate_pct","Federal tax rate")}
          ${f("tax_state_rate_pct","State tax rate")}
          <div class="form-row">
            <label>Apply tax</label>
            <select class="input" data-global-select="apply_tax">
              <option value="true" ${g.apply_tax?"selected":""}>Yes (show after-tax view)</option>
              <option value="false" ${!g.apply_tax?"selected":""}>No (pre-tax only)</option>
            </select>
          </div>
          <div class="form-row">
            <label>Loss carryforward (NOL)</label>
            <select class="input" data-global-select="loss_carryforward">
              <option value="true" ${g.loss_carryforward?"selected":""}>Yes (prior losses offset future profits)</option>
              <option value="false" ${!g.loss_carryforward?"selected":""}>No (tax each year independently)</option>
            </select>
            <div class="hint">US-style NOL: net operating losses carry forward indefinitely to offset future taxable income.</div>
          </div>
          <div class="form-row">
            <label>Fiscal year mode</label>
            <select class="input" data-global-select="fiscal_year_mode">
              <option value="calendar" ${g.fiscal_year_mode==="calendar"?"selected":""}>Calendar year (Jan–Dec)</option>
              <option value="juno13" ${g.fiscal_year_mode==="juno13"?"selected":""}>Juno 13-month (Jan 2030 rolls into FY29)</option>
            </select>
            <div class="hint">Excel's Summary tab uses 13-month FY29 (Jan-2029 to Jan-2030). Calendar matches GAAP.</div>
          </div>
          <div class="form-row">
            <label>Capitalize interest</label>
            <select class="input" data-global-select="capitalize_interest">
              <option value="false" ${!g.capitalize_interest?"selected":""}>Simple interest (Excel default)</option>
              <option value="true" ${g.capitalize_interest?"selected":""}>Compound (accrue into principal)</option>
            </select>
          </div>
          <div class="form-row">
            <label>Build cost curve</label>
            <select class="input" data-global-select="build_cost_curve">
              <option value="linear" ${g.build_cost_curve==="linear"?"selected":""}>Linear (uniform across build window)</option>
              <option value="front_loaded" ${g.build_cost_curve==="front_loaded"?"selected":""}>Front-loaded (heavier early)</option>
              <option value="s_curve" ${g.build_cost_curve==="s_curve"?"selected":""}>S-curve (slow start, peak mid, slow finish)</option>
            </select>
            <div class="hint">S-curve is typical for construction. Front-loaded models early site work + permits + foundations.</div>
          </div>
          ${f("build_cost_realization_pct","Build cost realization %")}
        </div>
        <h3 style="margin-top:24px;">Risk thresholds</h3>
        <div class="panel-subtitle">When breached, KPI cards flash and a banner appears on Portfolio.</div>
        <div class="form-grid">
          ${f("risk_peak_equity_threshold","Alert if peak equity exceeds (USD)")}
          ${f("risk_max_debt_threshold","Alert if max debt exceeds (USD)")}
          ${f("risk_min_moic","Alert if MOIC below")}
          ${f("risk_min_irr_annual","Alert if annualized IRR below")}
          ${f("risk_min_margin_pct","Alert if portfolio margin below")}
          <div class="form-row">
            <label>Sold projects in forecast</label>
            <select class="input" data-global-select="include_sold_projects">
              <option value="false" ${!g.include_sold_projects?"selected":""}>Exclude (forward forecast only)</option>
              <option value="true" ${g.include_sold_projects?"selected":""}>Include (lifetime totals)</option>
            </select>
            <div class="hint">When a project is marked "sold", auto-exclude it from forward calcs by default.</div>
          </div>
        </div>
      </div>
      <div class="panel">
        <h3>Data management</h3>
        <p class="muted" style="font-size:12px;">
          Atlas is the system of record as of <strong style="color:var(--fg);">${state.globals.system_of_record_since || state.globals.excel_baseline_snapshot || "2026-05-10"}</strong>.
          State is persisted to Juno's Supabase project (<code>financial_state</code> table, single canonical row,
          versioned in <code>state_history</code>) with a local <code>juno-fd-v1</code> cache for offline reads.
          The original Excel workbook is archived as historical reference — it is no longer maintained, and Atlas
          drifts from it intentionally as new projects, scenarios, and actuals are added.
        </p>
        <div class="data-mgmt-actions">
          <button class="btn secondary" id="match-excel">Compare to legacy Excel snapshot</button>
          <button class="btn secondary" id="export-json">Export state (JSON)</button>
          <button class="btn secondary" id="export-cashflow-csv">Export cash flow (CSV)</button>
          <button class="btn secondary" id="export-projects-csv">Export projects (CSV)</button>
          <button class="btn secondary" id="export-annual-csv">Export annual P&L (CSV)</button>
          <button class="btn secondary" id="export-html-report">Export printable HTML report</button>
          <button class="btn danger" id="reset-baseline">Reset to seed data</button>
        </div>
        <div class="hint mt-16">"Compare to legacy Excel" applies the 13-month FY + 81% build realization + Excel sale prices for sanity-checking against the archived workbook. Use it as a historical reference, not as a reconciliation target — Atlas is the truth.</div>
        <div class="divider"></div>
        <h3>Theme</h3>
        <div class="row gap-sm">
          <button class="btn ${state.ui.theme==="light"?"":"secondary"}" data-theme="light">Light</button>
          <button class="btn ${state.ui.theme==="dark"?"":"secondary"}" data-theme="dark">Dark</button>
        </div>
      </div>
    </div>

    <div class="panel mb-24">
      <h3>Markets</h3>
      <div class="panel-subtitle">Sale price + build cost elasticity by region. Each project tags a market; multipliers apply on top of base $/sqft.</div>
      <div class="grid-table markets-table">
        <div class="grid-table-head">
          <div>Market</div>
          <div class="num">Sale ×</div>
          <div class="num">Build ×</div>
          <div>Demand</div>
          <div></div>
        </div>
        ${(g.markets || []).map((m, idx) => `
          <div class="grid-table-row">
            <input class="input" type="text" data-market="${idx}" data-field="name" value="${m.name}">
            <input class="input num" type="number" step="0.01" data-market="${idx}" data-field="sale_price_multiplier" value="${m.sale_price_multiplier}">
            <input class="input num" type="number" step="0.01" data-market="${idx}" data-field="build_cost_multiplier" value="${m.build_cost_multiplier}">
            <select class="input" data-market="${idx}" data-field="demand_outlook">
              ${["soft","stable","strong"].map(o => `<option value="${o}" ${m.demand_outlook === o ? "selected" : ""}>${o}</option>`).join("")}
            </select>
            <button class="btn small ghost row-remove-btn" data-remove-market="${idx}" ${m.id === "default" ? "disabled" : ""} title="Remove market" aria-label="Remove ${escapeHtml(m.name)}">✕</button>
          </div>
        `).join("")}
      </div>
      <div class="row gap-sm mt-16">
        <button class="btn small secondary" id="add-market">+ Add market</button>
      </div>
    </div>

    <div class="panel mb-24">
      <h3>Shareholders &amp; cap table</h3>
      <div class="panel-subtitle">Capital structure of the equity stack. Equity share should sum to 100% — current total: <strong>${((g.investors || []).reduce((a,b)=>a+(b.equity_share_pct||0), 0) * 100).toFixed(1)}%</strong>.</div>
      <div class="grid-table investors-table">
        <div class="grid-table-head">
          <div>Name</div>
          <div class="num">Share</div>
          <div class="num">Pref</div>
          <div class="num">Hurdle</div>
          <div class="num">Carry</div>
          <div class="num">Tax</div>
          <div>Role</div>
          <div></div>
        </div>
        ${(g.investors || []).map((inv, idx) => `
          <div class="grid-table-row">
            <input class="input" type="text" data-investor="${idx}" data-field="name" value="${inv.name}" placeholder="Shareholder name">
            <input class="input num" type="number" step="0.001" data-investor="${idx}" data-field="equity_share_pct" value="${inv.equity_share_pct}">
            <input class="input num" type="number" step="0.01" data-investor="${idx}" data-field="preferred_return_pct" value="${inv.preferred_return_pct}">
            <input class="input num" type="number" step="0.01" data-investor="${idx}" data-field="hurdle_pct" value="${inv.hurdle_pct}">
            <input class="input num" type="number" step="0.01" data-investor="${idx}" data-field="carry_pct" value="${inv.carry_pct ?? 0.20}">
            <input class="input num" type="number" step="0.001" data-investor="${idx}" data-field="tax_rate_pct" value="${inv.tax_rate_pct ?? 0.255}">
            <select class="input" data-investor="${idx}" data-field="is_sponsor">
              <option value="true" ${inv.is_sponsor?"selected":""}>Sponsor</option>
              <option value="false" ${!inv.is_sponsor?"selected":""}>Owner</option>
            </select>
            <button class="btn small ghost row-remove-btn" data-remove-investor="${idx}" title="Remove shareholder" aria-label="Remove ${escapeHtml(inv.name)}">✕</button>
          </div>
        `).join("")}
      </div>
      <div class="row gap-sm mt-16">
        <button class="btn small secondary" id="add-investor">+ Add shareholder</button>
        <button class="btn small ghost" id="restore-cap-table" title="Reset to the Juno baseline cap table (Peter 38% · Lars 30% · Viktor 17% · Philip 5% · Missy 5% · Massi 2.5% · Mark 2.5%)">↺ Restore Juno cap table</button>
      </div>

      <h3 style="margin-top:32px;">Hypothetical co-investor</h3>
      <div class="panel-subtitle">Simulate bringing in an LP at a given equity share. Shows up on the Waterfall view when share &gt; 0.</div>
      <div class="form-grid">
        ${f("hypothetical_lp_share_pct","LP equity share")}
        ${f("hypothetical_lp_pref_pct","LP preferred return")}
        ${f("hypothetical_lp_hurdle_pct","LP hurdle IRR")}
        ${f("hypothetical_lp_carry_pct","Sponsor carry on LP excess")}
      </div>
    </div>

    <div class="panel mb-24">
      <h3>Kingshaus unit costs (per villa, from 6 Great Circle reference)</h3>
      <div class="panel-subtitle">Source: external link <code>[1]6 GC - SE Costs!E5:E11</code> in the original workbook. When the toggle below is on, the engine uses the breakdown total (fixed per villa) instead of <code>$/sqft × sqft</code>.</div>
      <div class="form-grid">
        ${Object.entries(g.kingshaus_breakdown_per_villa || {}).map(([k, v]) => `
          <div class="form-row">
            <label>${k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} (USD)</label>
            <input class="input" data-kingshaus="${k}" type="number" step="100" value="${v}">
          </div>
        `).join("")}
      </div>
      <div class="form-row mt-16">
        <label>Use breakdown total instead of $/sqft</label>
        <select class="input" data-global-select="use_kingshaus_breakdown">
          <option value="false" ${!g.use_kingshaus_breakdown?"selected":""}>No (use $/sqft × sqft per project)</option>
          <option value="true" ${g.use_kingshaus_breakdown?"selected":""}>Yes (use fixed total per villa)</option>
        </select>
        <div class="hint">Total: $${Object.values(g.kingshaus_breakdown_per_villa || {}).reduce((a,b)=>a+b, 0).toLocaleString()}/villa.</div>
      </div>
    </div>

  `;
}

// ---------- view event wiring ----------

function attachViewEvents(result) {
  // Projects list row actions
  for (const btn of document.querySelectorAll("[data-action]")) {
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    btn.addEventListener("click", () => {
      if (action === "open") setView("project_detail", id);
      if (action === "exclude") {
        // v14.19 (2026-05-19) — Confirm before toggling exclusion so users don't
        // confuse "Exclude from scenario" with "Delete project". The labels were
        // ambiguous before; even after relabeling, a confirm dialog makes the
        // scope explicit (scenario-only, not destructive).
        const proj = state.projects.find(x => x.id === id);
        const wasExcluded = state.scenario.excluded_project_ids.includes(id);
        if (wasExcluded) {
          // Re-including is benign — no confirm needed.
          toggleProjectExclusion(id);
        } else {
          confirmDialog({
            title: "Exclude from this scenario?",
            message: `"${proj?.name || id}" will be removed from the "${state.scenario.name}" scenario's totals. The project stays in your list and can be re-included anytime — this does NOT delete the project. If you want to delete it permanently, use the "Delete project" button instead.`,
            confirmLabel: "Exclude from scenario",
            cancelLabel: "Cancel",
            onConfirm: () => toggleProjectExclusion(id),
          });
        }
      }
      if (action === "remove") {
        const proj = state.projects.find(x => x.id === id);
        confirmDialog({
          title: "Delete this project?",
          message: `"${proj?.name || id}" will be permanently removed from Juno Atlas. This cannot be undone.`,
          confirmLabel: "Delete project",
          cancelLabel: "Keep it",
          danger: true,
          onConfirm: () => removeProject(id),
        });
      }
      if (action === "use-excel-price") {
        const price = Number(btn.dataset.price);
        updateProject(id, { sale_price_override_usd: price, sale_price_per_sqft_override: null });
      }
      if (action === "clear-price-override") {
        updateProject(id, { sale_price_override_usd: null, sale_price_per_sqft_override: null });
      }
      if (action === "set-status") {
        updateProject(id, { status: btn.dataset.status });
      }
      if (action === "clone") {
        const newId = cloneProject(id);
        if (newId) setView("project_detail", newId);
      }
    });
  }

  // Add project button — opens the New Project wizard (v14.1)
  document.getElementById("add-project-btn")?.addEventListener("click", () => {
    openWizard();
  });
  document.getElementById("portfolio-new-project-btn")?.addEventListener("click", () => {
    openWizard();
  });
  document.getElementById("portfolio-empty-create-btn")?.addEventListener("click", () => {
    openWizard();
  });

  // Portfolio "open project" links in the table + watchlist
  for (const btn of document.querySelectorAll("[data-action='open-project']")) {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (id) setView("project_detail", id);
    });
  }

  // Portfolio CSV import (header CTA + empty-state CTA both wire to the same file input)
  const importTriggers = [
    document.getElementById("portfolio-import-btn"),
    document.getElementById("portfolio-empty-import-btn"),
  ].filter(Boolean);
  const importFileInputs = [
    document.getElementById("portfolio-import-file"),
    document.getElementById("portfolio-empty-import-file"),
  ].filter(Boolean);
  if (importTriggers.length && importFileInputs.length) {
    const fileInput = importFileInputs[0];
    importTriggers.forEach(b => b.addEventListener("click", () => fileInput.click()));
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const result = importProjectsFromCSV(text);
      if (!result.ok) alert(`Import failed: ${result.error}`);
      else alert(`Imported ${result.added.length} project${result.added.length === 1 ? "" : "s"}.`);
      e.target.value = "";
    });
  }

  // Monte Carlo distribution editing + run
  for (const inp of document.querySelectorAll("[data-dist]")) {
    inp.addEventListener("change", (e) => {
      const key = e.target.dataset.dist;
      const edge = e.target.dataset.edge;
      const val = Number(e.target.value);
      if (isNaN(val)) return;
      const current = window.__mcDistributions || { ...DEFAULT_DISTRIBUTIONS };
      current[key] = { ...(current[key] || DEFAULT_DISTRIBUTIONS[key]), [edge]: val };
      window.__mcDistributions = current;
    });
  }
  document.getElementById("run-mc")?.addEventListener("click", async () => {
    const trials = Math.max(100, Math.min(10000, Number(document.getElementById("mc-trials")?.value) || 1000));
    const dist = window.__mcDistributions || { ...DEFAULT_DISTRIBUTIONS };
    window.__mcTrials = trials;
    const btn = document.getElementById("run-mc");
    btn.disabled = true;
    btn.innerText = `0 / ${trials}`;
    try {
      const result = await runInWorker(
        "monte_carlo",
        { projects: state.projects, globals: state.globals, scenario: state.scenario, distributions: dist, trials },
        ({ current, total }) => { btn.innerText = `${current.toLocaleString()} / ${total.toLocaleString()}`; }
      );
      window.__mcResult = result;
    } catch (err) {
      // Fallback: main-thread compute (still uses chunked engine but blocks UI)
      window.__mcResult = monteCarlo(state.projects, state.globals, state.scenario, dist, trials);
    } finally {
      btn.disabled = false;
      btn.innerText = "Run simulation";
      render();
    }
  });
  document.getElementById("reset-mc-dist")?.addEventListener("click", () => {
    window.__mcDistributions = JSON.parse(JSON.stringify(DEFAULT_DISTRIBUTIONS));
    window.__mcResult = null;
    render();
  });

  // Users view handlers
  document.getElementById("refresh-users")?.addEventListener("click", async () => {
    _usersCache = null;
    await loadUsers();
  });

  // Suggestions view handlers
  document.getElementById("refresh-suggestions")?.addEventListener("click", async () => {
    _suggestionsCache = null;
    await loadSuggestions();
  });
  for (const btn of document.querySelectorAll("[data-sug-action]")) {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.sugId);
      const action = btn.dataset.sugAction;
      try {
        if (action === "approve") await reviewSuggestion(id, "approved");
        else if (action === "reject") {
          const reason = prompt("Reason for rejection (optional):") || null;
          await reviewSuggestion(id, "rejected", reason);
        } else if (action === "apply") {
          if (!confirm("Mark this suggestion as applied? You should have already made the actual change in the dashboard.")) return;
          await reviewSuggestion(id, "applied");
        }
        _suggestionsCache = null;
        await loadSuggestions();
      } catch (e) {
        alert(`Failed: ${e.message}`);
      }
    });
  }
  for (const sel of document.querySelectorAll("[data-set-role]")) {
    sel.addEventListener("change", async (e) => {
      const userId = sel.dataset.setRole;
      const newRole = e.target.value;
      try {
        await updateUserRole(userId, newRole);
        await loadUsers();
      } catch (err) {
        alert(`Failed to update role: ${err.message}`);
      }
    });
  }

  // Activity log buttons
  document.getElementById("clear-audit-log")?.addEventListener("click", () => {
    confirmDialog({
      title: "Clear the entire activity log?",
      message: "All recorded events for this project will be removed. This cannot be undone.",
      confirmLabel: "Clear log",
      cancelLabel: "Keep it",
      danger: true,
      onConfirm: () => clearAuditLog(),
    });
  });
  document.getElementById("export-audit-csv")?.addEventListener("click", () => {
    const rows = [["Timestamp", "Category", "Action", "Detail"]];
    for (const e of state.audit_log) {
      rows.push([e.ts, e.category, e.message, JSON.stringify(e.detail || {})]);
    }
    downloadCSV(rows, `juno-activity-log-${new Date().toISOString().slice(0, 10)}.csv`);
  });

  // Drag-drop project reordering
  let dragSourceId = null;
  for (const row of document.querySelectorAll("tr[data-project-row]")) {
    row.addEventListener("dragstart", (e) => {
      dragSourceId = row.dataset.projectRow;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      document.querySelectorAll(".drag-over-before, .drag-over-after").forEach(r => r.classList.remove("drag-over-before", "drag-over-after"));
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const isAfter = e.clientY > rect.top + rect.height / 2;
      row.classList.remove("drag-over-before", "drag-over-after");
      row.classList.add(isAfter ? "drag-over-after" : "drag-over-before");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over-before", "drag-over-after");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const targetId = row.dataset.projectRow;
      if (dragSourceId && dragSourceId !== targetId) {
        const rect = row.getBoundingClientRect();
        const isAfter = e.clientY > rect.top + rect.height / 2;
        reorderProject(dragSourceId, targetId, isAfter ? "after" : "before");
      }
      dragSourceId = null;
    });
  }

  // Import CSV button + file picker
  document.getElementById("import-csv-btn")?.addEventListener("click", () => document.getElementById("import-csv-file")?.click());
  document.getElementById("import-csv-file")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = importProjectsFromCSV(text);
    if (result.ok) {
      alert(`Imported ${result.added.length} project${result.added.length === 1 ? "" : "s"} from ${file.name}.`);
    } else {
      alert(`Import failed: ${result.error}\n\nRequired columns: name, start_date (YYYY-MM), villa_sqft, land_cost_usd.\nOptional: address, status, program_months, build_cost_per_sqft, kingshaus_cost_per_sqft, target_margin, interest_rate_apr, ltc_pct, soft_costs_lump_sum, sale_price_override_usd, sale_price_per_sqft_override.`);
    }
    e.target.value = "";
  });

  // Project detail picker
  document.getElementById("project-picker")?.addEventListener("change", (e) => setView("project_detail", e.target.value));

  // Project form fields
  for (const inp of document.querySelectorAll("[data-field]")) {
    inp.addEventListener("change", (e) => {
      const id = state.ui.selected_project_id;
      const field = e.target.dataset.field;
      let value = e.target.value;
      if (e.target.type === "number") {
        value = value === "" ? null : Number(value);
        if (isNaN(value)) value = null;
      } else if (e.target.type === "month") {
        value = value || state.globals.model_start;
      }
      // string fields are kept as-is
      updateProject(id, { [field]: value });
    });
  }

  for (const inp of document.querySelectorAll("[data-soft]")) {
    inp.addEventListener("change", (e) => {
      const id = state.ui.selected_project_id;
      const key = e.target.dataset.soft;
      const value = Number(e.target.value) || 0;
      const p = state.projects.find(x => x.id === id);
      const soft = { ...(p?.soft_costs || {}) };
      soft[key] = value;
      updateProject(id, { soft_costs: soft });
    });
  }
  // v12.3 actuals
  for (const inp of document.querySelectorAll("[data-actual]")) {
    inp.addEventListener("change", (e) => {
      const id = state.ui.selected_project_id;
      const key = e.target.dataset.actual;
      const value = Number(e.target.value) || 0;
      const p = state.projects.find(x => x.id === id);
      const actuals = { ...(p?.actuals || {}) };
      actuals[key] = value;
      updateProject(id, { actuals });
    });
  }

  // Settings + Inputs screen: global drivers (number / text / checkbox)
  for (const inp of document.querySelectorAll("[data-global]")) {
    inp.addEventListener("change", (e) => {
      const key = e.target.dataset.global;
      let value;
      if (e.target.type === "checkbox") {
        value = e.target.checked;
      } else if (e.target.type === "number") {
        value = Number(e.target.value);
        if (isNaN(value)) return;
      } else {
        value = e.target.value;
      }
      updateGlobal(key, value);
    });
  }

  // Inputs screen: scenario overrides (multipliers, deltas, timing shift)
  for (const inp of document.querySelectorAll("[data-scenario]")) {
    inp.addEventListener("change", (e) => {
      const key = e.target.dataset.scenario;
      let value;
      if (e.target.type === "checkbox") {
        value = e.target.checked;
      } else if (e.target.type === "number") {
        value = Number(e.target.value);
        if (isNaN(value)) return;
      } else {
        value = e.target.value;
      }
      updateScenario({ [key]: value });
    });
  }

  // Project workspace tabs (Summary / Inputs / Timeline / Capital / ...)
  for (const btn of document.querySelectorAll("[data-project-tab]")) {
    btn.addEventListener("click", () => setProjectTab(btn.dataset.projectTab));
  }

  // Timeline tab: delay simulator slider — transient preview, not saved.
  const delaySlider = document.getElementById("delay-slider");
  if (delaySlider) {
    delaySlider.addEventListener("input", (e) => {
      state.ui.timeline_preview_shift = Number(e.target.value) || 0;
      notify();
    });
  }
  document.getElementById("delay-reset")?.addEventListener("click", () => {
    state.ui.timeline_preview_shift = 0;
    notify();
  });
  for (const sel of document.querySelectorAll("[data-global-select]")) {
    sel.addEventListener("change", (e) => {
      const key = e.target.dataset.globalSelect;
      let value = e.target.value;
      if (value === "true") value = true;
      else if (value === "false") value = false;
      updateGlobal(key, value);
    });
  }

  for (const inp of document.querySelectorAll("[data-kingshaus]")) {
    inp.addEventListener("change", (e) => {
      const key = e.target.dataset.kingshaus;
      const value = Number(e.target.value) || 0;
      const breakdown = { ...(state.globals.kingshaus_breakdown_per_villa || {}) };
      breakdown[key] = value;
      updateGlobal("kingshaus_breakdown_per_villa", breakdown);
    });
  }

  for (const inp of document.querySelectorAll("[data-market]")) {
    inp.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.market);
      const field = e.target.dataset.field;
      let value = e.target.value;
      if (e.target.type === "number") value = Number(value) || 0;
      const markets = [...(state.globals.markets || [])];
      markets[idx] = { ...markets[idx], [field]: value };
      updateGlobal("markets", markets);
    });
  }
  for (const btn of document.querySelectorAll("[data-remove-market]")) {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.removeMarket);
      const markets = (state.globals.markets || []).filter((_, i) => i !== idx);
      updateGlobal("markets", markets);
    });
  }
  document.getElementById("add-market")?.addEventListener("click", () => {
    const markets = [...(state.globals.markets || []), { id: `m${Date.now()}`, name: "New market", sale_price_multiplier: 1.0, build_cost_multiplier: 1.0, demand_outlook: "stable" }];
    updateGlobal("markets", markets);
  });

  for (const inp of document.querySelectorAll("[data-investor]")) {
    inp.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.investor);
      const field = e.target.dataset.field;
      let value = e.target.value;
      if (e.target.type === "number") value = Number(value) || 0;
      else if (field === "is_sponsor") value = value === "true";
      const investors = [...(state.globals.investors || [])];
      investors[idx] = { ...investors[idx], [field]: value };
      updateGlobal("investors", investors);
    });
  }
  for (const btn of document.querySelectorAll("[data-remove-investor]")) {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.removeInvestor);
      const investors = (state.globals.investors || []).filter((_, i) => i !== idx);
      updateGlobal("investors", investors);
    });
  }
  document.getElementById("add-investor")?.addEventListener("click", () => {
    const investors = [...(state.globals.investors || []), { id: `inv${Date.now()}`, name: "New shareholder", equity_share_pct: 0, preferred_return_pct: 0, hurdle_pct: 0, carry_pct: 0, tax_rate_pct: 0.255, is_sponsor: false }];
    updateGlobal("investors", investors);
  });
  document.getElementById("restore-cap-table")?.addEventListener("click", () => {
    confirmDialog({
      title: "Restore the Juno cap table?",
      message: "This replaces the current shareholder list with the canonical 7-owner split: Peter 38% · Lars 30% · Viktor 17% · Philip 5% · Missy 5% · Massi 2.5% · Mark 2.5%. Other settings (markets, projects, scenarios) stay untouched.",
      confirmLabel: "Restore cap table",
      cancelLabel: "Cancel",
      onConfirm: () => restoreCapTable(),
    });
  });

  // Settings: theme buttons + reset + export
  for (const btn of document.querySelectorAll("[data-theme]")) {
    btn.addEventListener("click", () => setTheme(btn.dataset.theme));
  }
  document.getElementById("reset-baseline")?.addEventListener("click", () => {
    confirmDialog({
      title: "Reset all state to seed data?",
      message: "Every project, scenario, and override will be wiped and reloaded from the Atlas seed. This cannot be undone.",
      confirmLabel: "Reset everything",
      cancelLabel: "Keep my data",
      danger: true,
      onConfirm: () => resetToBaseline(),
    });
  });
  document.getElementById("match-excel")?.addEventListener("click", () => {
    updateGlobal("fiscal_year_mode", "juno13");
    updateGlobal("build_cost_realization_pct", 0.81);
    updateGlobal("apply_tax", false);
    // Apply Excel sale price to all projects that have one
    for (const p of state.projects) {
      if (p._excel_sale_price) {
        updateProject(p.id, { sale_price_override_usd: p._excel_sale_price });
      }
    }
    alert("Legacy Excel comparison mode applied. Total profit should now be within ~5% of the archived Excel snapshot. Atlas remains the system of record — use this for sanity-check only.");
  });
  document.getElementById("export-json")?.addEventListener("click", () => {
    downloadBlob(JSON.stringify({ globals: state.globals, scenario: state.scenario, projects: state.projects }, null, 2),
      "juno-financial-dashboard-state.json", "application/json");
  });
  document.getElementById("export-cashflow-csv")?.addEventListener("click", () => {
    const r = aggregatePortfolio(state.projects, state.globals, state.scenario);
    const rows = [["Metric", ...r.timeline, "Total"]];
    const metrics = [["Sales", "sales"], ["Land", "land_cost"], ["Build", "build_cost"], ["Kingshaus", "kingshaus"], ["Soft", "soft_cost"], ["Overhead", "overhead"], ["Interest", "interest"], ["Debt drawn", "debt_drawn"], ["Debt repaid", "debt_repaid"], ["Debt balance", "debt_balance"], ["Equity drawn", "equity_drawn"], ["Equity returned", "equity_returned"], ["Equity balance", "equity_balance"], ["Net cash", "net_cash"]];
    for (const [label, key] of metrics) {
      const series = r.monthly[key];
      const total = series.reduce((a, b) => a + b, 0);
      rows.push([label, ...series.map(v => Math.round(v)), Math.round(total)]);
    }
    downloadCSV(rows, `juno-cashflow-${state.scenario.name.replace(/\s+/g, "-")}.csv`);
  });
  document.getElementById("export-projects-csv")?.addEventListener("click", () => {
    const r = aggregatePortfolio(state.projects, state.globals, state.scenario);
    const rows = [["ID", "Name", "Address", "Status", "Start", "Sale", "Sqft", "Land USD", "Build $/sqft", "Total cost", "Sale price", "Profit", "Margin %", "MOIC", "IRR annual %", "Peak equity", "Peak debt"]];
    for (const p of state.projects) {
      const res = r.by_project.find(x => x.project_id === p.id);
      if (!res) continue;
      rows.push([p.id, p.name, p.address || "", p.status, p.start_date, res.sale_date || "", p.villa_sqft, p.land_cost_usd, p.build_cost_per_sqft ?? state.globals.default_build_cost_per_sqft,
        Math.round(res.kpis.total_dev_cost), Math.round(res.kpis.total_sales), Math.round(res.kpis.gross_profit),
        (res.kpis.profit_margin_pct * 100).toFixed(1), (res.kpis.moic || 0).toFixed(2),
        res.kpis.irr_annual == null ? "" : (res.kpis.irr_annual * 100).toFixed(1),
        Math.round(res.kpis.peak_equity), Math.round(res.kpis.peak_debt)]);
    }
    downloadCSV(rows, `juno-projects-${state.scenario.name.replace(/\s+/g, "-")}.csv`);
  });
  document.getElementById("export-html-report")?.addEventListener("click", () => {
    const r = aggregatePortfolio(state.projects, state.globals, state.scenario);
    const k = r.kpis;
    const date = new Date().toISOString().slice(0, 10);
    const css = `
      body{font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;color:#131313;background:#fff;margin:40px;max-width:1000px}
      h1{font-size:24px;margin:0 0 6px;letter-spacing:-0.02em}h2{font-size:16px;margin:32px 0 12px;border-bottom:1px solid #ddd;padding-bottom:4px}
      .meta{color:#666;font-size:12px;margin-bottom:32px}
      .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
      .kpi{border:1px solid #ddd;border-radius:8px;padding:12px}
      .kpi .l{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px}
      .kpi .v{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;font-variant-numeric:tabular-nums}
      th,td{padding:5px 8px;border-bottom:1px solid #eee;text-align:right}
      th:first-child,td:first-child{text-align:left}
      th{background:#f5f5f0;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#666;font-weight:600}
      tr:last-child td{font-weight:600;background:#f5f5f0}
      .neg{color:#b3261e}.pos{color:#1f7a4d}
      .footer{margin-top:48px;color:#999;font-size:10px;text-align:center;border-top:1px solid #eee;padding-top:12px}
      @media print{body{margin:20px}.no-print{display:none}}
    `;
    const annual = r.annual;
    const years = Object.keys(annual).sort();
    const annualRows = (label, key, neg=false) => {
      const cells = years.map(y => {
        const v = annual[y]?.[key] ?? 0;
        return `<td class="${v < 0 ? "neg" : (v > 0 ? "pos" : "")}">${v < 0 ? "(" + Math.abs(Math.round(v)).toLocaleString() + ")" : Math.round(v).toLocaleString()}</td>`;
      }).join("");
      const total = years.reduce((a, y) => a + (annual[y]?.[key] ?? 0), 0);
      return `<tr><td>${label}</td>${cells}<td class="${total<0?"neg":"pos"}"><strong>${total<0?"("+Math.abs(Math.round(total)).toLocaleString()+")":Math.round(total).toLocaleString()}</strong></td></tr>`;
    };
    const projectRows = r.by_project.map(res => {
      const p = state.projects.find(x => x.id === res.project_id);
      return `<tr>
        <td>${p.name}</td>
        <td>${p.status}</td>
        <td>${p.start_date}</td>
        <td>${res.sale_date || ""}</td>
        <td>${p.villa_sqft.toLocaleString()}</td>
        <td class="neg">(${Math.round(p.land_cost_usd).toLocaleString()})</td>
        <td class="pos">${Math.round(res.kpis.total_sales).toLocaleString()}</td>
        <td class="${res.kpis.gross_profit>=0?'pos':'neg'}">${res.kpis.gross_profit>=0?Math.round(res.kpis.gross_profit).toLocaleString():"("+Math.abs(Math.round(res.kpis.gross_profit)).toLocaleString()+")"}</td>
        <td>${(res.kpis.profit_margin_pct*100).toFixed(1)}%</td>
        <td>${(res.kpis.moic||0).toFixed(2)}x</td>
        <td>${res.kpis.irr_annual==null?"—":(res.kpis.irr_annual*100).toFixed(1)+"%"}</td>
      </tr>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Juno · Portfolio report ${date}</title><style>${css}</style></head><body>
      <h1>Juno · Portfolio report</h1>
      <div class="meta">Scenario: ${state.scenario.name} · Generated ${date} · ${state.projects.length - state.scenario.excluded_project_ids.length} active projects · Source: Juno_Cash flow Forecast_20260412_MASTER.xlsx (snapshot 2026-05-10)</div>

      <h2>Headline KPIs</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="l">Peak equity required</div><div class="v">$${(k.peak_equity_required/1e6).toFixed(1)}M</div></div>
        <div class="kpi"><div class="l">Max debt outstanding</div><div class="v">$${(k.max_debt_outstanding/1e6).toFixed(1)}M</div></div>
        <div class="kpi"><div class="l">Total sales</div><div class="v">$${(k.total_sales/1e6).toFixed(1)}M</div></div>
        <div class="kpi"><div class="l">Profit before tax</div><div class="v ${k.total_profit_before_tax<0?'neg':'pos'}">$${(k.total_profit_before_tax/1e6).toFixed(1)}M</div></div>
        <div class="kpi"><div class="l">Gross MOIC</div><div class="v">${k.moic_gross.toFixed(2)}x</div></div>
        <div class="kpi"><div class="l">Annualized IRR</div><div class="v">${k.irr_annual==null?"—":(k.irr_annual*100).toFixed(1)+"%"}</div></div>
      </div>

      <h2>Annual P&L (USD)</h2>
      <table>
        <thead><tr><th>USD</th>${years.map(y=>`<th>${y}</th>`).join("")}<th>Total</th></tr></thead>
        <tbody>
          ${annualRows("Sales", "sales")}
          ${annualRows("Land cost", "land")}
          ${annualRows("Construction", "build")}
          ${annualRows("Kingshaus", "kingshaus")}
          ${annualRows("Soft costs", "soft")}
          ${annualRows("Overhead", "opex")}
          ${annualRows("Financing", "interest")}
          ${annualRows("Profit before tax", "profit_before_tax")}
        </tbody>
      </table>

      <h2>Project portfolio</h2>
      <table>
        <thead><tr><th>Project</th><th>Status</th><th>Start</th><th>Sale</th><th>Sqft</th><th>Land</th><th>Sale</th><th>Profit</th><th>Margin</th><th>MOIC</th><th>IRR</th></tr></thead>
        <tbody>${projectRows}</tbody>
      </table>

      <div class="footer">Juno Financial Dashboard · printable HTML report · Print this page or save as PDF using your browser's print function (Ctrl+P / Cmd+P).</div>
    </body></html>`;
    downloadBlob(html, `juno-portfolio-report-${date}.html`, "text/html;charset=utf-8");
  });

  document.getElementById("export-annual-csv")?.addEventListener("click", () => {
    const r = aggregatePortfolio(state.projects, state.globals, state.scenario);
    const years = Object.keys(r.annual).sort();
    const rows = [["FY", "Sales", "Land", "Build", "Kingshaus", "Soft", "Opex", "Interest", "Profit before tax"]];
    for (const y of years) {
      const a = r.annual[y];
      rows.push([y, Math.round(a.sales), Math.round(a.land), Math.round(a.build), Math.round(a.kingshaus), Math.round(a.soft), Math.round(a.opex), Math.round(a.interest), Math.round(a.profit_before_tax)]);
    }
    downloadCSV(rows, `juno-annual-pnl-${state.scenario.name.replace(/\s+/g, "-")}.csv`);
  });

  // Scenario form
  document.getElementById("scn-apply")?.addEventListener("click", () => {
    const patch = {
      name: document.getElementById("scn-name").value || "Custom",
      interest_rate_delta_bps: Number(document.getElementById("scn-interest-bps").value) || 0,
      build_cost_multiplier: Number(document.getElementById("scn-build-mult").value) || 1,
      sale_price_multiplier: Number(document.getElementById("scn-sale-mult").value) || 1,
      margin_override: document.getElementById("scn-margin").value === "" ? null : Number(document.getElementById("scn-margin").value),
      timing_shift_months: Number(document.getElementById("scn-timing").value) || 0,
    };
    updateScenario(patch);
  });
  document.getElementById("scn-reset")?.addEventListener("click", () => {
    updateScenario({ name:"Base case", interest_rate_delta_bps:0, build_cost_multiplier:1, sale_price_multiplier:1, margin_override:null, timing_shift_months:0 });
  });
  document.getElementById("scn-save")?.addEventListener("click", () => {
    const name = document.getElementById("scn-name").value.trim() || "Unnamed";
    const classification = document.getElementById("scn-class")?.value || state.scenario.class || "custom";
    saveCurrentScenario(name, classification);
  });
  // v14.8 (Phase 3.2) — Duplicate / classify / lock controls
  document.getElementById("scn-duplicate")?.addEventListener("click", () => {
    duplicateCurrentScenario();
  });
  document.getElementById("scn-class")?.addEventListener("change", (e) => {
    classifyScenario(state.scenario.name, e.target.value);
  });
  document.getElementById("scn-locked")?.addEventListener("change", (e) => {
    setScenarioLock(state.scenario.name, e.target.checked);
  });
  for (const btn of document.querySelectorAll("[data-toggle-lock]")) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const name = btn.dataset.toggleLock;
      const scn = state.scenarios.find(s => s.name === name) || (state.scenario.name === name ? state.scenario : null);
      if (scn) setScenarioLock(name, !scn.locked);
    });
  }
  for (const td of document.querySelectorAll("[data-load-scenario]")) {
    td.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON") return;  // delete button handled separately
      const name = td.dataset.loadScenario;
      if (name === "Base") {
        updateScenario({ name:"Base case", interest_rate_delta_bps:0, build_cost_multiplier:1, sale_price_multiplier:1, margin_override:null, timing_shift_months:0 });
      } else {
        loadScenario(name);
      }
    });
  }
  for (const btn of document.querySelectorAll("[data-delete-scenario]")) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const name = btn.dataset.deleteScenario;
      confirmDialog({
        title: "Delete this scenario?",
        message: `"${name}" will be permanently removed. This cannot be undone.`,
        confirmLabel: "Delete scenario",
        cancelLabel: "Keep it",
        danger: true,
        onConfirm: () => deleteScenario(name),
      });
    });
  }
  for (const btn of document.querySelectorAll("[data-preset]")) {
    btn.addEventListener("click", () => {
      if (btn.dataset.preset === "stress") {
        updateScenario({ name:"Stress", interest_rate_delta_bps:200, build_cost_multiplier:1.1, sale_price_multiplier:0.95, margin_override:null, timing_shift_months:3 });
      } else if (btn.dataset.preset === "optimistic") {
        updateScenario({ name:"Optimistic", interest_rate_delta_bps:-100, build_cost_multiplier:0.95, sale_price_multiplier:1.05, margin_override:null, timing_shift_months:0 });
      }
    });
  }
  for (const cb of document.querySelectorAll("[data-exclude-id]")) {
    cb.addEventListener("change", () => toggleProjectExclusion(cb.dataset.excludeId));
  }
}

// ---------- charts ----------

function renderCharts(result) {
  const isDark = state.ui.theme === "dark";
  const fg = isDark ? "#e8e8e3" : "#131313";
  const grid = isDark ? "#2a2a2a" : "#e8e8e3";
  Chart.defaults.font.family = '"Inter", system-ui, sans-serif';
  Chart.defaults.color = fg;
  Chart.defaults.borderColor = grid;

  if (state.ui.view === "portfolio") {
    drawCashflowChart(result, isDark);
    drawBalancesChart(result, isDark);
  } else if (state.ui.view === "project_detail") {
    // Tab-specific chart draws — Summary keeps the existing cash-flow chart,
    // Timeline gets the new burn schedule chart.
    if (state.ui.project_tab === "summary") {
      drawProjectChart(result, isDark);
      renderTakeoffPanel(state.ui.selected_project_id);
    } else if (state.ui.project_tab === "timeline") {
      drawBurnChart(result, isDark);
    }
  } else if (state.ui.view === "capital_overview") {
    drawLocDrawdownChart(result, isDark);
    drawCapitalStackChart(result, isDark);
  } else if (state.ui.view === "waterfall") {
    drawWaterfallChart(result, isDark);
    drawEquityMonthlyChart(result, isDark);
  } else if (state.ui.view === "sensitivity") {
    drawTornadoChart(result, isDark);
  } else if (state.ui.view === "risk") {
    renderMcCharts(isDark);
  } else if (state.ui.view === "scenario") {
    drawScenarioOverlay(result, isDark);
    drawScenarioCashflow(result, isDark);
  }
}

// ---------- New Project wizard (v14.1, Phase 1.1) ----------

// v14.16 (2026-05-19) — 6-step wizard. Timing folded into Program.
const WIZARD_STEPS = [
  { key: "basics",    title: "Basics" },
  { key: "program",   title: "Program" },
  { key: "costs",     title: "Costs" },
  { key: "revenue",   title: "Revenue" },
  { key: "financing", title: "Financing" },
  { key: "review",    title: "Review" },
];

function renderWizardOverlay() {
  const w = state.ui.wizard;
  if (!w.open || !w.draft) return "";
  const d = w.draft;
  const step = w.step;
  const isLastStep = step === WIZARD_STEPS.length - 1;
  const canSubmit = !!(d.name && d.name.trim());

  const railHtml = WIZARD_STEPS.map((s, i) => {
    const cls = i === step ? "active" : i < step ? "done" : "future";
    return `<button class="wizard-rail-step ${cls}" data-wizard-step="${i}">
      <span class="step-num">${i < step ? "✓" : i + 1}</span>
      <span class="step-label">${s.title}</span>
    </button>`;
  }).join("");

  return `
    <div class="wizard-overlay" id="wizard-overlay" role="dialog" aria-label="New project">
      <div class="wizard-modal" id="wizard-modal">
        <aside class="wizard-rail">
          <div class="wizard-rail-title">New project</div>
          ${railHtml}
          <div style="flex:1;"></div>
          <button class="link-btn" id="wizard-discard" style="margin-top:18px;padding:6px 8px;text-align:left;">Discard draft</button>
        </aside>
        <div class="wizard-body">
          <div class="wizard-content">${renderWizardStep(step, d)}</div>
          <div class="wizard-footer">
            <button class="link-btn" id="wizard-cancel">Save draft & close</button>
            <div class="row gap-sm">
              ${step > 0 ? `<button class="btn secondary" id="wizard-back">Back</button>` : ""}
              ${!isLastStep
                ? `<button class="btn" id="wizard-next">Next</button>`
                : `<button class="btn" id="wizard-submit" ${canSubmit ? "" : "disabled title=\"Project name is required\""}>Create project</button>`}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderWizardStep(step, d) {
  // v14.16 — Timing removed; folded into Program.
  switch (step) {
    case 0: return renderWizardBasics(d);
    case 1: return renderWizardProgram(d);
    case 2: return renderWizardCosts(d);
    case 3: return renderWizardRevenue(d);
    case 4: return renderWizardFinancing(d);
    case 5: return renderWizardReview(d);
  }
  return "";
}

// Helper: render a number input that stores null when empty (so engine falls back to globals)
function nullableNumInput(field, value, placeholder = "Uses default") {
  const v = value == null ? "" : value;
  return `<input class="input ${value == null ? "override-empty" : ""}" type="number" inputmode="decimal" step="any"
    data-wiz="${field}" data-wiz-type="nullable-number" value="${v}" placeholder="${placeholder}">`;
}

function renderWizardBasics(d) {
  const markets = state.globals.markets || [];
  const appliedTemplateId = d._applied_template_id;
  const templatePicker = `
    <div class="wizard-templates">
      <div class="wizard-templates-label">Quick-start template</div>
      <div class="wizard-templates-row">
        ${PROJECT_TEMPLATES.map(t => `
          <button type="button" class="wizard-template-chip ${appliedTemplateId === t.id ? "active" : ""}" data-template="${t.id}" title="${escapeHtml(t.description)}">
            ${t.label}
          </button>
        `).join("")}
        <button type="button" class="wizard-template-chip ghost ${!appliedTemplateId ? "active" : ""}" data-template="">
          Custom
        </button>
      </div>
      ${appliedTemplateId ? `<div class="wizard-templates-hint muted">${escapeHtml(PROJECT_TEMPLATES.find(t => t.id === appliedTemplateId)?.description || "")}</div>` : `<div class="wizard-templates-hint muted">Pick a template to pre-fill sensible defaults, or stay custom and fill everything yourself.</div>`}
    </div>
  `;
  return `
    <h2>Project basics</h2>
    <p class="muted">Identify the project. Only the name is required — the rest can be filled in later.</p>
    ${templatePicker}
    <div class="form-grid">
      <div class="form-row full">
        <label>Project name <span class="required">*</span></label>
        <input class="input" type="text" data-wiz="name" value="${escapeHtml(d.name || "")}" placeholder="e.g. 84 SBR (Project 2)" autofocus>
      </div>
      <div class="form-row full">
        <label>Address</label>
        <input class="input" type="text" data-wiz="address" value="${escapeHtml(d.address || "")}" placeholder="Site address or 'TBC'">
      </div>
      <div class="form-row full">
        <label>Google Maps link <span class="muted" style="font-weight:400;">(optional)</span></label>
        <input class="input" type="url" data-wiz="google_maps_url" value="${escapeHtml(d.google_maps_url || "")}" placeholder="https://maps.google.com/...">
        <div class="hint">Paste a Google Maps share link so anyone on the team can find the site.</div>
      </div>
      <div class="form-row">
        <label>Entity / SPV</label>
        <input class="input" type="text" data-wiz="entity_spv" value="${escapeHtml(d.entity_spv || "")}" placeholder="Optional — e.g. Juno SPV 6 LLC">
      </div>
      <div class="form-row">
        <label>Market</label>
        <select class="input" data-wiz="market">
          ${markets.map(m => `<option value="${m.id}" ${d.market === m.id ? "selected" : ""}>${m.name}</option>`).join("")}
        </select>
        <div class="hint">Affects sale price &amp; build cost multipliers.</div>
      </div>
      <div class="form-row">
        <label>Asset type</label>
        <select class="input" data-wiz="asset_type">
          ${ASSET_TYPES.map(t => `<option value="${t.id}" ${d.asset_type === t.id ? "selected" : ""}>${t.label}</option>`).join("")}
        </select>
      </div>
      <div class="form-row">
        <label>Stage</label>
        <select class="input" data-wiz="stage">
          ${LIFECYCLE_STAGES.map(s => `<option value="${s.id}" ${d.stage === s.id ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
        <div class="hint">Defaults to <em>Sourcing</em> for a fresh project.</div>
      </div>
      <div class="form-row">
        <label>Status</label>
        <div class="row gap-sm" style="padding-top:4px;">
          <label class="toggle"><input type="radio" name="wiz-status" value="pipeline" data-wiz="status" data-wiz-type="radio" ${d.status === "pipeline" ? "checked" : ""}> Pipeline</label>
          <label class="toggle"><input type="radio" name="wiz-status" value="committed" data-wiz="status" data-wiz-type="radio" ${d.status === "committed" ? "checked" : ""}> Committed</label>
        </div>
      </div>
    </div>
  `;
}

function renderWizardProgram(d) {
  // v14.16 — Program absorbs Timing. Villa size split into AG + BG. Duration
  // broken into 4 buckets so the team can plan each phase explicitly.
  const ag = d.villa_sqft_ag ?? 0;
  const bg = d.villa_sqft_bg ?? 0;
  const sourcing = d.sourcing_months ?? 0;
  const permpre = d.permitting_preconstruction_months ?? 0;
  const construction = d.construction_months ?? 0;
  const sales = d.sales_months ?? 0;
  const totalSqft = ag + bg;
  const totalMonths = sourcing + permpre + construction + sales;
  return `
    <h2>Program</h2>
    <p class="muted">How big is the build, how long does each phase take, and when do you take title to the land?</p>

    <div class="section-title" style="margin-top:8px;">Villa size</div>
    <div class="form-grid">
      <div class="form-row">
        <label>Above ground (AG) sqft</label>
        <input class="input" type="number" inputmode="numeric" data-wiz="villa_sqft_ag" data-wiz-type="number" value="${ag}" min="0" step="100">
      </div>
      <div class="form-row">
        <label>Below ground (BG) sqft</label>
        <input class="input" type="number" inputmode="numeric" data-wiz="villa_sqft_bg" data-wiz-type="number" value="${bg}" min="0" step="100">
        <div class="hint">Basement / cellar.</div>
      </div>
      <div class="form-row full">
        <div class="hint">Total villa size: <strong style="color:var(--fg);">${totalSqft.toLocaleString()} sqft</strong></div>
      </div>
    </div>

    <div class="section-title" style="margin-top:16px;">Program duration</div>
    <div class="form-grid">
      <div class="form-row">
        <label>Sourcing (months)</label>
        <input class="input" type="number" inputmode="numeric" data-wiz="sourcing_months" data-wiz-type="number" value="${sourcing}" min="0" step="1">
      </div>
      <div class="form-row">
        <label>Permitting &amp; pre-construction (months)</label>
        <input class="input" type="number" inputmode="numeric" data-wiz="permitting_preconstruction_months" data-wiz-type="number" value="${permpre}" min="0" step="1">
      </div>
      <div class="form-row">
        <label>Construction (months)</label>
        <input class="input" type="number" inputmode="numeric" data-wiz="construction_months" data-wiz-type="number" value="${construction}" min="0" step="1">
      </div>
      <div class="form-row">
        <label>Sales (months)</label>
        <input class="input" type="number" inputmode="numeric" data-wiz="sales_months" data-wiz-type="number" value="${sales}" min="0" step="1">
        <div class="hint">List → closing.</div>
      </div>
      <div class="form-row full">
        <div class="hint">Total program duration: <strong style="color:var(--fg);">${totalMonths} months</strong></div>
      </div>
    </div>

    <div class="section-title" style="margin-top:16px;">Timing</div>
    <div class="form-grid">
      <div class="form-row">
        <label>Land purchase date (YYYY-MM)</label>
        <input class="input" type="text" data-wiz="purchase_date" value="${escapeHtml(d.purchase_date || "")}" placeholder="2026-03" pattern="\\d{4}-\\d{2}">
        <div class="hint">Month you take title. Sale date is computed from this plus total program duration.</div>
      </div>
    </div>
  `;
}

function renderWizardCosts(d) {
  // v14.16 — At sourcing, just need land + $/sqft. Detailed cost breakdown
  // (Kingshaus, soft costs, etc.) belongs on the Inputs tab later in the lifecycle.
  // Full Excel/CSV cost upload is on the Phase 4.5 roadmap.
  const g = state.globals;
  return `
    <h2>Costs</h2>
    <p class="muted">At the sourcing stage we just need land + build $/sqft. Detailed cost breakdown (Kingshaus, soft costs, change orders) can be filled in later on the project's <strong>Inputs</strong> tab.</p>
    <div class="form-grid">
      <div class="form-row">
        <label>Land cost (USD)</label>
        <input class="input" type="number" inputmode="decimal" data-wiz="land_cost_usd" data-wiz-type="number" value="${d.land_cost_usd ?? g.default_land_cost_usd}" min="0" step="10000">
      </div>
      <div class="form-row">
        <label>Build cost ($/sqft)</label>
        ${nullableNumInput("build_cost_per_sqft", d.build_cost_per_sqft, `Default: $${g.default_build_cost_per_sqft}`)}
        <div class="hint">All-in hard construction $/sqft. Default: $${g.default_build_cost_per_sqft}.</div>
      </div>
    </div>
    <div class="note" style="margin-top:18px;">
      <strong>Coming soon:</strong> upload an Excel or CSV cost breakdown directly into the wizard. For now,
      detailed line-item costs go on the Inputs tab after the project is created.
    </div>
  `;
}

function renderWizardRevenue(d) {
  const g = state.globals;
  return `
    <h2>Revenue</h2>
    <p class="muted">If you have a goal sale price, set it here. Otherwise leave blank and the engine derives from cost &times; (1 + margin).</p>
    <div class="form-grid">
      <div class="form-row">
        <label>Goal sale price (USD)</label>
        ${nullableNumInput("sale_price_override_usd", d.sale_price_override_usd, "Engine will derive from cost + margin")}
      </div>
      <div class="form-row">
        <label>Sale price ($/sqft)</label>
        ${nullableNumInput("sale_price_per_sqft_override", d.sale_price_per_sqft_override, "Alternative to total $")}
        <div class="hint">Either total $ OR $/sqft — not both.</div>
      </div>
      <div class="form-row">
        <label>Target margin (decimal)</label>
        ${nullableNumInput("target_margin", d.target_margin, `Default: ${g.target_margin}`)}
        <div class="hint">0.25 = 25% margin. Default: ${(g.target_margin * 100).toFixed(0)}%</div>
      </div>
    </div>
  `;
}

function renderWizardFinancing(d) {
  // v14.24 — Capital stack now matches the Excel "Financing 84SB" tab layout:
  // hard costs + contingency on top, then financing-eligible costs (closing,
  // interest reserve) included in the LTC base, then non-financed fees (orig,
  // exit, servicing, "other") layered below the loan as required equity.
  //
  // KPC's $6M LOC is portfolio-wide subordinated debt — modeled on the
  // Capital screen, not here.
  const g = state.globals;
  const land = d.land_cost_usd ?? g.default_land_cost_usd;
  const buildPsf = d.build_cost_per_sqft ?? g.default_build_cost_per_sqft;
  const sqft = (d.villa_sqft_ag ?? 0) + (d.villa_sqft_bg ?? 0);
  const buildTotal = buildPsf * sqft;
  const contingencyPct = d.contingency_pct ?? g.contingency_pct ?? 0.05;
  const contingency = (land + buildTotal) * contingencyPct;
  const closingCosts = d.closing_costs_usd ?? 0;
  const interestReserve = d.interest_reserve_usd ?? 0;
  const loanServicing = d.loan_servicing_fee_usd ?? 0;

  // Lender finances land + build + contingency + closing + interest reserve.
  // Origination + exit + loan servicing are paid by the borrower (equity).
  const ltv = d.senior_ltv_pct ?? 0.75;
  const ltcBase = land + buildTotal + contingency + closingCosts + interestReserve;
  const seniorLoan = Math.round(ltcBase * ltv);

  const origPct = d.origination_fee_pct ?? 0.01;
  const exitPct = d.exit_fee_pct ?? 0.005;
  const orig = origPct * seniorLoan;
  const exit = exitPct * seniorLoan;

  const otherFees = Array.isArray(d.other_fees) ? d.other_fees : [];
  const otherFeesTotal = otherFees.reduce((a, f) => a + (Number(f.amount_usd) || 0), 0);

  const financeFeesTotal = orig + exit + loanServicing + otherFeesTotal;
  const totalAllIn = ltcBase + financeFeesTotal;
  const capitalInjection = Math.max(0, totalAllIn - seniorLoan);

  return `
    <h2>Financing — external senior debt</h2>
    <p class="muted">The senior loan from your external lender (e.g. <strong style="color:var(--fg);">Harrison Capital</strong> on 84SBR). Modeled from the Excel 'Financing 84SB' tab.<br><span class="muted">KPC's $6M LOC is portfolio-wide subordinated debt — managed on the <strong style="color:var(--fg);">Capital</strong> screen, not here.</span></p>

    <div class="section-title" style="margin-top:8px;">Lender</div>
    <div class="form-grid">
      <div class="form-row full">
        <label>Lender name</label>
        <input class="input" type="text" data-wiz="lender_name" value="${escapeHtml(d.lender_name || "")}" placeholder="e.g. Harrison Capital (USCNYC)">
      </div>
      <div class="form-row">
        <label>Loan-to-cost (LTC %)</label>
        <input class="input" type="number" inputmode="decimal" step="0.01" min="0" max="1" data-wiz="senior_ltv_pct" data-wiz-type="number" value="${ltv}">
        <div class="hint">75% (0.75) is typical. Applied to land + build + contingency + closing + interest reserve.</div>
      </div>
      <div class="form-row">
        <label>Interest rate APR</label>
        ${nullableNumInput("interest_rate_apr", d.interest_rate_apr, `Default: ${g.interest_rate_apr}`)}
        <div class="hint">Default ${(g.interest_rate_apr * 100).toFixed(1)}%.</div>
      </div>
      <div class="form-row">
        <label>Contingency (% of hard cost)</label>
        <input class="input" type="number" inputmode="decimal" step="0.01" min="0" max="0.20" data-wiz="contingency_pct" data-wiz-type="number" value="${contingencyPct}">
        <div class="hint">Default ${(g.contingency_pct * 100).toFixed(0)}%. Financed by the loan.</div>
      </div>
    </div>

    <div class="section-title" style="margin-top:16px;">Standard fees</div>
    <div class="form-grid">
      <div class="form-row">
        <label>Origination fee (% of loan)</label>
        <input class="input" type="number" inputmode="decimal" step="0.001" min="0" max="0.05" data-wiz="origination_fee_pct" data-wiz-type="number" value="${origPct}">
        <div class="hint">Typically 1.0% (0.01). Paid at closing.</div>
      </div>
      <div class="form-row">
        <label>Exit fee (% of loan)</label>
        <input class="input" type="number" inputmode="decimal" step="0.001" min="0" max="0.05" data-wiz="exit_fee_pct" data-wiz-type="number" value="${exitPct}">
        <div class="hint">Typically 0.5% (0.005). Paid at sale.</div>
      </div>
      <div class="form-row">
        <label>Interest reserve (USD)</label>
        <input class="input" type="number" inputmode="decimal" step="1000" min="0" data-wiz="interest_reserve_usd" data-wiz-type="number" value="${interestReserve}">
        <div class="hint">Pre-funded at closing. Financed by the loan.</div>
      </div>
      <div class="form-row">
        <label>Loan servicing fee (USD)</label>
        <input class="input" type="number" inputmode="decimal" step="500" min="0" data-wiz="loan_servicing_fee_usd" data-wiz-type="number" value="${loanServicing}">
      </div>
      <div class="form-row full">
        <label>Closing costs (USD)</label>
        <input class="input" type="number" inputmode="decimal" step="1000" min="0" data-wiz="closing_costs_usd" data-wiz-type="number" value="${closingCosts}">
        <div class="hint">All-in land closing costs (transfer tax, recording, title insurance, legal, appraisal, environmental). 84SBR baseline: $227,000.</div>
      </div>
    </div>

    <div class="section-title" style="margin-top:16px;">Other fees</div>
    <div class="other-fees">
      ${otherFees.length === 0 ? `<div class="muted other-fees-empty">No other fees. Click below to add one (e.g. environmental study, broker fee).</div>` : ""}
      ${otherFees.map((f, idx) => `
        <div class="other-fee-row">
          <input class="input" type="text" data-other-fee="${idx}" data-field="description" value="${escapeHtml(f.description || "")}" placeholder="Description (e.g. environmental study)">
          <input class="input num" type="number" inputmode="decimal" step="100" min="0" data-other-fee="${idx}" data-field="amount_usd" value="${f.amount_usd || 0}">
          <button class="btn small ghost row-remove-btn" data-remove-other-fee="${idx}" title="Remove fee" aria-label="Remove fee">✕</button>
        </div>
      `).join("")}
      <button class="btn small secondary mt-12" id="add-other-fee">+ Add other fee</button>
    </div>

    <div class="section-title" style="margin-top:24px;">Capital stack preview</div>
    <div class="wizard-summary capital-stack-preview">
      <table class="tbl">
        <tbody>
          <tr class="cs-section-head"><td colspan="2">Hard costs</td></tr>
          <tr><td>Land</td><td class="num">${fmt.usdM(land)}</td></tr>
          <tr><td>Build (${sqft.toLocaleString()} sqft × $${buildPsf}/sqft)</td><td class="num">${fmt.usdM(buildTotal)}</td></tr>
          <tr><td>Contingency (${(contingencyPct*100).toFixed(1)}% of hard)</td><td class="num">${fmt.usdM(contingency)}</td></tr>

          <tr class="cs-section-head"><td colspan="2">Financed costs</td></tr>
          <tr><td>Closing costs</td><td class="num">${fmt.usdM(closingCosts)}</td></tr>
          <tr><td>Interest reserve</td><td class="num">${fmt.usdM(interestReserve)}</td></tr>
          <tr class="cs-subtotal"><td><strong>LTC base</strong> <span class="muted" style="font-weight:400;">(eligible for senior debt)</span></td><td class="num"><strong>${fmt.usdM(ltcBase)}</strong></td></tr>

          <tr class="cs-section-head"><td colspan="2">Borrower-paid fees</td></tr>
          <tr><td>Origination fee (${(origPct*100).toFixed(2)}% × loan)</td><td class="num">${fmt.usdM(orig)}</td></tr>
          <tr><td>Exit fee (${(exitPct*100).toFixed(2)}% × loan)</td><td class="num">${fmt.usdM(exit)}</td></tr>
          <tr><td>Loan servicing fee</td><td class="num">${fmt.usdM(loanServicing)}</td></tr>
          ${otherFees.map(f => `<tr><td>${escapeHtml(f.description || "Other fee")}</td><td class="num">${fmt.usdM(Number(f.amount_usd) || 0)}</td></tr>`).join("")}

          <tr class="cs-total"><td><strong>Total all-in cost</strong></td><td class="num"><strong>${fmt.usdM(totalAllIn)}</strong></td></tr>
          <tr><td>Senior loan @ ${(ltv * 100).toFixed(0)}% of LTC base</td><td class="num pos">${fmt.usdM(seniorLoan)}</td></tr>
          <tr class="cs-injection"><td><strong>Capital injection needed</strong> <span class="muted" style="font-weight:400;">(Juno equity / KPC LOC)</span></td><td class="num ${capitalInjection > 0 ? "neg" : ""}"><strong>${fmt.usdM(capitalInjection)}</strong></td></tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderWizardReview(d) {
  // v14.16 — Derive engine-compat fields from the new schema so calcProject works.
  const totalSqft = (d.villa_sqft_ag ?? 0) + (d.villa_sqft_bg ?? 0);
  const totalMonths = (d.sourcing_months ?? 0) + (d.permitting_preconstruction_months ?? 0)
    + (d.construction_months ?? 0) + (d.sales_months ?? 0);
  const draftProject = {
    id: "__draft__",
    ...d,
    villa_sqft: totalSqft || 1,                                  // engine needs >0 to avoid div-by-zero
    program_months: totalMonths || 13,
    start_date: d.purchase_date || d.start_date || state.globals.model_start,
    // Map new senior_ltv_pct to the engine's existing ltc_pct field
    ltc_pct: d.senior_ltv_pct ?? null,
  };
  let project, err = null;
  try {
    project = calcProject(draftProject, state.globals, state.scenario);
  } catch (e) {
    err = e?.message || String(e);
  }
  const k = project?.kpis;
  const market = state.globals.markets?.find(m => m.id === d.market);
  const assetType = ASSET_TYPES.find(t => t.id === d.asset_type);
  const stage = LIFECYCLE_STAGES.find(s => s.id === d.stage);

  // v14.24 — Finance fees aren't in the engine yet (those fields are local to
  // the wizard's financing step). Compute the borrower-paid fees here so the
  // Review page can surface them alongside the engine-computed interest cost.
  const g = state.globals;
  const land = d.land_cost_usd ?? g.default_land_cost_usd;
  const buildPsf = d.build_cost_per_sqft ?? g.default_build_cost_per_sqft;
  const buildTotal = buildPsf * totalSqft;
  const contingencyPct = d.contingency_pct ?? g.contingency_pct ?? 0.05;
  const contingency = (land + buildTotal) * contingencyPct;
  const closingCosts = d.closing_costs_usd ?? 0;
  const interestReserve = d.interest_reserve_usd ?? 0;
  const ltv = d.senior_ltv_pct ?? 0.75;
  const ltcBase = land + buildTotal + contingency + closingCosts + interestReserve;
  const seniorLoan = Math.round(ltcBase * ltv);
  const orig = (d.origination_fee_pct ?? 0.01) * seniorLoan;
  const exit = (d.exit_fee_pct ?? 0.005) * seniorLoan;
  const loanServicing = d.loan_servicing_fee_usd ?? 0;
  const otherFees = Array.isArray(d.other_fees) ? d.other_fees : [];
  const otherFeesTotal = otherFees.reduce((a, f) => a + (Number(f.amount_usd) || 0), 0);
  const financeFeesTotal = orig + exit + loanServicing + otherFeesTotal;
  const interestCost = k?.total_interest || 0;
  const allInCost = (k?.total_dev_cost || 0) + financeFeesTotal;  // dev cost already includes interest

  return `
    <h2>Review &amp; create</h2>
    <p class="muted">Confirm the project before saving. Every field is editable after creation.</p>
    <div class="wizard-summary">
      <div class="wizard-summary-header">
        <strong>${escapeHtml(d.name || "Untitled project")}</strong>
        <span class="muted">${escapeHtml(d.address || "—")} · ${escapeHtml(market?.name || "—")} · ${escapeHtml(assetType?.label || "—")} · ${escapeHtml(stage?.label || "—")}</span>
      </div>
      ${err ? `<div class="note neg">Engine error: ${escapeHtml(err)}</div>` : k ? `
        <div class="kpi-section">
          <div class="kpi-section-label">Cost &amp; revenue</div>
          <div class="kpi-grid">
            ${kpiCard("All-in cost", fmt.usdM(allInCost), `Dev + financing fees`)}
            ${kpiCard("Gross sale value", fmt.usdM(k.total_sales))}
            ${kpiCard("Projected profit", fmt.usdM(k.gross_profit), "", k.gross_profit >= 0 ? "pos" : "neg")}
            ${kpiCard("Margin", fmt.pct(k.profit_margin_pct))}
          </div>
        </div>
        <div class="kpi-section">
          <div class="kpi-section-label">Cost of financing</div>
          <div class="kpi-grid">
            ${kpiCard("Finance fees", fmt.usdM(financeFeesTotal), `Orig + exit + servicing${otherFees.length ? " + other" : ""}`)}
            ${kpiCard("Interest cost", fmt.usdM(interestCost), `Over ${totalMonths}-mo program`)}
            ${kpiCard("Peak equity", fmt.usdM(k.peak_equity))}
            ${kpiCard("Max debt", fmt.usdM(k.peak_debt))}
          </div>
        </div>
        <div class="kpi-section" style="margin-bottom:0;">
          <div class="kpi-section-label">Returns</div>
          <div class="kpi-grid">
            ${kpiCard("IRR (annual)", k.irr_annual == null ? "—" : fmt.pct(k.irr_annual))}
            ${kpiCard("MOIC", k.moic ? `${k.moic.toFixed(2)}x` : "—")}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function attachWizardEvents() {
  const overlay = document.getElementById("wizard-overlay");
  const modal = document.getElementById("wizard-modal");
  if (!overlay || !modal) return;

  // Click outside modal → save and close
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeWizard();
  });

  // Esc → save and close
  const escHandler = (e) => {
    if (e.key === "Escape" && state.ui.wizard.open) {
      closeWizard();
    }
  };
  document.addEventListener("keydown", escHandler, { once: true });

  // Step rail
  for (const btn of modal.querySelectorAll("[data-wizard-step]")) {
    btn.addEventListener("click", () => setWizardStep(Number(btn.dataset.wizardStep)));
  }

  // v14.12 (Phase 4.2) — Template chips on the Basics step
  for (const btn of modal.querySelectorAll("[data-template]")) {
    btn.addEventListener("click", () => {
      const id = btn.dataset.template;
      if (!id) {
        // "Custom" — clear applied template marker, don't touch other fields
        updateWizardDraft({ _applied_template_id: null });
        return;
      }
      const tpl = PROJECT_TEMPLATES.find(t => t.id === id);
      if (!tpl) return;
      updateWizardDraft({ ...tpl.patch, _applied_template_id: id });
    });
  }

  // Field bindings
  for (const el of modal.querySelectorAll("[data-wiz]")) {
    const field = el.dataset.wiz;
    const type = el.dataset.wizType || "text";
    const handler = () => {
      let val;
      if (type === "radio") {
        if (!el.checked) return;
        val = el.value;
      } else if (type === "number") {
        val = el.value === "" ? null : Number(el.value);
        if (val != null && isNaN(val)) val = null;
      } else if (type === "nullable-number") {
        val = el.value === "" ? null : Number(el.value);
        if (val != null && isNaN(val)) val = null;
      } else if (el.tagName === "SELECT") {
        val = el.value;
      } else {
        val = el.value;
        if (field === "entity_spv" && !val) val = null;
        if (field === "listing_date" && !val) val = null;
      }
      updateWizardDraft({ [field]: val });
    };
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
  }

  // Nav buttons
  document.getElementById("wizard-cancel")?.addEventListener("click", () => closeWizard());
  document.getElementById("wizard-discard")?.addEventListener("click", () => {
    confirmDialog({
      title: "Discard this draft?",
      message: "Everything you've entered in the wizard will be lost.",
      confirmLabel: "Discard draft",
      cancelLabel: "Keep editing",
      danger: true,
      onConfirm: () => discardWizardDraft(),
    });
  });
  document.getElementById("wizard-back")?.addEventListener("click", () => setWizardStep(state.ui.wizard.step - 1));
  document.getElementById("wizard-next")?.addEventListener("click", () => {
    // Step 0 (Basics) requires name. Block "Next" until they fill it.
    if (state.ui.wizard.step === 0 && !state.ui.wizard.draft.name?.trim()) {
      const nameInput = modal.querySelector('[data-wiz="name"]');
      nameInput?.focus();
      nameInput?.classList.add("override-empty");
      return;
    }
    setWizardStep(state.ui.wizard.step + 1);
  });
  document.getElementById("wizard-submit")?.addEventListener("click", () => {
    const id = submitWizardDraft();
    if (id) setView("project_detail", id);
  });

  // v14.24 — Other fees: add / edit / remove
  document.getElementById("add-other-fee")?.addEventListener("click", () => {
    const current = Array.isArray(state.ui.wizard.draft.other_fees) ? state.ui.wizard.draft.other_fees : [];
    updateWizardDraft({ other_fees: [...current, { description: "", amount_usd: 0 }] });
  });
  for (const el of modal.querySelectorAll("[data-other-fee]")) {
    const idx = Number(el.dataset.otherFee);
    const field = el.dataset.field;
    el.addEventListener("input", () => {
      const current = Array.isArray(state.ui.wizard.draft.other_fees) ? [...state.ui.wizard.draft.other_fees] : [];
      if (!current[idx]) current[idx] = { description: "", amount_usd: 0 };
      const next = { ...current[idx] };
      if (field === "amount_usd") {
        next.amount_usd = el.value === "" ? 0 : Number(el.value);
      } else {
        next.description = el.value;
      }
      current[idx] = next;
      updateWizardDraft({ other_fees: current });
    });
  }
  for (const btn of modal.querySelectorAll("[data-remove-other-fee]")) {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.removeOtherFee);
      const current = Array.isArray(state.ui.wizard.draft.other_fees) ? state.ui.wizard.draft.other_fees : [];
      updateWizardDraft({ other_fees: current.filter((_, i) => i !== idx) });
    });
  }
}

function drawScenarioOverlay(currentR, isDark) {
  destroyChart("chart-scenario-overlay");
  const ctx = document.getElementById("chart-scenario-overlay");
  if (!ctx || !state.scenarios.length) return;
  const baseScn = { name:"Base", interest_rate_delta_bps:0, build_cost_multiplier:1, sale_price_multiplier:1, margin_override:null, timing_shift_months:0, excluded_project_ids:[] };
  const scenarios = [
    { scn: baseScn, color: "#7a7a73" },
    { scn: state.scenario, color: "#131313" },
    ...state.scenarios.map((s, i) => ({ scn: s, color: ["#2058a8", "#1f7a4d", "#b56c00", "#b3261e", "#5a3d8a"][i % 5] })),
  ];
  const results = scenarios.map(x => ({ ...x, r: aggregatePortfolio(state.projects, state.globals, x.scn) }));
  const labels = currentR.timeline.map(d => d.slice(2));
  charts["chart-scenario-overlay"] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: results.map(x => ({
      label: x.scn.name === state.scenario.name ? `${x.scn.name} (current)` : x.scn.name,
      data: x.r.monthly.cum_equity_called,
      borderColor: x.color,
      backgroundColor: "transparent",
      borderWidth: x.scn === state.scenario ? 3 : 2,
      borderDash: x.scn === baseScn ? [4, 4] : [],
      tension: 0.1,
    })) },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { ticks: { callback: (v) => "$" + (v/1e6).toFixed(1) + "M" } }, x: { ticks: { autoSkip: true, maxTicksLimit: 12 } } },
      plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatTooltip(ctx.parsed.y)}` } } },
    },
  });
}

function drawScenarioCashflow(currentR, isDark) {
  destroyChart("chart-scenario-cashflow");
  const ctx = document.getElementById("chart-scenario-cashflow");
  if (!ctx || !state.scenarios.length) return;
  const baseScn = { name:"Base", interest_rate_delta_bps:0, build_cost_multiplier:1, sale_price_multiplier:1, margin_override:null, timing_shift_months:0, excluded_project_ids:[] };
  const scenarios = [
    { scn: baseScn, color: "#7a7a73" },
    { scn: state.scenario, color: "#131313" },
    ...state.scenarios.map((s, i) => ({ scn: s, color: ["#2058a8", "#1f7a4d", "#b56c00", "#b3261e", "#5a3d8a"][i % 5] })),
  ];
  const results = scenarios.map(x => ({ ...x, r: aggregatePortfolio(state.projects, state.globals, x.scn) }));
  const labels = currentR.timeline.map(d => d.slice(2));
  charts["chart-scenario-cashflow"] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: results.map(x => ({
      label: x.scn.name === state.scenario.name ? `${x.scn.name} (current)` : x.scn.name,
      data: x.r.monthly.net_cash,
      borderColor: x.color,
      backgroundColor: "transparent",
      borderWidth: x.scn === state.scenario ? 3 : 2,
      borderDash: x.scn === baseScn ? [4, 4] : [],
      tension: 0.1,
    })) },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { ticks: { callback: (v) => "$" + (v/1e6).toFixed(1) + "M" } }, x: { ticks: { autoSkip: true, maxTicksLimit: 12 } } },
      plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatTooltip(ctx.parsed.y)}` } } },
    },
  });
}

function drawWaterfallChart(r, isDark) {
  destroyChart("chart-waterfall");
  const ctx = document.getElementById("chart-waterfall");
  if (!ctx) return;
  const labels = r.timeline.map(d => d.slice(2));
  const cumIn = [];
  const cumOut = [];
  let sIn = 0, sOut = 0;
  let maxVal = 0;
  for (let i = 0; i < r.monthly.equity_drawn.length; i++) {
    sIn += r.monthly.equity_drawn[i];
    sOut += r.monthly.equity_returned[i];
    cumIn.push(sIn);
    cumOut.push(sOut);
    if (sIn > maxVal) maxVal = sIn;
    if (sOut > maxVal) maxVal = sOut;
  }
  // I4 — bound the y-axis to ~10% headroom over the actual peak instead of letting Chart.js auto-scale to 2× the data.
  const suggestedMax = maxVal > 0 ? maxVal * 1.1 : 1;
  const tk = chartTokens();
  const grad = (canvas, hex) => {
    const ctx2d = canvas.getContext("2d");
    const g = ctx2d.createLinearGradient(0, 0, 0, canvas.height || 240);
    g.addColorStop(0, hex + "33");
    g.addColorStop(1, hex + "00");
    return g;
  };
  const opts = rampChartOptions({ stacked: false, yIsCurrency: true });
  opts.scales.y.beginAtZero = true;
  opts.scales.y.suggestedMax = suggestedMax;
  charts["chart-waterfall"] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [
      { label: "Cumulative equity deployed", data: cumIn,  borderColor: tk.palette[3], backgroundColor: grad(ctx, tk.palette[3]), fill: true, tension: 0.35, borderWidth: 2, pointRadius: 0 },
      { label: "Cumulative equity returned", data: cumOut, borderColor: tk.palette[2], backgroundColor: grad(ctx, tk.palette[2]), fill: true, tension: 0.35, borderWidth: 2, pointRadius: 0 },
    ]},
    options: opts,
  });
}

function drawEquityMonthlyChart(r, isDark) {
  destroyChart("chart-equity-monthly");
  const ctx = document.getElementById("chart-equity-monthly");
  if (!ctx) return;
  const labels = r.timeline.map(d => d.slice(2));
  const tk = chartTokens();
  charts["chart-equity-monthly"] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [
      { label: "Equity drawn",    data: r.monthly.equity_drawn.map(v => -v), backgroundColor: tk.palette[3], borderRadius: 2 },
      { label: "Equity returned", data: r.monthly.equity_returned,           backgroundColor: tk.palette[2], borderRadius: 2 },
    ]},
    options: rampChartOptions({ stacked: true, yIsCurrency: true }),
  });
}

function drawTornadoChart(r, isDark) {
  destroyChart("chart-tornado");
  const ctx = document.getElementById("chart-tornado");
  if (!ctx) return;
  // Window-level access — computed once when sensitivity renders
  const data = window.__tornadoData || [];
  if (!data.length) return;
  const tk = chartTokens();
  charts["chart-tornado"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map(d => d.label),
      datasets: [
        { label: "Downside", data: data.map(d => d.low),  backgroundColor: tk.palette[3], borderRadius: 2 },
        { label: "Upside",   data: data.map(d => d.high), backgroundColor: tk.palette[2], borderRadius: 2 },
      ],
    },
    options: rampChartOptions({ stacked: false, yIsCurrency: true, indexAxis: "y" }),
  });
}

function drawCashflowChart(r, isDark) {
  destroyChart("chart-cashflow");
  const ctx = document.getElementById("chart-cashflow");
  if (!ctx) return;
  const labels = r.timeline.map(d => d.slice(2)); // YY-MM
  const m = r.monthly;
  const tk = chartTokens();
  charts["chart-cashflow"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Sales",     data: m.sales,      backgroundColor: tk.palette[2], borderRadius: 2 }, // sage green
        { label: "Land",      data: m.land_cost,  backgroundColor: tk.palette[0], borderRadius: 2 }, // near-black ink (workhorse)
        { label: "Build",     data: m.build_cost, backgroundColor: tk.palette[5], borderRadius: 2 }, // warm grey
        { label: "Kingshaus", data: m.kingshaus,  backgroundColor: tk.palette[1], borderRadius: 2 }, // muted blue
        { label: "Overhead",  data: m.overhead,   backgroundColor: tk.palette[4], borderRadius: 2 }, // dusty rose
        { label: "Interest",  data: m.interest,   backgroundColor: tk.palette[3], borderRadius: 2 }, // warm orange (negative)
      ],
    },
    options: rampChartOptions({ stacked: true, yIsCurrency: true }),
  });
}

function drawBalancesChart(r, isDark) {
  destroyChart("chart-balances");
  const ctx = document.getElementById("chart-balances");
  if (!ctx) return;
  const labels = r.timeline.map(d => d.slice(2));
  const tk = chartTokens();
  // Gradient fills (Ramp pattern: deep at zero, fade to transparent)
  const grad = (canvas, hex) => {
    const ctx2d = canvas.getContext("2d");
    const g = ctx2d.createLinearGradient(0, 0, 0, canvas.height || 240);
    g.addColorStop(0, hex + "33"); // ~20% alpha at top
    g.addColorStop(1, hex + "00");
    return g;
  };
  charts["chart-balances"] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [
      { label: "Cumulative debt",   data: r.monthly.debt_balance,   borderColor: tk.palette[3], backgroundColor: grad(ctx, tk.palette[3]), fill: true, tension: 0.35, borderWidth: 2, pointRadius: 0 },
      { label: "Cumulative equity", data: r.monthly.equity_balance, borderColor: tk.palette[0], backgroundColor: grad(ctx, tk.palette[0]), fill: true, tension: 0.35, borderWidth: 2, pointRadius: 0 },
    ]},
    options: rampChartOptions({ stacked: false, yIsCurrency: true }),
  });
}

function drawProjectChart(r, isDark) {
  destroyChart("chart-project");
  const ctx = document.getElementById("chart-project");
  if (!ctx) return;
  const id = state.ui.selected_project_id;
  const res = r.by_project.find((x) => x.project_id === id);
  if (!res) return;
  const labels = res.monthly.dates.map(d => d.slice(2));
  const tk = chartTokens();
  charts["chart-project"] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [
      { label: "Sales",     data: res.monthly.sales,      backgroundColor: tk.palette[2], borderRadius: 2 },
      { label: "Land",      data: res.monthly.land_cost,  backgroundColor: tk.palette[0], borderRadius: 2 },
      { label: "Build",     data: res.monthly.build_cost, backgroundColor: tk.palette[5], borderRadius: 2 },
      { label: "Kingshaus", data: res.monthly.kingshaus,  backgroundColor: tk.palette[1], borderRadius: 2 },
      { label: "Interest",  data: res.monthly.interest,   backgroundColor: tk.palette[3], borderRadius: 2 },
    ]},
    options: rampChartOptions({ stacked: true, yIsCurrency: true }),
  });
}

// v14.5 (Phase 2.2) — Monthly burn schedule chart for the Timeline tab.
// Cost-focused (no sales line): stacked monthly outflows for one project.
function drawBurnChart(r, isDark) {
  destroyChart("chart-burn");
  const ctx = document.getElementById("chart-burn");
  if (!ctx) return;
  const id = state.ui.selected_project_id;
  const res = r.by_project.find((x) => x.project_id === id);
  if (!res) return;
  const m = res.monthly;
  // Show absolute magnitudes (positive bars) so the chart reads as "burn intensity".
  const abs = (arr) => arr.map(v => Math.abs(v || 0));
  const labels = m.dates.map(d => d.slice(2));
  const tk = chartTokens();
  charts["chart-burn"] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [
      { label: "Land",       data: abs(m.land_cost),  backgroundColor: tk.palette[0], borderRadius: 2 },
      { label: "Build",      data: abs(m.build_cost), backgroundColor: tk.palette[5], borderRadius: 2 },
      { label: "Kingshaus",  data: abs(m.kingshaus),  backgroundColor: tk.palette[1], borderRadius: 2 },
      { label: "Soft costs", data: abs(m.soft_cost),  backgroundColor: tk.palette[4], borderRadius: 2 },
      { label: "Financing",  data: abs(m.interest),   backgroundColor: tk.palette[3], borderRadius: 2 },
    ]},
    options: rampChartOptions({ stacked: true, yIsCurrency: true }),
  });
}

// v14.6 (Phase 2.3) — Capital overview: LOC drawdown curve.
// Outstanding balance over time vs the facility cap, with a dashed cap line.
function drawLocDrawdownChart(r, isDark) {
  destroyChart("chart-loc-drawdown");
  const ctx = document.getElementById("chart-loc-drawdown");
  if (!ctx) return;
  const port = r.monthly;
  const dates = r.timeline || [];
  if (!dates.length) return;
  const cap = state.globals.kpc_loc?.facility_size_usd || 0;
  const labels = dates.map(d => d.slice(2));
  const tk = chartTokens();
  const grad = (canvas, hex) => {
    const ctx2d = canvas.getContext("2d");
    const g = ctx2d.createLinearGradient(0, 0, 0, canvas.height || 240);
    g.addColorStop(0, hex + "33");
    g.addColorStop(1, hex + "00");
    return g;
  };
  charts["chart-loc-drawdown"] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [
      { label: "LOC balance",  data: port.loc_balance,   borderColor: tk.palette[0], backgroundColor: grad(ctx, tk.palette[0]), fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 },
      { label: "Facility cap", data: dates.map(() => cap), borderColor: tk.palette[3], borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false },
      { label: "Available",    data: port.loc_available, borderColor: tk.palette[2], borderWidth: 1, pointRadius: 0, fill: false, hidden: true },
    ]},
    options: rampChartOptions({ stacked: false, yIsCurrency: true }),
  });
}

// Capital stack — cumulative draws across senior debt, LOC, and true owner equity.
function drawCapitalStackChart(r, isDark) {
  destroyChart("chart-capital-stack");
  const ctx = document.getElementById("chart-capital-stack");
  if (!ctx) return;
  const port = r.monthly;
  const dates = r.timeline || [];
  if (!dates.length) return;
  const labels = dates.map(d => d.slice(2));
  // Cumulative draws (NOT outstanding) — shows the layered story
  const cumDebt = cumulativeSeries(port.debt_drawn);
  const cumLoc  = cumulativeSeries(port.loc_drawn);
  const cumEq   = cumulativeSeries(port.true_equity_drawn);
  const tk = chartTokens();
  const grad = (canvas, hex) => {
    const ctx2d = canvas.getContext("2d");
    const g = ctx2d.createLinearGradient(0, 0, 0, canvas.height || 240);
    g.addColorStop(0, hex + "33");
    g.addColorStop(1, hex + "00");
    return g;
  };
  charts["chart-capital-stack"] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [
      { label: "Senior debt (cum)",   data: cumDebt, borderColor: tk.palette[5], backgroundColor: grad(ctx, tk.palette[5]), fill: "origin", tension: 0.35, pointRadius: 0, borderWidth: 2 },
      { label: "KPC LOC (cum)",       data: cumLoc,  borderColor: tk.palette[0], backgroundColor: grad(ctx, tk.palette[0]), fill: "-1",     tension: 0.35, pointRadius: 0, borderWidth: 2 },
      { label: "Owner equity (cum)",  data: cumEq,   borderColor: tk.palette[3], backgroundColor: grad(ctx, tk.palette[3]), fill: "-1",     tension: 0.35, pointRadius: 0, borderWidth: 2 },
    ]},
    options: rampChartOptions({ stacked: false, yIsCurrency: true }),
  });
}

// Helper: running sum
function cumulativeSeries(arr) {
  const out = [];
  let s = 0;
  for (const v of arr || []) { s += v || 0; out.push(s); }
  return out;
}

function formatTooltip(v) {
  if (v == null) return "—";
  return v < 0 ? `($${Math.round(-v).toLocaleString()})` : `$${Math.round(v).toLocaleString()}`;
}

// ---------- download helpers ----------

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadCSV(rows, filename) {
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(row => row.map(escape).join(",")).join("\n");
  downloadBlob(csv, filename, "text/csv;charset=utf-8");
}

// ---------- footer ----------

function renderFooter() {
  // v14.14 (Phase 4.4) — Excel decommissioned. Atlas is the source of truth.
  const version = state.sync.server_version || 0;
  const lastSaved = state.sync.last_saved_at ? state.sync.last_saved_at.toLocaleString() : "—";
  const sorSince = state.globals.system_of_record_since || state.globals.excel_baseline_snapshot || "2026-05-10";
  return `<footer class="footer">
    Juno Atlas is the system of record · canonical state v${version} · last saved ${lastSaved}
    <span class="muted" style="margin-left:8px;">Source of truth since ${sorSince}. Excel archived.</span>
  </footer>`;
}
