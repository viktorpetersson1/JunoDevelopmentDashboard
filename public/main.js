import { load, bootstrap, initAuthListener, subscribe, state, notify } from "./state.js";
import { render } from "./ui.js";
import { onSaveStatusChange } from "./supabase.js";

// 1. Hydrate from local cache so the UI has something to render immediately
load();
document.documentElement.dataset.theme = state.ui.theme;
subscribe(render);
render();

// 2. Register auth listener BEFORE bootstrap. Bootstrap may hang on a slow
// Supabase call; the listener registration is decoupled so SIGNED_IN events
// are caught even when bootstrap is still pending.
initAuthListener();

// 3. Then pull canonical state from Supabase (async, will re-render when done)
bootstrap();

// 3. Safety net — if bootstrap hangs (Supabase CDN slow, network stall, etc.)
// the user would be stuck on the "Loading…" splash forever, since a hung
// Promise never reaches our finally block. Force-release after 6s so they
// at least reach the sign-in screen and can recover from there.
setTimeout(() => {
  if (state.auth.loading) {
    console.warn("Bootstrap still pending after 6s — releasing splash so user can sign in.");
    state.auth.loading = false;
    notify();
  }
}, 6000);

// 3. Wire sync status indicator
onSaveStatusChange((status, detail) => {
  state.sync.status = status;
  if (status === "saved") {
    state.sync.last_saved_at = detail?.ts || new Date();
    if (detail?.newVersion != null) state.sync.server_version = detail.newVersion;
  }
  if (status === "error") state.sync.last_error = detail?.message;
  if (status === "conflict") state.sync.last_error = `Concurrent edit (server v${detail?.serverVersion})`;
  // Trigger a re-render via the state subscription system
  import("./state.js").then(s => s.notify());
});
