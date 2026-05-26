#!/usr/bin/env node
/**
 * preflight.mjs — catch deploy footguns before they cost 90s of CF build time.
 *
 * Each check below maps to a real bug we hit during the Cloudflare Pages
 * rollout. Re-running this on every build (local + CI + CF prestep) keeps
 * the rollout regression-proof.
 *
 * Usage:
 *   node scripts/preflight.mjs            # local checks only (1-4)
 *   node scripts/preflight.mjs --remote   # + Supabase / CF network checks (5-6)
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = one or more checks failed
 *   2 = preflight itself crashed (bug in this script)
 *
 * Wired as a pre-step on `pages:build` so CF's build pipeline always runs
 * the full battery with --remote. CI runs the local-only variant on every
 * push.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ATLAS_ROOT = join(__dirname, '..');
const APP_DIR = join(ATLAS_ROOT, 'app');

// ────────────────────────────────────────────────────────────────────────────
// Output helpers
// ────────────────────────────────────────────────────────────────────────────

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (color, s) => (useColor ? `${colors[color]}${s}${colors.reset}` : s);

const failures = [];
const warnings = [];

function pass(check, msg) {
  console.log(`  ${c('green', '✓')} ${check}${msg ? c('dim', ` — ${msg}`) : ''}`);
}

function fail(check, msg) {
  console.log(`  ${c('red', '✗')} ${check}${msg ? `: ${msg}` : ''}`);
  failures.push(`${check}: ${msg ?? 'failed'}`);
}

function warn(check, msg) {
  console.log(`  ${c('yellow', '⚠')} ${check}${msg ? `: ${msg}` : ''}`);
  warnings.push(`${check}: ${msg ?? 'warning'}`);
}

function section(name) {
  console.log(`\n${c('bold', name)}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Check 1: required env vars exist
// ────────────────────────────────────────────────────────────────────────────

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'AUDIT_HASH_SALT',
];

function checkEnvPresence() {
  section('1. Required env vars present');
  for (const key of REQUIRED_ENV) {
    const v = process.env[key];
    if (!v || v.trim().length === 0) {
      fail(key, 'missing or empty');
    } else {
      pass(key, `${v.length} chars`);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 2: NEXT_PUBLIC_SUPABASE_URL parses as a URL
//
// Why: a malformed URL (missing https://, trailing whitespace, wrapping
// quotes) makes @supabase/ssr throw "Invalid URL string." on every request,
// which 500s the entire app. We hit this on the CF deploy.
// ────────────────────────────────────────────────────────────────────────────

function checkSupabaseUrlFormat() {
  section('2. NEXT_PUBLIC_SUPABASE_URL is a valid URL');
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) {
    fail('format', 'not set (covered above)');
    return;
  }
  if (raw !== raw.trim()) {
    fail('format', `leading/trailing whitespace (${raw.length} chars vs ${raw.trim().length} trimmed)`);
    return;
  }
  if (raw.startsWith('"') || raw.startsWith("'") || raw.endsWith('"') || raw.endsWith("'")) {
    fail('format', 'wrapped in quotes — strip them in the dashboard');
    return;
  }
  if (!raw.startsWith('https://')) {
    fail('format', `must start with https:// (got "${raw.slice(0, 12)}…")`);
    return;
  }
  try {
    const parsed = new URL(raw);
    if (!parsed.host.endsWith('.supabase.co') && !parsed.host.includes('supabase')) {
      warn('host', `expected a *.supabase.co host, got ${parsed.host}`);
    }
    pass('parsed', parsed.host);
  } catch (err) {
    fail('format', `URL parse error: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 3: Supabase keys are in one of the two valid formats
//
// Supabase supports two formats simultaneously:
//   - Legacy JWT — three base64url segments (`eyJ...`)
//   - New publishable / secret handles — `sb_publishable_*` (anon-equivalent),
//     `sb_secret_*` (service-role-equivalent)
//
// New projects in the Supabase Dashboard default to the new handle format.
// Both work with @supabase/ssr. Reject anything that's neither.
// ────────────────────────────────────────────────────────────────────────────

function classifyKey(v) {
  if (v.startsWith('sb_publishable_')) return { ok: true, format: 'sb_publishable handle' };
  if (v.startsWith('sb_secret_')) return { ok: true, format: 'sb_secret handle' };
  const parts = v.split('.');
  if (parts.length !== 3) {
    return { ok: false, reason: `not a JWT (got ${parts.length} dot-separated segments) and not an sb_* handle` };
  }
  if (parts.some((p) => p.length < 4)) {
    return { ok: false, reason: 'one or more JWT segments are too short' };
  }
  try {
    const header = JSON.parse(
      Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    );
    if (!header.alg) return { ok: false, reason: 'JWT header missing "alg"' };
    return { ok: true, format: `JWT alg=${header.alg}` };
  } catch (err) {
    return { ok: false, reason: `JWT header decode failed: ${err.message}` };
  }
}

function checkKeyShape(name, expectedRole) {
  const v = process.env[name];
  if (!v) {
    fail(name, 'not set');
    return;
  }
  const r = classifyKey(v);
  if (!r.ok) {
    fail(name, r.reason);
    return;
  }
  // Soft check: warn if anon-role var has a secret handle or vice versa.
  if (expectedRole === 'anon' && v.startsWith('sb_secret_')) {
    warn(name, 'looks like a service-role secret handle, not an anon publishable key');
    return;
  }
  if (expectedRole === 'service_role' && v.startsWith('sb_publishable_')) {
    warn(name, 'looks like an anon publishable handle, not a service-role secret');
    return;
  }
  pass(name, r.format);
}

function checkSupabaseKeys() {
  section('3. Supabase keys are in a valid format (JWT or sb_* handle)');
  checkKeyShape('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  checkKeyShape('SUPABASE_SERVICE_ROLE_KEY', 'service_role');
}

// ────────────────────────────────────────────────────────────────────────────
// Check 4: every server-side page + route exports runtime = 'edge'
//
// Why: @cloudflare/next-on-pages requires the export on every dynamic
// route. A missed one fails the build AFTER next compiles successfully
// (wasting ~3 min). Cheaper to grep here.
//
// Static metadata files (icon.svg, robots.txt, etc.) live in public/ —
// nothing to mark.
// ────────────────────────────────────────────────────────────────────────────

async function listServerRoutes(dir, acc = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      // skip _components, __tests__, route groups in parens, etc.
      if (e.name.startsWith('_') || e.name.startsWith('.') || e.name === 'node_modules') {
        continue;
      }
      await listServerRoutes(full, acc);
    } else if (e.isFile()) {
      // page.tsx / route.ts / layout.tsx — only the first two need runtime
      // (layouts can opt in too but aren't required)
      if (/^(page|route)\.(ts|tsx|js|jsx)$/.test(e.name)) {
        acc.push(full);
      }
    }
  }
  return acc;
}

async function checkEdgeRuntime() {
  section('4. Every server route exports runtime = "edge"');
  const files = await listServerRoutes(APP_DIR);
  if (files.length === 0) {
    warn('discovery', `no server routes found under ${APP_DIR}`);
    return;
  }
  for (const file of files) {
    const rel = relative(ATLAS_ROOT, file);
    const src = await readFile(file, 'utf8');
    // Skip client components — they don't run server-side, no runtime needed.
    if (/^['"]use client['"]/m.test(src)) {
      pass(rel, 'use client (skipped)');
      continue;
    }
    if (/export\s+const\s+runtime\s*=\s*['"]edge['"]/.test(src)) {
      pass(rel);
    } else {
      fail(
        rel,
        "missing `export const runtime = 'edge';` — add near the other route config exports"
      );
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 5: Supabase REST exposes the atlas schema [remote]
//
// Why: default Supabase config exposes only `public` + `graphql_public`.
// Atlas queries `atlas.*` tables. If not exposed, PGRST106 every page after
// sign-in. Caught this manually after a successful deploy returned 500.
// ────────────────────────────────────────────────────────────────────────────

async function checkAtlasSchemaExposed() {
  section('5. Supabase REST exposes "atlas" schema [remote]');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    warn('preconditions', 'env vars missing — skipped');
    return;
  }
  const probe = `${url.replace(/\/$/, '')}/rest/v1/projects?select=id&limit=0`;
  try {
    const res = await fetch(probe, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Accept-Profile': 'atlas',
      },
    });
    if (res.status === 406 || res.status === 404) {
      const body = await res.text();
      if (body.includes('PGRST106') || body.includes('Invalid schema')) {
        fail(
          'exposure',
          'atlas schema not exposed via PostgREST. Run: ALTER ROLE authenticator SET pgrst.db_schemas TO \'public, atlas, graphql_public\'; NOTIFY pgrst, \'reload schema\';'
        );
        return;
      }
    }
    // 200, 401, or 403 all mean "schema found, role rejected" — that's fine
    // (RLS or grants decide row access). Anything else is suspect.
    if (res.status >= 500) {
      warn('exposure', `Supabase REST returned ${res.status} — transient outage?`);
      return;
    }
    pass('exposure', `HTTP ${res.status} (schema reachable)`);
  } catch (err) {
    warn('network', `probe failed: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 6: Cloudflare Pages project has nodejs_compat [remote, opt-in]
//
// Why: wrangler.toml's compatibility_flags don't propagate to Pages
// Functions runtime (only to the newer Workers + Assets pipeline). The
// flag MUST be set in the dashboard. Caught this manually after a
// successful build returned 500 on every route.
//
// Only runs if CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID are set,
// since most contributors won't have those — graceful skip is fine.
// ────────────────────────────────────────────────────────────────────────────

async function checkCloudflareCompat() {
  section('6. Cloudflare Pages has nodejs_compat [remote, opt-in]');
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const acc = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !acc) {
    warn(
      'preconditions',
      'CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID not set — skipped (this is fine for local + CI)'
    );
    return;
  }
  const project = process.env.CLOUDFLARE_PAGES_PROJECT ?? 'juno-atlas';
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acc}/pages/projects/${project}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      warn('api', `CF API returned ${res.status}`);
      return;
    }
    const json = await res.json();
    const flags = json.result?.deployment_configs?.production?.compatibility_flags ?? [];
    if (flags.includes('nodejs_compat') || flags.includes('nodejs_compat_v2')) {
      pass('flags', flags.join(', '));
    } else {
      fail(
        'flags',
        `nodejs_compat missing from production compat flags (have: ${flags.join(', ') || 'none'}). Set in CF Dashboard → Settings → Functions → Compatibility flags.`
      );
    }
  } catch (err) {
    warn('network', `CF probe failed: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 7: Sentry DSN configured (soft check — warns only)
//
// Why: Atlas ships with @sentry/nextjs wired in, but the configs no-op
// when SENTRY_DSN is unset. Local dev and any environment without a
// Sentry project run fine without the DSN — this just nudges prod
// deployments toward enabling error capture.
// ────────────────────────────────────────────────────────────────────────────

function checkSentryConfigured() {
  section('7. Sentry DSN configured (warns only)');
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    warn(
      'SENTRY_DSN',
      "not set — error capture is silent. Add SENTRY_DSN + NEXT_PUBLIC_SENTRY_DSN to enable."
    );
    return;
  }
  if (!dsn.startsWith('https://')) {
    warn('SENTRY_DSN', 'should start with https:// (Sentry ingest URL)');
    return;
  }
  pass('SENTRY_DSN', `${dsn.length} chars`);
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const remote = process.argv.includes('--remote');
  console.log(c('bold', `\nAtlas preflight ${remote ? '(local + remote)' : '(local-only)'}`));

  checkEnvPresence();
  checkSupabaseUrlFormat();
  checkSupabaseKeys();
  await checkEdgeRuntime();
  if (remote) {
    await checkAtlasSchemaExposed();
    await checkCloudflareCompat();
  } else {
    section('5-6. Remote checks');
    console.log(c('dim', '  skipped (pass --remote to enable)'));
  }
  checkSentryConfigured();

  console.log();
  if (failures.length > 0) {
    console.log(c('red', c('bold', `✗ ${failures.length} preflight check(s) failed:`)));
    for (const f of failures) console.log(c('red', `  - ${f}`));
    if (warnings.length > 0) {
      console.log(c('yellow', `\n${warnings.length} warning(s):`));
      for (const w of warnings) console.log(c('yellow', `  - ${w}`));
    }
    process.exit(1);
  }
  if (warnings.length > 0) {
    console.log(c('yellow', c('bold', `⚠ ${warnings.length} warning(s) (non-fatal):`)));
    for (const w of warnings) console.log(c('yellow', `  - ${w}`));
  }
  console.log(c('green', c('bold', '✓ All preflight checks passed.')));
}

main().catch((err) => {
  console.error(c('red', `\n💥 Preflight crashed (bug in scripts/preflight.mjs):`));
  console.error(err);
  process.exit(2);
});
