// In-memory mutable state + persistence to Supabase (primary) + localStorage (offline cache).

import { BASELINE_GLOBALS, BASELINE_PROJECTS, BASELINE_SCENARIO } from "./data.js";
import {
  fetchFinancialState, saveFinancialState, scheduleAutoSave,
  fetchMyProfile, onAuthStateChange, getCurrentUser,
  logActivityToServer,
} from "./supabase.js";

const STORAGE_KEY = "juno-fd-v1";
const WIZARD_DRAFT_KEY = "juno-wizard-draft";
const WIZARD_STEP_COUNT = 7; // basics, program, timing, costs, revenue, financing, review

export const state = {
  globals: structuredClone(BASELINE_GLOBALS),
  scenario: structuredClone(BASELINE_SCENARIO),
  scenarios: [],                        // v4: saved named scenarios for comparison
  projects: structuredClone(BASELINE_PROJECTS),
  audit_log: [],                        // v9: rolling log of state mutations (last 200)
  // v11: auth + role state
  auth: {
    user: null,                         // { id, email } from Supabase auth
    profile: null,                      // { role, display_name } from user_profiles
    loading: true,                      // true until first auth resolve
  },
  // v11: sync status
  sync: {
    status: "idle",                     // idle | loading | pending | saving | saved | error | offline
    last_saved_at: null,
    last_error: null,
    server_version: 0,
  },
  ui: {
    view: "portfolio",
    selected_project_id: "p2",
    project_tab: "summary",  // v14.4 (Phase 2.1): in-project workspace tab
    timeline_preview_shift: 0,  // v14.5 (Phase 2.2): transient delay-simulator slider value (months); not persisted
    theme: "light",
    mobileMoreOpen: false,  // v13: tracks whether the mobile "More" drawer is open
    wizard: { open: false, step: 0, draft: null },  // v14.1: New Project wizard state
  },
};

// Bypass autosave on initial load to avoid echoing the server's state back to itself
let _suppressAutoSave = false;

export function canEdit() {
  const role = state.auth.profile?.role;
  return role === "editor" || role === "super_admin";
}
export function isSuperAdmin() {
  return state.auth.profile?.role === "super_admin";
}
// v12.2 — can the current user see financial detail (money, profit, IRR)?
export function canSeeFinancials() {
  const role = state.auth.profile?.role;
  return role === "viewer" || role === "editor" || role === "super_admin";
}
export function isRestrictedViewer() {
  return state.auth.profile?.role === "viewer_basic";
}

const AUDIT_MAX = 200;
export function logEvent(category, message, detail) {
  const entry = {
    ts: new Date().toISOString(),
    category,
    message,
    detail: detail ?? null,
    user_email: state.auth.user?.email ?? null,
  };
  state.audit_log.unshift(entry);
  if (state.audit_log.length > AUDIT_MAX) state.audit_log.length = AUDIT_MAX;
  // Fire-and-forget server log
  if (state.auth.user) {
    logActivityToServer(category, message, detail).catch(() => {});
  }
}
export function clearAuditLog() {
  state.audit_log = [];
  save();
  notify();
}

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notify() { for (const fn of listeners) fn(); }

function applyStateBlob(blob) {
  if (!blob) return false;
  _suppressAutoSave = true;
  try {
    if (blob.globals) Object.assign(state.globals, blob.globals);
    if (blob.scenario) Object.assign(state.scenario, blob.scenario);
    if (Array.isArray(blob.scenarios)) state.scenarios = blob.scenarios;
    if (Array.isArray(blob.projects)) state.projects = blob.projects;
    if (Array.isArray(blob.audit_log)) state.audit_log = blob.audit_log;
    if (blob.ui) Object.assign(state.ui, blob.ui);
  } finally {
    _suppressAutoSave = false;
  }
  return true;
}

function snapshotForPersistence() {
  return {
    globals: state.globals,
    scenario: state.scenario,
    scenarios: state.scenarios,
    projects: state.projects,
    audit_log: state.audit_log,
    ui: state.ui,
  };
}

// Local cache only — keeps last-known state for offline use
function writeLocalCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotForPersistence()));
  } catch (e) {
    console.warn("Local cache write failed:", e);
  }
}

function readLocalCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function load() {
  // Synchronous fallback: try local cache so the UI has something while Supabase loads
  const cached = readLocalCache();
  if (cached) applyStateBlob(cached);
  return !!cached;
}

// Hydrate user/profile/state progressively. Called from the auth listener and
// directly from the sign-in form as a belt-and-suspenders. Sets auth.user first
// and notifies immediately so the UI moves past the sign-in screen even if the
// slower profile / state fetches hang.
export async function hydrateAuthedSession(supabaseUser) {
  if (!supabaseUser) return;
  state.auth.user = { id: supabaseUser.id, email: supabaseUser.email };
  notify();
  try {
    // Pass user id explicitly so fetchMyProfile skips the redundant getUser()
    // call — that call sometimes races with JWT propagation right after signIn
    // and returns null, leaving the role chip stuck on the default "viewer".
    state.auth.profile = await fetchMyProfile(supabaseUser.id);
    notify();
  } catch (e) {
    console.warn("fetchMyProfile failed:", e);
  }
  try {
    const remote = await fetchFinancialState();
    if (remote?.state) {
      applyStateBlob(remote.state);
      state.sync.server_version = remote.version || 1;
      state.sync.last_saved_at = remote.updated_at ? new Date(remote.updated_at) : null;
      state.sync.status = "saved";
      writeLocalCache();
      notify();
    }
  } catch (e) {
    console.warn("fetchFinancialState failed:", e);
  }
}

// Register auth listener early, independent of bootstrap. If bootstrap is hung
// on an earlier await (Supabase auth init, network stall, etc.), the listener
// still gets wired up and can react to SIGNED_IN.
export async function initAuthListener() {
  try {
    await onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        hydrateAuthedSession(session?.user);
      } else if (event === "SIGNED_OUT") {
        state.auth.user = null;
        state.auth.profile = null;
        notify();
      }
    });
  } catch (e) {
    console.warn("initAuthListener failed:", e);
  }
}

// Async bootstrap: pull canonical state from Supabase. Auth listener is registered
// separately in initAuthListener().
export async function bootstrap() {
  state.sync.status = "loading";
  notify();
  try {
    const user = await getCurrentUser();
    if (user) {
      // Hydrate session progressively — also notifies as profile + state arrive.
      await hydrateAuthedSession(user);
    } else {
      state.sync.status = "idle";
    }
  } catch (e) {
    console.warn("Bootstrap failed:", e);
    state.sync.status = "error";
    state.sync.last_error = e?.message || String(e);
  } finally {
    // Always release the auth-loading splash, even if bootstrap threw or hung
    // (paired with a setTimeout safety net in main.js for the truly hung case).
    state.auth.loading = false;
  }
  notify();
}

// Trigger save: local immediately, server debounced (only if user can edit).
// v13.1 — passes the expected version + a conflict handler that reloads server state.
export function save() {
  writeLocalCache();
  if (_suppressAutoSave) return;
  if (!canEdit()) return;
  scheduleAutoSave(
    snapshotForPersistence,
    () => state.sync.server_version,
    async (serverVersion) => {
      console.warn(`Concurrent edit: server is at v${serverVersion}, you were at v${state.sync.server_version}. Reloading from server.`);
      const remote = await fetchFinancialState();
      if (remote?.state) {
        applyStateBlob(remote.state);
        state.sync.server_version = remote.version || 0;
        notify();
      }
    },
  );
}

// Read-only export of current snapshot (e.g., for JSON download)
export function currentSnapshot() {
  return snapshotForPersistence();
}

export function resetToBaseline() {
  state.globals = structuredClone(BASELINE_GLOBALS);
  state.scenario = structuredClone(BASELINE_SCENARIO);
  state.scenarios = [];
  state.projects = structuredClone(BASELINE_PROJECTS);
  state.ui.selected_project_id = "p2";
  save(); notify();
}

export function saveCurrentScenario(name, classification) {
  const snapshot = { ...structuredClone(state.scenario), name };
  if (classification) snapshot.class = classification;
  if (snapshot.locked == null) snapshot.locked = false;
  const existingIdx = state.scenarios.findIndex(s => s.name === name);
  if (existingIdx >= 0) state.scenarios[existingIdx] = snapshot;
  else state.scenarios.push(snapshot);
  logEvent("scenario", `saved scenario "${name}"`, { name });
  save(); notify();
}

// v14.8 (Phase 3.2) — Duplicate the active scenario as a new saved one.
export function duplicateCurrentScenario(suggestedName) {
  const baseName = suggestedName || `${state.scenario.name} (copy)`;
  // Avoid collisions by appending a number
  let name = baseName;
  let n = 2;
  while (state.scenarios.some(s => s.name === name)) {
    name = `${baseName} ${n}`;
    n += 1;
  }
  const snapshot = { ...structuredClone(state.scenario), name, class: "custom", locked: false };
  state.scenarios.push(snapshot);
  logEvent("scenario", `duplicated scenario as "${name}"`, { name, fromName: state.scenario.name });
  save(); notify();
  return name;
}

// v14.8 — Set the classification of either the active scenario or a saved one.
export function classifyScenario(name, classification) {
  if (state.scenario.name === name) {
    state.scenario.class = classification;
  }
  const idx = state.scenarios.findIndex(s => s.name === name);
  if (idx >= 0) state.scenarios[idx].class = classification;
  logEvent("scenario", `classified "${name}" as ${classification}`, { name, class: classification });
  save(); notify();
}

// v14.8 — Lock or unlock a saved scenario. Locking signals "this is the chosen decision".
// Convention: only one scenario should be locked at a time. We unlock others on lock.
export function setScenarioLock(name, locked) {
  if (locked) {
    // Unlock everything else first to enforce single-decision-scenario convention
    state.scenarios = state.scenarios.map(s => ({ ...s, locked: false }));
    if (state.scenario.name !== name) state.scenario.locked = false;
  }
  if (state.scenario.name === name) state.scenario.locked = locked;
  const idx = state.scenarios.findIndex(s => s.name === name);
  if (idx >= 0) state.scenarios[idx].locked = locked;
  logEvent("scenario", `${locked ? "locked" : "unlocked"} scenario "${name}"`, { name, locked });
  save(); notify();
}

export function deleteScenario(name) {
  state.scenarios = state.scenarios.filter(s => s.name !== name);
  logEvent("scenario", `deleted scenario "${name}"`, { name });
  save(); notify();
}

export function loadScenario(name) {
  const scn = state.scenarios.find(s => s.name === name);
  if (scn) {
    state.scenario = structuredClone(scn);
    logEvent("scenario", `loaded scenario "${name}"`, { name });
    save(); notify();
  }
}

export function updateGlobal(key, value) {
  const prev = state.globals[key];
  state.globals[key] = value;
  logEvent("global", `${key} changed`, { key, prev, next: value });
  save(); notify();
}
export function updateScenario(patch) {
  Object.assign(state.scenario, patch);
  logEvent("scenario", `scenario updated`, { patch, name: state.scenario.name });
  save(); notify();
}
export function toggleProjectExclusion(id) {
  const ex = state.scenario.excluded_project_ids;
  const i = ex.indexOf(id);
  if (i === -1) ex.push(id); else ex.splice(i, 1);
  const p = state.projects.find(x => x.id === id);
  logEvent("scenario", `${i === -1 ? "excluded" : "included"} project`, { project_id: id, project_name: p?.name });
  save(); notify();
}
export function updateProject(id, patch) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return;
  const changes = {};
  for (const k of Object.keys(patch)) {
    if (p[k] !== patch[k]) changes[k] = { prev: p[k], next: patch[k] };
  }
  Object.assign(p, patch);
  if (Object.keys(changes).length > 0) logEvent("project", `${p.name} updated`, { project_id: id, changes });
  save(); notify();
}
export function addProject(seed = {}) {
  const id = "p" + (Math.max(0, ...state.projects.map((p) => Number(String(p.id).replace(/[^0-9]/g, "")) || 0)) + 1);
  state.projects.push({
    id,
    name: seed.name || `New project (${id})`,
    address: seed.address || "TBC",
    // Phase 0 — underwriting taxonomy (entity_spv / market / asset_type) so the Project Summary header can read them directly.
    entity_spv: seed.entity_spv ?? null,
    market: seed.market || "hamptons",
    asset_type: seed.asset_type || "spec_home",
    status: seed.status || "pipeline",
    start_date: seed.start_date || state.globals.model_start,
    program_months: seed.program_months || state.globals.default_program_months,
    villa_sqft: seed.villa_sqft || 5500,
    land_cost_usd: seed.land_cost_usd ?? state.globals.default_land_cost_usd,
    build_cost_per_sqft: seed.build_cost_per_sqft ?? null,
    kingshaus_cost_per_sqft: seed.kingshaus_cost_per_sqft ?? null,
    target_margin: seed.target_margin ?? null,
    interest_rate_apr: seed.interest_rate_apr ?? null,
    ltc_pct: seed.ltc_pct ?? null,
    soft_costs_lump_sum: seed.soft_costs_lump_sum ?? 0,
    soft_costs: seed.soft_costs ?? {
      build_tools: 0,
      sabbeth: 0,
      craft: 0,
      zero_design: 0,
      klas_bsv: 0,
      permits: 0,
      other: 0,
    },
    sale_price_override_usd: seed.sale_price_override_usd ?? null,
    sale_price_per_sqft_override: seed.sale_price_per_sqft_override ?? null,
    stage: seed.stage ?? "sourcing",                   // v12.1
    // v12.4 — actual sales tracking (populated as project moves through lifecycle)
    listing_date: seed.listing_date ?? null,
    under_contract_date: seed.under_contract_date ?? null,
    closing_date: seed.closing_date ?? null,
    listing_price_usd: seed.listing_price_usd ?? null,
    actual_sale_price_usd: seed.actual_sale_price_usd ?? null,
    // v12.3 — actual cost tracking
    actuals: seed.actuals ?? {
      land: 0,                  // actual land cost paid
      construction: 0,          // actual construction spend to date
      kingshaus: 0,             // actual Kingshaus spend
      soft: 0,                  // actual soft costs spent
      financing: 0,             // actual financing costs paid
    },
    contingency_used_usd: seed.contingency_used_usd ?? 0,  // v13: actual contingency drawn (change orders, surprises)
  });
  state.ui.selected_project_id = id;
  state.ui.view = "project_detail";
  logEvent("project", `added project ${state.projects[state.projects.length-1].name}`, { project_id: id });
  save(); notify();
  return id;
}
export function removeProject(id) {
  const p = state.projects.find(x => x.id === id);
  state.projects = state.projects.filter((p) => p.id !== id);
  if (state.ui.selected_project_id === id && state.projects.length) {
    state.ui.selected_project_id = state.projects[0].id;
  }
  if (p) logEvent("project", `deleted ${p.name}`, { project_id: id });
  save(); notify();
}

export function reorderProject(sourceId, targetId, position = "before") {
  const srcIdx = state.projects.findIndex(p => p.id === sourceId);
  const tgtIdx = state.projects.findIndex(p => p.id === targetId);
  if (srcIdx < 0 || tgtIdx < 0 || srcIdx === tgtIdx) return;
  const src = state.projects[srcIdx];
  const tgt = state.projects[tgtIdx];
  const [item] = state.projects.splice(srcIdx, 1);
  const newTgtIdx = state.projects.findIndex(p => p.id === targetId);
  const insertAt = position === "after" ? newTgtIdx + 1 : newTgtIdx;
  state.projects.splice(insertAt, 0, item);
  logEvent("project", `reordered ${src.name} ${position} ${tgt.name}`, { source_id: sourceId, target_id: targetId });
  save(); notify();
}

export function cloneProject(id) {
  const src = state.projects.find(p => p.id === id);
  if (!src) return null;
  const newId = "p" + (Math.max(0, ...state.projects.map(p => Number(String(p.id).replace(/[^0-9]/g, "")) || 0)) + 1);
  const clone = structuredClone(src);
  clone.id = newId;
  clone.name = `${src.name} (clone)`;
  clone.status = "pipeline";
  clone._excel_sale_price = undefined;
  clone._excel_total_cost_per_sqft = undefined;
  state.projects.push(clone);
  state.ui.selected_project_id = newId;
  state.ui.view = "project_detail";
  save(); notify();
  return newId;
}

export function importProjectsFromCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return { ok: false, error: "CSV needs at least a header row + one data row" };
  const header = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  const required = ["name", "start_date", "villa_sqft", "land_cost_usd"];
  for (const k of required) {
    if (!header.includes(k)) return { ok: false, error: `Missing required column: ${k}` };
  }
  const added = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseCSVRow(lines[i]);
    const row = {};
    header.forEach((h, idx) => row[h] = cells[idx]);
    const id = "p" + (Math.max(0, ...state.projects.map(p => Number(String(p.id).replace(/[^a-z0-9]/g, "")) || 0)) + 1 + added.length);
    state.projects.push({
      id,
      name: row.name || `Imported ${id}`,
      address: row.address || "TBC",
      entity_spv: row.entity_spv || null,
      market: row.market || "hamptons",
      asset_type: row.asset_type || "spec_home",
      status: row.status || "pipeline",
      start_date: row.start_date,
      program_months: Number(row.program_months) || state.globals.default_program_months,
      villa_sqft: Number(row.villa_sqft) || 5500,
      land_cost_usd: Number(row.land_cost_usd) || state.globals.default_land_cost_usd,
      build_cost_per_sqft: row.build_cost_per_sqft ? Number(row.build_cost_per_sqft) : null,
      kingshaus_cost_per_sqft: row.kingshaus_cost_per_sqft ? Number(row.kingshaus_cost_per_sqft) : null,
      target_margin: row.target_margin ? Number(row.target_margin) : null,
      interest_rate_apr: row.interest_rate_apr ? Number(row.interest_rate_apr) : null,
      ltc_pct: row.ltc_pct ? Number(row.ltc_pct) : null,
      soft_costs_lump_sum: Number(row.soft_costs_lump_sum) || 0,
      soft_costs: { build_tools:0, sabbeth:0, craft:0, zero_design:0, klas_bsv:0, permits:0, other:0 },
      sale_price_override_usd: row.sale_price_override_usd ? Number(row.sale_price_override_usd) : null,
      sale_price_per_sqft_override: row.sale_price_per_sqft_override ? Number(row.sale_price_per_sqft_override) : null,
    });
    added.push(id);
  }
  save(); notify();
  return { ok: true, added };
}

function parseCSVRow(line) {
  const cells = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { cells.push(cur.trim()); cur = ""; }
      else cur += c;
    }
  }
  cells.push(cur.trim());
  return cells;
}
export function setView(view, projectId) {
  state.ui.view = view;
  if (projectId) state.ui.selected_project_id = projectId;
  save(); notify();
}

export function setProjectTab(tab) {
  state.ui.project_tab = tab;
  save(); notify();
}

// ---------- New Project wizard ----------

function readWizardDraft() {
  try {
    const raw = localStorage.getItem(WIZARD_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeWizardDraft(draft) {
  try {
    if (draft) localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(WIZARD_DRAFT_KEY);
  } catch { /* ignore */ }
}
function makeBlankDraft() {
  const g = state.globals;
  return {
    name: "",
    address: "",
    entity_spv: null,
    market: "hamptons",
    asset_type: "spec_home",
    stage: "sourcing",
    status: "pipeline",
    start_date: g.model_start,
    program_months: g.default_program_months,
    villa_sqft: 5500,
    land_cost_usd: g.default_land_cost_usd,
    build_cost_per_sqft: null,        // null = use global default
    kingshaus_cost_per_sqft: null,
    soft_costs_lump_sum: 0,
    sale_price_override_usd: null,
    sale_price_per_sqft_override: null,
    target_margin: null,
    interest_rate_apr: null,
    ltc_pct: null,
  };
}
export function openWizard() {
  const existing = readWizardDraft();
  state.ui.wizard = {
    open: true,
    step: 0,
    draft: existing || makeBlankDraft(),
  };
  notify();
}
export function closeWizard() {
  // Save-as-draft on close (don't clear) so reopening resumes.
  if (state.ui.wizard.draft) writeWizardDraft(state.ui.wizard.draft);
  state.ui.wizard.open = false;
  notify();
}
export function discardWizardDraft() {
  writeWizardDraft(null);
  state.ui.wizard = { open: false, step: 0, draft: null };
  notify();
}
export function setWizardStep(n) {
  state.ui.wizard.step = Math.max(0, Math.min(WIZARD_STEP_COUNT - 1, n));
  if (state.ui.wizard.draft) writeWizardDraft(state.ui.wizard.draft);
  notify();
}
export function updateWizardDraft(patch) {
  if (!state.ui.wizard.draft) return;
  Object.assign(state.ui.wizard.draft, patch);
  writeWizardDraft(state.ui.wizard.draft);
  notify();
}
export function submitWizardDraft() {
  const draft = state.ui.wizard.draft;
  if (!draft || !draft.name?.trim()) return null;
  const id = addProject(draft);
  // addProject sets selected_project_id and view = "project_detail"
  writeWizardDraft(null);
  state.ui.wizard = { open: false, step: 0, draft: null };
  notify();
  return id;
}
export function setTheme(theme) {
  state.ui.theme = theme;
  document.documentElement.dataset.theme = theme;
  save(); notify();
}
