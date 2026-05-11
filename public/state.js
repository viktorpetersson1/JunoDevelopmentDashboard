// In-memory mutable state + persistence to Supabase (primary) + localStorage (offline cache).

import { BASELINE_GLOBALS, BASELINE_PROJECTS, BASELINE_SCENARIO } from "./data.js";
import {
  fetchFinancialState, saveFinancialState, scheduleAutoSave,
  fetchMyProfile, onAuthStateChange, getCurrentUser,
  logActivityToServer,
} from "./supabase.js";

const STORAGE_KEY = "juno-fd-v1";

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
    theme: "light",
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

// Async bootstrap: pull canonical state from Supabase, hook up auth + autosave
export async function bootstrap() {
  state.sync.status = "loading";
  notify();
  try {
    // Try to load auth + profile first
    const user = await getCurrentUser();
    if (user) {
      state.auth.user = { id: user.id, email: user.email };
      const profile = await fetchMyProfile();
      state.auth.profile = profile;
    }
    state.auth.loading = false;

    // Load canonical state
    const remote = await fetchFinancialState();
    if (remote?.state) {
      applyStateBlob(remote.state);
      state.sync.server_version = remote.version || 1;
      state.sync.last_saved_at = remote.updated_at ? new Date(remote.updated_at) : null;
      state.sync.status = "saved";
      writeLocalCache();
    } else {
      state.sync.status = "idle";
    }
  } catch (e) {
    console.warn("Bootstrap failed:", e);
    state.sync.status = "error";
    state.sync.last_error = e?.message || String(e);
  }

  // Subscribe to auth state changes (sign-in / sign-out)
  await onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      const u = session?.user;
      if (u) {
        state.auth.user = { id: u.id, email: u.email };
        state.auth.profile = await fetchMyProfile();
      }
      // After login, refresh canonical state
      const remote = await fetchFinancialState();
      if (remote?.state) {
        applyStateBlob(remote.state);
        state.sync.server_version = remote.version || 1;
      }
      notify();
    } else if (event === "SIGNED_OUT") {
      state.auth.user = null;
      state.auth.profile = null;
      notify();
    }
  });
  notify();
}

// Trigger save: local immediately, server debounced (only if user can edit)
export function save() {
  writeLocalCache();
  if (_suppressAutoSave) return;
  if (!canEdit()) return;  // viewers don't push state
  scheduleAutoSave(snapshotForPersistence);
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

export function saveCurrentScenario(name) {
  const snapshot = { ...structuredClone(state.scenario), name };
  const existingIdx = state.scenarios.findIndex(s => s.name === name);
  if (existingIdx >= 0) state.scenarios[existingIdx] = snapshot;
  else state.scenarios.push(snapshot);
  logEvent("scenario", `saved scenario "${name}"`, { name });
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
export function setTheme(theme) {
  state.ui.theme = theme;
  document.documentElement.dataset.theme = theme;
  save(); notify();
}
