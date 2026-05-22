// Placeholder for T002. Resetting the live Supabase DB from this script is
// intentionally NOT supported — wipes would destroy the vanilla app's
// production data (financial_state, state_history, etc.).
//
// To reset the `atlas` schema specifically (during P0 dev):
//   1. Use the Supabase MCP apply_migration tool with `DROP SCHEMA atlas CASCADE; CREATE SCHEMA atlas;`
//   2. Re-apply migrations from migrations/ in order.
//
// We will revisit a safer scoped-reset script in P1 once Atlas has its own
// test/preview environment separate from production.

// eslint-disable-next-line no-console
console.warn('db-reset is intentionally disabled. See script source for safe-reset instructions.');
process.exit(1);
