/**
 * POST /api/ask-juno/attachments — AJ-v3 file upload for the working pane.
 *
 * Accepts .xlsx (zero-dep parser, lib/xlsx) or .csv (lib/csv — T108 parser).
 * Parses server-side, stores the capped grid in atlas.chat_attachments, and
 * returns { attachment_id, preview } — the pane injects the id into the
 * conversation and the assistant reads rows via the read_attachment tool.
 *
 * Editor+ (attachments exist to drive updates). 2 MB / 500 rows / 60 cols.
 */

import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { parseXlsx, XlsxParseError } from '@/lib/xlsx/parse-xlsx';
import { parseCsv } from '@/lib/csv/parse';
import { insertAttachment, type AttachmentSheet } from '@/lib/repos/chat-attachments';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 500;
const MAX_COLS = 60;

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return badRequest('Attach a file field named "file".', 'VALIDATION_FAILED');
  }
  if (file.size > MAX_BYTES) {
    return badRequest(
      `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 2 MB. Trim the sheet to the rows that matter.`,
      'FILE_TOO_LARGE'
    );
  }

  const name = file.name || 'upload';
  const lower = name.toLowerCase();
  let kind: 'csv' | 'xlsx';
  let sheets: AttachmentSheet[];

  try {
    if (lower.endsWith('.xlsx')) {
      kind = 'xlsx';
      const wb = await parseXlsx(await file.arrayBuffer(), {
        maxRows: MAX_ROWS,
        maxCols: MAX_COLS,
      });
      sheets = wb.sheets;
    } else if (lower.endsWith('.csv')) {
      kind = 'csv';
      const parsed = parseCsv(await file.text());
      sheets = [
        {
          name: 'Sheet1',
          rows: [parsed.header, ...parsed.rows.slice(0, MAX_ROWS - 1)] as AttachmentSheet['rows'],
        },
      ];
    } else {
      return badRequest(
        'Unsupported file type — attach .xlsx or .csv. (Legacy .xls: open in Excel → Save As → .xlsx.)',
        'UNSUPPORTED_FILE_TYPE'
      );
    }
  } catch (err) {
    const msg =
      err instanceof XlsxParseError || err instanceof Error ? err.message : 'Parse failed';
    return badRequest(`Could not read ${name}: ${msg}`, 'PARSE_FAILED');
  }

  const totalRows = sheets.reduce((s, sh) => s + sh.rows.length, 0);
  if (totalRows === 0) return badRequest(`${name} has no rows.`, 'EMPTY_FILE');

  const view = await insertAttachment({
    createdBy: user.id,
    fileName: name,
    kind,
    sheets,
  });

  // Small preview so the pane can show what landed without a second fetch.
  const first = sheets[0]!;
  return ok({
    attachment_id: view.id,
    file_name: view.fileName,
    kind,
    sheet_names: view.sheetNames,
    row_count: view.rowCount,
    preview: {
      sheet: first.name,
      header: first.rows[0] ?? [],
      rows: first.rows.slice(1, 6),
    },
  });
});
