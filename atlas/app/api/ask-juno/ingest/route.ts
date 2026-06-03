/**
 * POST /api/ask-juno/ingest
 *
 * V6.1 T116 — Ask Juno file ingestion.
 *
 * Accepts a CSV or PDF file from the Ask Juno chat.
 * Extracts line items using Claude Sonnet 4.5 and returns a structured
 * proposal card. The user reviews + confirms; commit reuses T108's
 * POST /api/projects/[id]/actuals/import endpoint.
 *
 * File ingestion is ALWAYS a confirmation — never auto-executed (§2.6).
 *
 * Deviation V6-08.a: PDF extraction uses Claude's text-reading capability
 * via the messages API (base64-encoded content block).
 * DOCX: extract as plain text via a minimal buffer-to-text approach.
 * XLSX: rejected with helpful redirect to CSV (no xlsx parser, Hard Rule #3).
 */

import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { parseCsv } from '@/lib/csv/parse';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ACTUALS_CATEGORIES = ['land', 'build', 'soft', 'kingshaus', 'financing', 'other'] as const;

const MODEL_CHAIN = [
  'claude-sonnet-4-5',
  'claude-3-7-sonnet-latest',
  'claude-3-5-sonnet-latest',
] as const;

async function callAnthropicExtract(
  apiKey: string,
  fileName: string,
  content: string | { type: 'base64'; mediaType: string; data: string },
): Promise<{
  line_items: Array<{ category: string; line_item: string; amount_usd: number; vendor?: string; date?: string }>;
  confidence: number;
  warnings: string[];
}> {
  const systemPrompt = `You extract cost line items from financial documents for a real-estate development company.
Return a JSON object with this exact shape:
{
  "line_items": [{ "category": one of [${ACTUALS_CATEGORIES.join(', ')}], "line_item": string, "amount_usd": number, "vendor": string|null, "date": "YYYY-MM-DD"|null }],
  "confidence": 0.0..1.0,
  "warnings": [string]
}
Only use the allowed category values. If unsure, use "other". Return confidence 0.0 if you cannot extract any items.`;

  const userContent = typeof content === 'string'
    ? [{ type: 'text', text: `Extract cost items from this document (file: ${fileName}):\n\n${content}` }]
    : [
        { type: 'text', text: `Extract cost items from this document (file: ${fileName}):` },
        { type: 'document', source: { type: 'base64', media_type: content.mediaType, data: content.data } },
      ];

  for (const model of MODEL_CHAIN) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (res.status === 404 || res.status === 400) continue;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic API HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const body = await res.json() as { content?: Array<{ type: string; text?: string }> };
    const text = body.content?.find((b) => b.type === 'text')?.text ?? '';

    // Parse JSON from response (may be wrapped in markdown).
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Model did not return valid JSON');
    return JSON.parse(match[0]) as ReturnType<typeof callAnthropicExtract> extends Promise<infer T> ? T : never;
  }
  throw new Error('All models in the fallback chain are unavailable');
}

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { profile } = await requireAuth();
  requireEditor(profile);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return badRequest('ANTHROPIC_API_KEY not configured', 'NOT_CONFIGURED');
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return badRequest('Expected multipart/form-data', 'INVALID_BODY');
  }

  const file = formData.get('file') as File | null;
  const projectKey = formData.get('project_key') as string | null;

  if (!file) {
    return badRequest('file field is required', 'MISSING_FILE');
  }

  if (file.size > MAX_BYTES) {
    return badRequest(
      `File is ${(file.size / 1_048_576).toFixed(1)} MB — maximum is 10 MB. Split your file and re-upload.`,
      'FILE_TOO_LARGE',
    );
  }

  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    return badRequest(
      'XLSX support is V6.1 v2. Please open in Excel and save as CSV (File → Save As → CSV UTF-8), then re-upload.',
      'XLSX_NOT_SUPPORTED',
    );
  }

  let extracted: Awaited<ReturnType<typeof callAnthropicExtract>>;

  try {
    if (fileName.endsWith('.pdf')) {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      extracted = await callAnthropicExtract(apiKey, file.name, {
        type: 'base64',
        mediaType: 'application/pdf',
        data: base64,
      });
    } else {
      // CSV or plain text.
      const text = await file.text();
      const { header, rows } = parseCsv(text.slice(0, 50_000)); // cap at 50k chars for context window
      const preview = [header, ...rows.slice(0, 20)].map((r) => r.join(',')).join('\n');
      extracted = await callAnthropicExtract(apiKey, file.name, preview);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return ok({ type: 'ingest_error', text: `Extraction failed: ${msg.slice(0, 400)}` });
  }

  // Summarise by category.
  const byCategory: Record<string, { count: number; total_usd: number }> = {};
  let uncategorizedCount = 0;
  for (const item of extracted.line_items) {
    const cat = ACTUALS_CATEGORIES.includes(item.category as typeof ACTUALS_CATEGORIES[number])
      ? item.category
      : 'other';
    if (cat === 'other' && !ACTUALS_CATEGORIES.includes(item.category as typeof ACTUALS_CATEGORIES[number])) {
      uncategorizedCount++;
    }
    if (!byCategory[cat]) byCategory[cat] = { count: 0, total_usd: 0 };
    byCategory[cat]!.count += 1;
    byCategory[cat]!.total_usd += item.amount_usd;
  }

  const totalUsd = extracted.line_items.reduce((s, i) => s + i.amount_usd, 0);

  return ok({
    type: 'ingest_proposal',
    file_name: file.name,
    file_size_bytes: file.size,
    project_key: projectKey ?? null,
    confidence: extracted.confidence,
    line_items: extracted.line_items,
    by_category: byCategory,
    uncategorized_count: uncategorizedCount,
    total_usd: totalUsd,
    warnings: extracted.warnings,
    total_items: extracted.line_items.length,
  });
});
