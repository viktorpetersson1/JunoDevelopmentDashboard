import { load, bootstrap, subscribe, state } from "./state.js";
import { render } from "./ui.js";
import { onSaveStatusChange } from "./supabase.js";

// 1. Hydrate from local cache so the UI has something to render immediately
load();
document.documentElement.dataset.theme = state.ui.theme;
subscribe(render);
render();

// 2. Then pull canonical state from Supabase (async, will re-render when done)
bootstrap();

// 3. Wire sync status indicator
onSaveStatusChange((status, detail) => {
  state.sync.status = status;
  if (status === "saved") state.sync.last_saved_at = detail?.ts || new Date();
  if (status === "error") state.sync.last_error = detail?.message;
  // Trigger a re-render via the state subscription system
  import("./state.js").then(s => s.notify());
});
