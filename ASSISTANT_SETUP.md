# Ask Juno — LLM assistant setup

The dashboard ships with an **Ask Juno** assistant (bottom-right launcher). It runs on a Supabase Edge Function that proxies queries to the Anthropic API.

The function is deployed, but the **Anthropic API key is not set yet**. Without it, the assistant returns `Assistant not configured.` Set it once and you're done.

## One-time setup

1. Get an Anthropic API key
   - <https://console.anthropic.com/settings/keys>
   - Create a new key. Suggest naming it `juno-dashboard-prod`.
   - Pre-fund credit (or attach a card with auto top-up). Recommend starting with $10–20 — see cost estimate below.

2. Add the key as a Supabase secret
   - Open <https://supabase.com/dashboard/project/mbehvcfiakjznzqkymse/settings/functions>
   - Or directly: <https://supabase.com/dashboard/project/mbehvcfiakjznzqkymse/functions/secrets>
   - Click **Add new secret**:
     - **Name**: `ANTHROPIC_API_KEY`
     - **Value**: your key (starts with `sk-ant-…`)
   - Save.

3. Test
   - Refresh the dashboard.
   - Click **✨ Ask Juno** (bottom-right).
   - Ask: "What's our peak equity?"
   - Should return a normal answer using current state data.

That's it. No redeploy needed — the Edge Function reads the secret at request time.

## Architecture

```
Browser  ──auth JWT──►  Edge Function "assistant"
                              │
                              ├─ verifies JWT
                              ├─ reads user role from user_profiles
                              ├─ checks daily rate limit (llm_rate_limit)
                              ├─ fetches financial_state (redacts for viewer_basic)
                              ├─ builds prompt with system rules
                              │
                              ▼
                       Anthropic API (Claude Sonnet 4.5)
                              │
                              ▼
                              ├─ logs to llm_query_log (audit)
                              ├─ updates llm_rate_limit counter
                              └─ returns response to browser
```

Key design choices:

- **API key never reaches the browser.** Lives only in Supabase secrets.
- **All queries logged** to `llm_query_log` with user, query, response, tokens, cost. Super-admin can pull this any time.
- **Per-user daily quota**: 30 queries/day. Configurable in the Edge Function (`DAILY_QUERY_LIMIT`).
- **Role-aware context**: viewer_basic gets a stripped state (no money). Editor/admin gets the full state.
- **System prompt** forbids ignoring instructions, making up numbers, or modifying data directly. Suggestions go through the approval queue.
- **Token budget per request**: ~5k input + 1k output = ~$0.03/query.

## Cost estimate

Per query: ~$0.03 (Claude Sonnet 4.5: $3/M input, $15/M output).
Per user per day at full quota: 30 × $0.03 = $0.90.
For 10 users hitting the cap every day: $9/day = ~$270/month.

In practice users will run far below the cap. Realistic spend: $5–30/month for a 5-person team.

If you want to use a cheaper model (Claude Haiku at ~$0.80/M input + $4/M output), edit the Edge Function and change `MODEL` to `claude-haiku-4-5-20251201` or similar.

## Suggestion approval flow

The assistant has two modes:

- **Question**: Q&A. Answers only. Never mutates state.
- **Suggest a change**: User describes a desired change. The LLM summarizes and (if possible) extracts a structured JSON patch. The suggestion is queued in `llm_suggestions` table.

Admins (editor + super_admin) see all pending suggestions in the **Suggestions** view in the dashboard nav. They can:
- **Approve** — accept the suggestion (admin then makes the actual edit manually)
- **Reject** — with optional reason
- **Mark applied** — after they've made the edit, mark it done

**Nothing the LLM produces is automatically applied to the model state.** This is the single most important safety property of the system: even if the LLM is jailbroken or hallucinates, the worst it can do is generate a suggestion an admin then reviews.

## Audit + monitoring

- All LLM queries logged in `llm_query_log` (visible to super_admin)
- All suggestions stored in `llm_suggestions` with full audit trail
- Per-user daily cost tracked in `llm_rate_limit`
- To pull total spend: `SELECT date, SUM(total_cost_usd) FROM llm_rate_limit GROUP BY date ORDER BY date DESC;`

## Disabling the assistant

If you want to turn it off entirely:
1. Delete the `ANTHROPIC_API_KEY` secret in Supabase
2. Function will return `Assistant not configured.` to all users

Or to remove the launcher button: edit `public/ui.js`, search for `assistant-launcher`, comment out that line.
