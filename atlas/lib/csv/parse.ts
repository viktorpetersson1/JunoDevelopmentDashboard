/**
 * Minimal RFC-4180-ish CSV parser used by T108 (Smart CSV import for Actuals).
 *
 * Goals:
 *   - Zero dependencies. Hard Rule #3 forbids adding `papaparse` / `csv-parse`.
 *   - Handles quoted fields, escaped quotes (`""` → `"`), embedded commas and
 *     newlines inside quotes, CRLF and LF line endings, trailing newlines.
 *   - Throws on malformed input (unterminated quoted field) so the caller can
 *     surface a clear "couldn't parse your file" error instead of silently
 *     dropping rows.
 *
 * Non-goals:
 *   - Streaming. Atlas caps imports at 5 MB so a single-pass walker is fine.
 *   - Type coercion. Returns raw strings; the column-mapper + Zod validator
 *     downstream handle numbers, dates, and enum coercion.
 */

export interface CsvParseResult {
  /** Header row values, trimmed. */
  header: string[];
  /** Body rows. Each row has exactly `header.length` cells; short rows are
   *  padded with empty strings, over-long rows are truncated. */
  rows: string[][];
}

/** Parse a CSV string into a header + rows. */
export function parseCsv(text: string): CsvParseResult {
  if (text === '' || text == null) {
    throw new Error('CSV is empty');
  }

  // Strip a UTF-8 BOM if present (Excel "Save As CSV" emits one).
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const allRows = walkRows(cleaned);

  // Drop trailing empty row produced by a final newline + EOF.
  while (allRows.length > 0) {
    const last = allRows[allRows.length - 1]!;
    if (last.length === 1 && last[0] === '') allRows.pop();
    else break;
  }

  if (allRows.length === 0) {
    throw new Error('CSV has no rows');
  }

  const rawHeader = allRows[0]!.map((h) => h.trim());
  const width = rawHeader.length;

  if (width === 0 || rawHeader.every((h) => h === '')) {
    throw new Error('CSV header row is empty');
  }

  const body = allRows.slice(1).map((row) => {
    if (row.length === width) return row;
    if (row.length < width) {
      const padded = row.slice();
      while (padded.length < width) padded.push('');
      return padded;
    }
    return row.slice(0, width);
  });

  return { header: rawHeader, rows: body };
}

/**
 * State-machine walker. One pass over the string; emits cell values into the
 * current row and rows into the result.
 *
 * Quoting rules (RFC 4180 §2.5 / §2.6 / §2.7):
 *   - A field beginning with `"` is quoted. Inside a quoted field, `""` is a
 *     literal `"`, newlines and commas are data, the closing `"` ends the field.
 *   - A field NOT beginning with `"` runs until the next `,` or newline.
 *   - Mixed line endings (CRLF + LF) are tolerated.
 */
function walkRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Doubled quote inside quoted field → literal quote.
        if (i + 1 < n && text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        // Lone quote closes the field.
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }

    // Not in quotes.
    if (ch === '"' && cell === '') {
      // Open a quoted field. Only counts as open if it starts the cell.
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      // CRLF or lone CR — treat as row terminator.
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
      i++;
      if (i < n && text[i] === '\n') i++;
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    cell += ch;
    i++;
  }

  if (inQuotes) {
    throw new Error('Unterminated quoted field');
  }

  // Flush the trailing cell + row (no terminator at EOF).
  row.push(cell);
  rows.push(row);

  return rows;
}
