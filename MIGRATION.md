# Migration: Excel → Dashboard as System of Record

This document covers the operational steps to fully migrate off the Excel workbook and onto the dashboard.

## Current state (after v11 — Supabase persistence)

- **Dashboard**: `C:\Dev\juno-financial-dashboard\`, running on <http://127.0.0.1:8765>
- **Database**: Supabase project `juno-financial-dashboard` (`mbehvcfiakjznzqkymse`)
  - URL: <https://mbehvcfiakjznzqkymse.supabase.co>
  - Region: `us-east-1`
  - Plan: included in your existing Supabase Pro subscription
- **Auth**: Supabase Auth (email + password). First user = super-admin. Subsequent users start as viewer.
- **State storage**: single canonical row in `financial_state` table. Every save versioned in `state_history`. Activity log in `activity_log`.

## Roles

| Role | Permissions |
|---|---|
| `super_admin` | Edit everything + manage other users' roles |
| `editor` | Edit projects, scenarios, globals, run Monte Carlo |
| `viewer` | Read-only access to all data |

## Step-by-step migration

### 1. Create your super-admin account

1. Open the dashboard URL (locally <http://127.0.0.1:8765>, or the deployed Render URL after deploy)
2. Click **"Need an account?"** on the sign-in screen
3. Use your email + a strong password
4. Confirm via the email Supabase sends
5. Sign in — you'll automatically be the super-admin (first user)

### 2. Verify the dashboard matches the Excel

Once signed in:
1. Go to **Settings** → click **"Match Excel mode"** button (sets juno13 FY + 81% build realization + Excel sale prices)
2. Compare headline KPIs against `Juno_Cash flow Forecast_20260412_MASTER.xlsx`:
   - Total sales should match within ~0.002% (essentially exact)
   - Peak equity should match within ~7%
   - Profit pre-tax should be within ~6%
3. If anything looks materially off, **stop and tell me before continuing**.

### 3. Invite other users (optional)

Send them the dashboard URL. They click **"Need an account?"** to self-register. By default they're `viewer`. Promote them in **Users** view:
- `editor` — can edit everything but can't change anyone's role
- `super_admin` — can also manage user roles

### 4. Start using the dashboard for real

- Make all edits in the dashboard. Every change autosaves to Supabase within ~2 seconds.
- Sync indicator in the top-right shows current status: `●` pending, `⟳` saving, `✓` saved, `!` error.
- Edits to projects, scenarios, globals all logged in **Activity** with your name + timestamp.
- Versioned history lives in `state_history` (every save). If you need to roll back: query via Supabase dashboard or ask me to add a "Restore from history" UI.

### 5. Sunset the Excel

When you've used the dashboard for at least a week without issues:

1. In the dashboard, click **Settings** → **Export state (JSON)** — save it locally as a final cross-check
2. In the dashboard, click **Settings** → **Export printable HTML report** — save a snapshot for filing
3. Rename the Excel:
   ```
   Juno_Cash flow Forecast_20260412_MASTER.xlsx
        ↓
   Juno_Cash flow Forecast_ARCHIVED_REPLACED_BY_DASHBOARD_2026-05-11.xlsx
   ```
4. Move it to an `/archive/` folder
5. Update the OneDrive/Dropbox file with a `README.txt`:
   ```
   This Excel model is ARCHIVED as of 2026-05-11.
   The Juno financial model is now maintained in the dashboard at:
   https://juno-dashboard.onrender.com (once deployed)
   See MIGRATION.md in the dashboard repo for context.
   ```
6. Stop editing Excel forever. Any change to assumptions / projects / scenarios goes through the dashboard.

## What's lost / what's gained

### What's lost going forward

- The Excel file is no longer the system of record. New analysis happens in the dashboard.
- You give up Excel's flexibility for ad-hoc one-off charts and "what if I drop in a quick formula" workflows. If you need that, export CSVs from the dashboard and chart externally.

### What's gained

- **Real persistence**: not relying on a single file on OneDrive that anyone could corrupt
- **Multi-device**: open from anywhere with your login
- **Multi-user with roles**: invite co-investors as viewers, team as editors, keep yourself as super-admin
- **Versioned history**: every save is a snapshot, audit trail is automatic
- **Auto-save**: never "forget to hit save"
- **Real Monte Carlo + sensitivity**: things Excel does badly
- **Single source of truth**: one URL, one set of numbers

## Recovery procedures

### If you make a bad edit and want to roll back

Two options:

**Option A — manual rollback via Supabase SQL editor:**
1. Go to <https://supabase.com/dashboard/project/mbehvcfiakjznzqkymse/sql>
2. Run: `SELECT id, version, description, created_at FROM state_history ORDER BY created_at DESC LIMIT 20;`
3. Find the version you want to restore
4. Run: `UPDATE financial_state SET state = (SELECT state FROM state_history WHERE id = <HIST_ID>), version = version + 1 WHERE id = 1;`
5. Refresh the dashboard

**Option B — ask me to add an in-app "History" view** (~30 min of work) so you can browse + restore from history with one click.

### If Supabase is down

- The dashboard automatically falls back to localStorage. You can keep working locally; changes will sync once Supabase recovers.
- If localStorage gets corrupted: click **Settings → Reset to Excel baseline** to start from the seed values, then re-import from your most recent JSON export.

### If the dashboard breaks (bug, bad deploy)

- The state is safe in Supabase regardless of dashboard health.
- Worst case: open Supabase dashboard, copy out the `financial_state.state` JSON, paste into a recovered local dashboard.

## Backup strategy

- **Supabase**: automatic daily backups (Pro plan). 7 days of point-in-time recovery.
- **Versioned history**: every save creates a row in `state_history`. Keeping the last 50 forever (or all of them — it's tiny JSON).
- **JSON export**: any time you want, click Settings → Export state (JSON) and stash a copy in OneDrive.

Suggested cadence:
- Weekly: export JSON manually, save to OneDrive
- Monthly: archive a copy in a dated subfolder
- Quarterly: review history table, prune to keep the cleanest snapshots
