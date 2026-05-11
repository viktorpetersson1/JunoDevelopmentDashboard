// Supabase client + persistence layer for the Juno Financial Dashboard.
// Loads/saves the canonical financial state. Uses RLS to enforce edit permissions.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, AUTOSAVE_DEBOUNCE_MS } from "./config.js";

// Lazy-load the Supabase JS SDK from CDN. We use the ESM build so it works with our static module setup.
let _supabasePromise = null;
async function getSupabase() {
  if (!_supabasePromise) {
    _supabasePromise = import("https://esm.sh/@supabase/supabase-js@2.45.4").then((mod) => {
      return mod.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage,
          storageKey: "juno-fd-auth",
        },
      });
    });
  }
  return _supabasePromise;
}

// ---------- auth ----------

export async function getCurrentUser() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

export async function getCurrentSession() {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

export async function signIn(email, password) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, displayName) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
}

export async function sendPasswordReset(email) {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

export async function onAuthStateChange(callback) {
  const supabase = await getSupabase();
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}

// ---------- user profile + role ----------

export async function fetchMyProfile() {
  const supabase = await getSupabase();
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, email, display_name, role, created_at")
    .eq("id", user.id)
    .single();
  if (error) {
    console.warn("fetchMyProfile failed:", error.message);
    return null;
  }
  return data;
}

export async function fetchAllProfiles() {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, email, display_name, role, created_at")
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("fetchAllProfiles failed:", error.message);
    return [];
  }
  return data || [];
}

export async function updateUserRole(userId, newRole) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("user_profiles")
    .update({ role: newRole })
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMyDisplayName(displayName) {
  const supabase = await getSupabase();
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("user_profiles")
    .update({ display_name: displayName })
    .eq("id", user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- financial state load/save ----------

export async function fetchFinancialState() {
  const supabase = await getSupabase();
  // v12.2 — use the redaction RPC so viewer_basic gets a stripped state.
  // Full-access roles get the full state via the same function.
  const { data, error } = await supabase.rpc("get_state_for_current_user");
  if (error) {
    console.warn("fetchFinancialState (rpc) failed:", error.message);
    // Fallback: try direct read (will fail for viewer_basic but work for others)
    const direct = await supabase.from("financial_state").select("state, version, updated_at, updated_by").eq("id", 1).maybeSingle();
    return direct.data || null;
  }
  if (!data) return null;
  return { state: data, version: data?._redacted ? 0 : 1, updated_at: new Date().toISOString(), redacted: !!data?._redacted };
}

export async function saveFinancialState(state, opts = {}) {
  const supabase = await getSupabase();
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated — sign in to save changes");

  // Read current version to do optimistic concurrency
  const current = await fetchFinancialState();
  const newVersion = (current?.version ?? 0) + 1;

  // Write the new state
  const { data, error } = await supabase
    .from("financial_state")
    .update({ state, version: newVersion, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("state, version, updated_at, updated_by")
    .single();
  if (error) throw error;

  // Append to history (best-effort; we don't fail the save if history insert fails)
  try {
    await supabase.from("state_history").insert({
      state,
      version: newVersion,
      description: opts.description || null,
      created_by: user.id,
    });
  } catch (e) {
    console.warn("state_history insert failed:", e?.message);
  }

  return data;
}

// ---------- history ----------

export async function fetchHistory(limit = 50) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("state_history")
    .select("id, version, description, created_by, created_at, state")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("fetchHistory failed:", error.message);
    return [];
  }
  return data || [];
}

export async function restoreFromHistory(historyId) {
  const supabase = await getSupabase();
  const { data: histEntry, error } = await supabase
    .from("state_history")
    .select("state")
    .eq("id", historyId)
    .single();
  if (error) throw error;
  return await saveFinancialState(histEntry.state, { description: `Restored from history #${historyId}` });
}

// ---------- activity log ----------

export async function logActivityToServer(category, message, detail) {
  const supabase = await getSupabase();
  const user = await getCurrentUser();
  if (!user) return;
  try {
    await supabase.from("activity_log").insert({
      category,
      message,
      detail: detail ?? null,
      user_id: user.id,
      user_email: user.email,
    });
  } catch (e) {
    // Non-fatal — local log will still capture it
  }
}

export async function fetchActivityLog(limit = 200) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, category, message, detail, user_email, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

// ---------- debounced autosave ----------

let _saveTimer = null;
let _saveInflight = null;
const _saveListeners = new Set();

export function onSaveStatusChange(fn) { _saveListeners.add(fn); return () => _saveListeners.delete(fn); }
function notifyStatus(status, detail) {
  for (const fn of _saveListeners) fn(status, detail);
}

export function scheduleAutoSave(getStateFn, delay = AUTOSAVE_DEBOUNCE_MS) {
  if (_saveTimer) clearTimeout(_saveTimer);
  notifyStatus("pending");
  _saveTimer = setTimeout(async () => {
    _saveTimer = null;
    if (_saveInflight) await _saveInflight;
    notifyStatus("saving");
    _saveInflight = (async () => {
      try {
        await saveFinancialState(getStateFn());
        notifyStatus("saved", { ts: new Date() });
      } catch (e) {
        notifyStatus("error", { message: e?.message || String(e) });
        console.error("autosave failed:", e);
      } finally {
        _saveInflight = null;
      }
    })();
    await _saveInflight;
  }, delay);
}

// ---------- LLM assistant ----------

export async function askAssistant(message, mode = "query") {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke("assistant", {
    body: { message, mode },
  });
  if (error) {
    // Try to parse a JSON error body from the function
    const detail = error?.context?.response ? await error.context.response.text().catch(() => null) : null;
    throw new Error(detail ? `${error.message}: ${detail}` : error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function fetchPendingSuggestions(limit = 50) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("llm_suggestions")
    .select("id, user_email, original_message, llm_summary, proposed_patch, status, reviewed_at, applied_at, rejection_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

export async function reviewSuggestion(id, decision, rejectionReason = null) {
  const supabase = await getSupabase();
  const user = await getCurrentUser();
  const update = {
    status: decision,                       // 'approved' | 'rejected' | 'applied'
    reviewed_by: user?.id,
    reviewed_at: new Date().toISOString(),
  };
  if (decision === "applied") update.applied_at = new Date().toISOString();
  if (decision === "rejected" && rejectionReason) update.rejection_reason = rejectionReason;
  const { data, error } = await supabase.from("llm_suggestions").update(update).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function fetchMyLlmQuota() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("my_llm_quota_today");
  if (error) return { query_count: 0, cost_usd: 0, daily_limit: 30 };
  return data?.[0] || { query_count: 0, cost_usd: 0, daily_limit: 30 };
}

// ---------- realtime (optional, for multi-user updates) ----------

export async function subscribeToStateChanges(onUpdate) {
  const supabase = await getSupabase();
  const channel = supabase
    .channel("financial_state_changes")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "financial_state", filter: "id=eq.1" },
      (payload) => onUpdate(payload.new),
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
