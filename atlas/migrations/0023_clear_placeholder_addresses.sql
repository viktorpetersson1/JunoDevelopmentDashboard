-- T090 — clear placeholder address strings from atlas.projects.
--
-- 8 of the 10 baseline projects were seeded with literal 'TBC' or
-- 'Site to be confirmed' addresses (p3 + p5..p11). Every downstream
-- consumer of project.address already gates on null/truthy correctly,
-- but the placeholder strings are truthy — so they slip through:
--
--   - app/api/projects/[id]/pricing-brief/route.ts: !project.address
--     guard passes; brief generation continues with "Address: TBC"
--     fed to comp research and location classifier → garbage results.
--   - app/projects/_components/projects-list-client.tsx: renders
--     "TBC" as the subtitle in the portfolio grid card.
--   - app/pipeline/_components/pipeline-board.tsx: pipeline card
--     subtitle.
--   - app/projects/[id]/page.tsx: detail-page header subtitle.
--
-- Fix: NULL them out. UI surfaces handle null correctly today, and the
-- pricing-strategy-tab gains an explicit pre-flight gate (separate
-- code change) so users see a friendly "site address required" empty
-- state instead of clicking through to a 400.
--
-- The drift on p2 (live was hand-corrected to "84 Sunset Beach Road,
-- Sag Harbor" / market_id 'sag_harbor' on 31 May; seed source said
-- "84 Springs Beach Road" / 'south_hampton') is NOT addressed here —
-- it's already correct in live and now also correct in the seed source
-- (public/data.js) so a fresh seed reproduces the right values.
--
-- Idempotent: re-running is a no-op because the WHERE predicate
-- excludes NULL values. Approval snapshots are NOT touched; they
-- captured the placeholder strings at snapshot time and remain
-- immutable historical records.

UPDATE atlas.projects
SET address = NULL
WHERE is_current = true
  AND is_archived = false
  AND (
    btrim(address) = 'TBC'
    OR address ILIKE 'site to be confirmed%'
    OR btrim(address) = ''
  );
