/**
 * POST /api/projects/[id]/actuals/import — V6.1 T108.
 *
 * Smart CSV ingest for project actuals. Two-phase:
 *
 *   1. dry_run  — body: { phase: 'dry_run', file_name, csv_text }
 *                 → Parse CSV, call Sonnet 4.5 column mapper, validate every
 *                   row against CreateActualsEntrySchema, return preview +
 *                   `validated_rows` carried back to the client.
 *
 *   2. commit   — body: { phase: 'commit', file_name, validated_rows }
 *                 → Re-validate every row server-side (never trust the
 *                   client's claim), bulk-insert in one statement (Postgres
 *                   aborts the batch on any constraint failure → the spirit
 *                   of "rollback" the plan calls for), write a single audit
 *                   log row with source='csv_import' + batch metadata.
 *
 * E1-gated: requireAuth → requireEditor → Zod → audit. Edge runtime —
 * CF Pages Functions are edge-only (D-017/D-018 preflight). Anthropic
 * fetch + FormData both work fine under Workers.
 *
 * Failure modes:
 *   - File > 5 MB                        → 413 FILE_TOO_LARGE
 *   - File name ends `.xlsx`             → 400 XLSX_UNSUPPORTED (V6.1 v2, V6-06.a)
 *   - LLM proposes unknown category      → row marked invalid + warning (never
 *                                          invent enum values; §T108 stop-and-ask #2)
 *   - Anthropic down                     → 502 with verbatim error (no silent
 *                                          degradation; §T108 stop-and-ask #3)
 */

import type { NextRequest } from 'next/server';
import { ok, created, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findCurrentProjectUuidByKey } from '@/lib/repos/project';
import { parseCsv } from '@/lib/csv/parse';
import { mapCsvColumns, ColumnMapperError } from '@/lib/services/csv-column-mapper';
import { CreateActualsEntrySchema } from '@/lib/services/actuals';
import type { CreateActualsEntryInput } from '@/lib/services/actuals';
import { bulkInsertActualsEntries, type ActualsCategory } from '@/lib/repos/actuals';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// Edge runtime — CF Pages Functions are edge-only (D-017/D-018 preflight gates).
// Web FormData + Anthropic fetch all work under Workers.
export const runtime = 'edge';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB hard cap (§T108 stop-and-ask #1)
const MAX_ROWS = 1000;                  // Sanity cap; plan says >5MB rejects anyway

const CATEGORIES = ['land', 'build', 'soft', 'kingshaus', 'financing', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

/** Map common synonyms to canonical enum values; null = unknown (row invalid). */
function normalizeCategory(raw: string | null | undefined): Category | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (CATEGORIES.includes(v as Category)) return v as Category;
  if (/^(land|lot|parcel)$/.test(v)) return 'land';
  if (/^(build|construction|hard|hard costs?|gc)$/.test(v)) return 'build';
  if (/^(soft|soft costs?|design|architect|permits?|engineering)$/.test(v)) return 'soft';
  if (/^(superstructure|kingshaus|prefab|panels?)$/.test(v)) return 'kingshaus';
  if (/^(financing|interest|loan|debt)$/.test(v)) return 'financing';
  if (/^(other|misc|miscellaneous)$/.test(v)) return 'other';
  return null;
}

/** Parse common date formats to YYYY-MM-DD. Returns null on failure. */
function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // MM/DD/YYYY or M/D/YYYY (US format — most likely in Viktor's invoices)
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const [, mm, dd, yy] = us;
    const year = yy!.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`;
  }
  return null;
}

/** Parse "$1,234.50" / "1234.5" / "(1,234)" (negative) → cents. Null on failure. */
function normalizeAmountCents(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let v = raw.trim();
  if (!v) return null;
  const neg = /^\(.*\)$/.test(v);
  v = v.replace(/[\$,\s\(\)]/g, '');
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const dollars = neg ? -n : n;
  // Actuals must be > 0 (CreateActualsEntrySchema constraint).
  if (dollars <= 0) return null;
  return Math.round(dollars * 100);
}

// ── Request schemas ─────────────────────────────────────────────────────────

const DryRunBodySchema = z.object({
  phase: z.literal('dry_run'),
  file_name: z.string().trim().min(1).max(200),
  csv_text: z.string().min(1).max(MAX_FILE_BYTES),
});

const CommitBodySchema = z.object({
  phase: z.literal('commit'),
  file_name: z.string().trim().min(1).max(200),
  validated_rows: z
    .array(CreateActualsEntrySchema.omit({ projectId: true })) // projectId injected from URL
    .min(1)
    .max(MAX_ROWS),
});

interface SampleRow {
  index: number;
  raw: Record<string, string>;
  /** Best-effort preview shape — preserves raw LLM text for `category` so
   *  unmappable values still surface in the UI table. */
  mapped: {
    entryDate?: string;
    category?: string;
    amountCents?: number;
    lineItem?: string;
    vendor?: string | null;
  };
  valid: boolean;
  errors?: string[];
}

// ── Route ───────────────────────────────────────────────────────────────────

interface RouteContext {
  params: { id: string };
}

export const POST = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const projectUuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!projectUuid) {
    return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  }

  const json = (await req.json().catch(() => null)) as { phase?: string } | null;
  if (!json || typeof json.phase !== 'string') {
    return badRequest('Body must include phase: "dry_run" | "commit"', 'PHASE_REQUIRED');
  }

  if (json.phase === 'dry_run') return handleDryRun(json, projectUuid);
  if (json.phase === 'commit') return handleCommit(json, projectUuid, ctx.params.id, user.id, req);
  return badRequest(`Unknown phase "${json.phase}"`, 'UNKNOWN_PHASE');
});

async function handleDryRun(
  json: unknown,
  projectUuid: string
): Promise<Response> {
  const parsed = DryRunBodySchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join('.') ?? '';
    if (path === 'csv_text' && issue?.code === 'too_big') {
      return badRequest('File exceeds 5 MB limit', 'FILE_TOO_LARGE');
    }
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }
  const { file_name, csv_text } = parsed.data;

  if (file_name.toLowerCase().endsWith('.xlsx')) {
    return badRequest(
      'XLSX import is V6.1 v2 — in Excel: File → Save As → CSV → re-upload.',
      'XLSX_UNSUPPORTED'
    );
  }
  if (csv_text.length > MAX_FILE_BYTES) {
    return badRequest('File exceeds 5 MB limit', 'FILE_TOO_LARGE');
  }

  let csv: ReturnType<typeof parseCsv>;
  try {
    csv = parseCsv(csv_text);
  } catch (err) {
    return badRequest(
      `Could not parse CSV: ${err instanceof Error ? err.message : String(err)}`,
      'CSV_PARSE_FAILED'
    );
  }
  if (csv.rows.length === 0) {
    return badRequest('CSV has no data rows', 'CSV_EMPTY');
  }
  if (csv.rows.length > MAX_ROWS) {
    return badRequest(`CSV has ${csv.rows.length} rows — max is ${MAX_ROWS}.`, 'TOO_MANY_ROWS');
  }

  let mapper;
  try {
    mapper = await mapCsvColumns({
      fileName: file_name,
      headerRow: csv.header,
      sampleRows: csv.rows.slice(0, 5),
      targetCategories: [...CATEGORIES],
    });
  } catch (err) {
    if (err instanceof ColumnMapperError) {
      return new Response(
        JSON.stringify({ error: { code: err.code, message: err.message } }),
        { status: err.httpStatus, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw err;
  }

  // Build a column index map from the LLM-proposed mapping.
  const headerIdx = (col: string | null): number => (col ? csv.header.indexOf(col) : -1);
  const idx = {
    date: headerIdx(mapper.column_mapping.date),
    vendor: headerIdx(mapper.column_mapping.vendor),
    category: headerIdx(mapper.column_mapping.category),
    amount_usd: headerIdx(mapper.column_mapping.amount_usd),
    description: headerIdx(mapper.column_mapping.description),
  };
  const cell = (row: string[], i: number): string | null =>
    i >= 0 && i < row.length ? row[i] ?? null : null;

  // Validate every row.
  const validatedRows: CreateActualsEntryInput[] = [];
  const sampleRows: SampleRow[] = [];
  const validationErrors: Array<{ row: number; field: string; message: string }> = [];
  let totalCents = 0;

  for (let i = 0; i < csv.rows.length; i++) {
    const row = csv.rows[i]!;
    const errs: string[] = [];

    const dateRaw = cell(row, idx.date);
    const date = normalizeDate(dateRaw);
    if (!date) errs.push(`row ${i + 1}: date "${dateRaw ?? ''}" not recognized`);

    const catRaw = cell(row, idx.category);
    const category = normalizeCategory(catRaw);
    if (!category)
      errs.push(`row ${i + 1}: category "${catRaw ?? ''}" not in allowed enum`);

    const amtRaw = cell(row, idx.amount_usd);
    const amountCents = normalizeAmountCents(amtRaw);
    if (amountCents === null)
      errs.push(`row ${i + 1}: amount "${amtRaw ?? ''}" not a positive number`);

    const description = cell(row, idx.description)?.trim() ?? '';
    if (!description) errs.push(`row ${i + 1}: description / line item is required`);

    const vendor = cell(row, idx.vendor)?.trim() || null;

    const valid = errs.length === 0;
    if (valid && date && category && amountCents !== null) {
      const validated: CreateActualsEntryInput = {
        projectId: projectUuid,
        entryDate: date,
        category,
        lineItem: description.slice(0, 200),
        amountCents,
        vendor: vendor?.slice(0, 200) ?? null,
        source: 'csv',
      };
      // Re-validate with Zod to be safe (catches any silent shape drift).
      const z2 = CreateActualsEntrySchema.safeParse(validated);
      if (z2.success) {
        validatedRows.push(validated);
        totalCents += amountCents;
      } else {
        errs.push(...z2.error.issues.map((iss) => iss.message));
      }
    }

    if (errs.length > 0) {
      for (const e of errs) validationErrors.push({ row: i + 1, field: '', message: e });
    }

    if (sampleRows.length < 20) {
      const rawObj: Record<string, string> = {};
      for (let k = 0; k < csv.header.length; k++) {
        const key = csv.header[k];
        if (key !== undefined) rawObj[key] = row[k] ?? '';
      }
      sampleRows.push({
        index: i + 1,
        raw: rawObj,
        mapped: {
          entryDate: date ?? undefined,
          category: catRaw ?? undefined,
          amountCents: amountCents ?? undefined,
          lineItem: description || undefined,
          vendor: vendor ?? undefined,
        },
        valid,
        ...(errs.length > 0 ? { errors: errs } : {}),
      });
    }
  }

  return ok({
    header: csv.header,
    column_mapping: mapper.column_mapping,
    confidence: mapper.confidence,
    warnings: mapper.warnings,
    model_used: mapper.model_used,
    rows_total: csv.rows.length,
    rows_valid: validatedRows.length,
    rows_invalid: csv.rows.length - validatedRows.length,
    total_amount_usd: totalCents / 100,
    sample_rows: sampleRows,
    validated_rows: validatedRows,
    validation_errors: validationErrors,
  });
}

async function handleCommit(
  json: unknown,
  projectUuid: string,
  projectKey: string,
  userId: string,
  req: NextRequest
): Promise<Response> {
  const parsed = CommitBodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }
  const { file_name, validated_rows } = parsed.data;

  // Server-side re-validation: trust no client. Re-run Zod + inject projectUuid.
  const rowsToInsert = [];
  for (const r of validated_rows) {
    const candidate = { ...r, projectId: projectUuid };
    const z2 = CreateActualsEntrySchema.safeParse(candidate);
    if (!z2.success) {
      return badRequest(
        `Row failed re-validation: ${z2.error.issues
          .map((i) => `${i.path.join('.')} — ${i.message}`)
          .join('; ')}`,
        'ROW_REVALIDATION_FAILED'
      );
    }
    rowsToInsert.push({
      projectId: projectUuid,
      entryDate: z2.data.entryDate,
      category: z2.data.category as ActualsCategory,
      lineItem: z2.data.lineItem,
      amountCents: z2.data.amountCents,
      vendor: z2.data.vendor ?? null,
      invoiceRef: z2.data.invoiceRef ?? null,
      notes: z2.data.notes ?? null,
      source: 'csv' as const,
      createdBy: userId,
    });
  }

  let insertedIds: string[];
  try {
    insertedIds = await bulkInsertActualsEntries(rowsToInsert);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'BATCH_INSERT_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const totalCents = rowsToInsert.reduce((s, r) => s + r.amountCents, 0);
  const orgId = await resolveOrgId();
  const auditLogId = await recordMutation({
    orgId,
    userId,
    route: `/api/projects/${projectKey}/actuals/import`,
    method: 'POST',
    statusCode: 201,
    before: null,
    after: {
      file_name,
      row_count: insertedIds.length,
      total_amount_usd: totalCents / 100,
      first_entry_id: insertedIds[0] ?? null,
      last_entry_id: insertedIds[insertedIds.length - 1] ?? null,
    },
    ip: req.headers.get('x-forwarded-for') ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    source: 'csv_import',
  });

  return created({
    inserted_count: insertedIds.length,
    inserted_ids: insertedIds,
    audit_log_id: auditLogId,
    total_amount_usd: totalCents / 100,
  });
}

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}
