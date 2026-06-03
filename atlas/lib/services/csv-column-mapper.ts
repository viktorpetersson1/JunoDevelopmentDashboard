/**
 * Smart CSV column mapper (T108).
 *
 * Sends the CSV header row + a few sample rows to Claude Sonnet 4.5 and asks
 * it to infer which source column corresponds to each Actuals target field
 * (date, vendor, category, amount, description, project_key). The user then
 * confirms the mapping before commit.
 *
 * Pattern mirrors lib/pricing/comp-researcher.ts:
 *   - Raw fetch() to https://api.anthropic.com/v1/messages (no SDK)
 *   - Same env var: ANTHROPIC_API_KEY
 *   - Same model fallback chain: claude-sonnet-4-5 → claude-3-7-sonnet-latest
 *     → claude-3-5-sonnet-latest (404 falls through; auth/server errors stop)
 *
 * No silent degradation — V6.1 stop-and-ask #3: when Anthropic is down the
 * importer surfaces the verbatim error. Caller (the API route) decides whether
 * to 502 or just bubble the error to the user.
 */

import { z } from 'zod';

// ────────────────────────────────────────────────────────────────────────────
// Public schema + types
// ────────────────────────────────────────────────────────────────────────────

/**
 * Six target fields the importer maps onto. `description` becomes
 * `lineItem`; `amount_usd` becomes `amountCents` (× 100). `project_key`
 * is used when one CSV contains rows for multiple projects (Ask Juno
 * agent CSV imports may); the per-project importer ignores it.
 *
 * Each value is either a source column header from the CSV or null if
 * the model couldn't find a match.
 */
export const ColumnMappingSchema = z.object({
  date: z.string().nullable(),
  vendor: z.string().nullable(),
  category: z.string().nullable(),
  amount_usd: z.string().nullable(),
  description: z.string().nullable(),
  project_key: z.string().nullable(),
});

export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

export interface ColumnMapperResult {
  column_mapping: ColumnMapping;
  /** 0..1 — the model's own confidence in its mapping. */
  confidence: number;
  /** Free-form warnings: ambiguous columns, dropped data hints, etc. */
  warnings: string[];
  /** Which fallback-chain model id actually responded. */
  model_used: string;
}

export class ColumnMapperError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  constructor(message: string, opts: { code?: string; httpStatus?: number } = {}) {
    super(message);
    this.name = 'ColumnMapperError';
    this.code = opts.code ?? 'COLUMN_MAPPER_FAILED';
    this.httpStatus = opts.httpStatus ?? 502;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ────────────────────────────────────────────────────────────────────────────

const RESPONSE_SCHEMA_BLOCK = `{
  "column_mapping": {
    "date": "<source column header>" | null,
    "vendor": "<source column header>" | null,
    "category": "<source column header>" | null,
    "amount_usd": "<source column header>" | null,
    "description": "<source column header>" | null,
    "project_key": "<source column header>" | null
  },
  "confidence": 0.0,
  "warnings": ["..."]
}`;

function buildMapperPrompt(args: {
  fileName: string;
  headerRow: string[];
  sampleRows: string[][];
  targetCategories: string[];
}): string {
  const headerLine = args.headerRow.join(' | ');
  const sample = args.sampleRows
    .slice(0, 5)
    .map((r, i) => `Row ${i + 1}: ${r.join(' | ')}`)
    .join('\n');

  return `You are a CSV column mapper for a property-development cost ledger.

FILE: ${args.fileName}

The user uploaded a CSV of cost / invoice rows. Your job is to map their column
headers onto a fixed target schema so the system can ingest the rows.

TARGET FIELDS:
- date         — the date the invoice was issued or the cost was incurred (YYYY-MM-DD when possible).
- vendor       — the supplier / contractor / counterparty paid.
- category     — the cost category. ALLOWED VALUES (case-sensitive, exact strings):
                   ${args.targetCategories.join(', ')}
                 If the source CSV uses different wording (e.g. "Hard costs", "Construction"),
                 still return the SOURCE column header — the system will translate per-row.
                 Do NOT invent a category not in the allowed list.
- amount_usd   — the dollar amount of the row. Must be a number column.
- description  — the line item / what the cost was for (e.g. "Foundation pour", "Permit fees").
- project_key  — only if the CSV contains rows for MULTIPLE projects, the column that
                 identifies which project each row belongs to. Most files do not have this
                 — return null in that case.

CSV HEADER:
${headerLine}

SAMPLE ROWS:
${sample}

INSTRUCTIONS:
1. Match each target field to the BEST source column header (verbatim string from the
   CSV header above), or null if no column reasonably maps.
2. Confidence is a single float in [0, 1] reflecting how sure you are overall.
3. Push any concern into "warnings" — ambiguous columns, header names that look like a
   different schema, columns that look like the wrong data type, etc.
4. Output ONLY the JSON object below, no prose, no markdown fences.

RESPONSE:
${RESPONSE_SCHEMA_BLOCK}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Anthropic call (mirrors comp-researcher.ts)
// ────────────────────────────────────────────────────────────────────────────

const MODEL_FALLBACK_CHAIN = [
  'claude-sonnet-4-5',
  'claude-3-7-sonnet-latest',
  'claude-3-5-sonnet-latest',
];

interface AnthropicResponseBody {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  error?: { type: string; message: string };
}

async function callAnthropic(
  apiKey: string,
  prompt: string
): Promise<{ text: string; modelUsed: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  let lastStatus = 0;
  let lastErrText = '';
  for (const model of MODEL_FALLBACK_CHAIN) {
    let resp: Response;
    try {
      resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } catch (err) {
      throw new ColumnMapperError(
        `Anthropic network error: ${err instanceof Error ? err.message : String(err)}`,
        { code: 'ANTHROPIC_NETWORK', httpStatus: 502 }
      );
    }

    if (resp.ok) {
      const data = (await resp.json()) as AnthropicResponseBody;
      const text =
        data.content
          ?.filter(
            (c): c is { type: string; text: string } =>
              c.type === 'text' && typeof c.text === 'string'
          )
          .map((c) => c.text)
          .join('\n')
          .trim() ?? '';
      if (!text) {
        throw new ColumnMapperError('Anthropic returned an empty response', {
          code: 'ANTHROPIC_EMPTY',
          httpStatus: 502,
        });
      }
      return { text, modelUsed: model };
    }

    lastStatus = resp.status;
    try {
      lastErrText = await resp.text();
    } catch {
      lastErrText = '';
    }

    // 404 → model deprecated, try the next one.
    // 401/403 → bad credentials, stop.
    // anything else → stop (server error, rate limit).
    if (resp.status === 401 || resp.status === 403) {
      throw new ColumnMapperError(`Anthropic auth failed (HTTP ${resp.status})`, {
        code: 'ANTHROPIC_AUTH',
        httpStatus: 502,
      });
    }
    if (resp.status !== 404) break;
  }

  throw new ColumnMapperError(
    `Anthropic API returned HTTP ${lastStatus}: ${lastErrText.slice(0, 240)}`,
    { code: 'ANTHROPIC_HTTP', httpStatus: 502 }
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Response parsing
// ────────────────────────────────────────────────────────────────────────────

const ResponseSchema = z.object({
  column_mapping: ColumnMappingSchema,
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

function extractJson(text: string): string {
  // Strip markdown fences if the model added them despite instructions.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const objMatch = text.match(/\{[\s\S]*\}/);
  return objMatch ? objMatch[0] : text;
}

function parseMapperResponse(raw: string): {
  column_mapping: ColumnMapping;
  confidence: number;
  warnings: string[];
} {
  const jsonStr = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new ColumnMapperError(
      `Could not parse model response as JSON: ${err instanceof Error ? err.message : String(err)}`,
      { code: 'MAPPER_BAD_JSON', httpStatus: 502 }
    );
  }

  const result = ResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new ColumnMapperError(
      `Model response did not match expected schema: ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
      { code: 'MAPPER_BAD_SHAPE', httpStatus: 502 }
    );
  }
  return result.data;
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry
// ────────────────────────────────────────────────────────────────────────────

export async function mapCsvColumns(args: {
  fileName: string;
  headerRow: string[];
  sampleRows: string[][];
  targetCategories: string[];
}): Promise<ColumnMapperResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ColumnMapperError('ANTHROPIC_API_KEY is not configured on the server', {
      code: 'ANTHROPIC_MISSING_KEY',
      httpStatus: 500,
    });
  }

  const prompt = buildMapperPrompt(args);
  const { text, modelUsed } = await callAnthropic(apiKey, prompt);
  const parsed = parseMapperResponse(text);

  return {
    column_mapping: parsed.column_mapping,
    confidence: parsed.confidence,
    warnings: parsed.warnings,
    model_used: modelUsed,
  };
}
