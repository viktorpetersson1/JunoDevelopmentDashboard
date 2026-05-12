# Supabase server-side source

This directory is the auditable copy of every server-side artifact in the Juno dashboard's Supabase project (`mbehvcfiakjznzqkymse`).

## Layout

```
supabase/
├── README.md                  this file
├── migrations/                ordered SQL schema migrations
│   ├── 20260511_001_init_schema.sql               user roles, financial_state, RLS
│   ├── 20260511_002_fix_handle_new_user_search_path.sql  auth trigger fix
│   ├── 20260512_003_viewer_basic_redaction.sql    server-side redaction RPC
│   └── 20260512_004_llm_assistant_schema.sql      LLM tables + rate-limit telemetry
└── functions/
    └── assistant/
        └── index.ts           Edge Function source for the Ask Juno assistant
```

## Why this is in the repo

These files are the ground truth for **server-side enforcement** of three things that anyone reviewing the platform must be able to audit without Supabase dashboard access:

1. **Role-based row-level security** on every table
2. **Server-side redaction** of financial detail for `viewer_basic` (via `get_state_for_current_user()` RPC)
3. **LLM safety** — the system prompt, redaction logic, logging, and audit trail in the Edge Function

If any of these is changed in the live project but not committed here, the live project drifts from what's auditable. Don't let that happen.

## How they got deployed

These were deployed using the Supabase MCP from a Claude Code session on 2026-05-11/12. Each migration corresponds to a single `apply_migration` call. The Edge Function was deployed via `deploy_edge_function`. If you re-deploy from a clean state:

```bash
# Apply migrations in numerical order
supabase db push      # or apply each .sql file via psql / Supabase SQL editor

# Deploy the Edge Function
supabase functions deploy assistant --no-verify-jwt=false
```

## Secrets

The Edge Function reads `ANTHROPIC_API_KEY` from project secrets. **That key is NOT in this repo and must NEVER be checked in.** Set it via:

- Supabase dashboard: <https://supabase.com/dashboard/project/mbehvcfiakjznzqkymse/functions/secrets>
- Or CLI: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`

## Drift check

To verify the deployed code matches what's here:

```sql
-- Check each function's source. Compare manually to the .sql files.
SELECT pg_get_functiondef('public.handle_new_user'::regproc);
SELECT pg_get_functiondef('public.current_user_role'::regproc);
SELECT pg_get_functiondef('public.get_state_for_current_user'::regproc);
SELECT pg_get_functiondef('public.current_user_can_see_financials'::regproc);
SELECT pg_get_functiondef('public.my_llm_quota_today'::regproc);
```

For the Edge Function, compare `functions/assistant/index.ts` against the deployed version via the Supabase dashboard.
