# Deployment

The dashboard is a pure static site (HTML + ES modules + Chart.js via CDN). It runs without any build step and deploys anywhere that serves files.

## Option 1 — Render (free static site)

1. Push this folder to a GitHub repo (or use the existing juno-app monorepo).
2. In Render: **New → Blueprint → Connect repository**.
3. Render reads `render.yaml` and provisions a free static site.
4. URL: `https://juno-financial-dashboard.onrender.com` (or your custom domain).
5. Auto-deploy on every push to `main`.

Manual setup without blueprint:
- **Type**: Static Site
- **Build command**: *(empty)*
- **Publish directory**: `.`
- **Custom domain**: configure in Render dashboard if needed.

## Option 2 — Netlify / Vercel / GitHub Pages / S3

Same approach — set the publish directory to the repo root. No build step.

## Option 3 — Internal hosting (Windows / share drive)

```cmd
cd C:\Dev\juno-financial-dashboard
python serve.py
```

Then open <http://127.0.0.1:8765/>. For multi-user access on a LAN, change the bind address in `serve.py` from `127.0.0.1` to `0.0.0.0` and open the firewall on port 8765.

## Option 4 — Integration into juno-app (Next.js)

To wire this dashboard into the existing `C:\Dev\juno-app` Next.js project at `/financials`:

1. Copy `engine.js`, `data.js`, `state.js`, `ui.js`, `styles.css` into `juno-app/components/financials/`.
2. Wrap the existing DOM-driven UI in a React component that mounts `#app-root` and runs `main.js` on mount.
3. Or rewrite `ui.js` as React components — engine and data layer are already pure and portable.
4. Add `/financials` to `AppShell` nav with the existing role-based guard.

## Privacy / security notes

- All state lives in **browser localStorage**. No backend, no telemetry.
- The Excel source file is **never uploaded** — only the snapshot baseline lives in `data.js`.
- The static HTML report export contains all your real numbers — treat the downloaded file as confidential.
- Activity log entries are stored client-side only.
- If hosting publicly: put behind Render's free auth, Cloudflare Access, or basic-auth at the CDN layer. Do **not** expose to the open internet without protection — the data is your investment model.

## Caching strategy

`render.yaml` sets:
- HTML files: `no-cache` (so users always get the latest `index.html`)
- JS/CSS modules: 5-minute cache with `must-revalidate`

If you push frequent updates, lower the JS/CSS cache time or use a query-string version (`?v=2025-05-11`).
