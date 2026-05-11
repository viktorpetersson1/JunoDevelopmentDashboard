// Supabase project configuration for the Juno Financial Dashboard.
// Safe to commit — anon/publishable keys are designed to be exposed client-side.
// Row-level security in the database enforces auth on all reads + writes.

export const SUPABASE_URL = "https://mbehvcfiakjznzqkymse.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_DuDseqzB3pfxBFlhSwx_Ow_A-2w6LqH";

// How long to wait between local edits and pushing to Supabase, in ms.
// Lower = more network traffic, higher = larger window where unsaved edits could be lost.
export const AUTOSAVE_DEBOUNCE_MS = 2000;

// History pruning: when state_history exceeds this count, oldest entries are kept (server-side cron will prune).
export const HISTORY_KEEP_COUNT = 50;
