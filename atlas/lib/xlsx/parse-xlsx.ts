/**
 * AJ-v3 — zero-dependency .xlsx reader (edge-native).
 *
 * Why hand-rolled: the npm parsers (sheetjs/exceljs) carry open security
 * advisories and weight; an .xlsx is just a ZIP of XML, and the edge
 * runtime has DecompressionStream for the deflate entries. Same zero-dep
 * spirit as lib/csv/parse.ts (T108).
 *
 * Supports what the "update figures from a sheet" flow needs:
 *   - ZIP central directory walk; STORED (0) + DEFLATE (8) entries
 *   - sharedStrings.xml (plain + rich-text runs)
 *   - per-sheet cell grid: strings, numbers, booleans, inline strings,
 *     formula cached values
 * Not supported (documented): cell styles/date formatting — Excel stores
 * dates as numeric serials; without the style table they surface as
 * numbers. Fine for figure updates; the assistant is told about this.
 */

export interface ParsedSheet {
  name: string;
  /** Row-major grid; ragged rows are padded with null to the max width. */
  rows: Array<Array<string | number | boolean | null>>;
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
}

export class XlsxParseError extends Error {}

// ── ZIP plumbing ─────────────────────────────────────────────────────────────

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

function readEntries(buf: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buf);
  // EOCD is within the last 64KB + 22 bytes.
  const min = Math.max(0, buf.byteLength - 65_557);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxParseError('Not a valid .xlsx file (ZIP end record missing).');

  const count = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  const dec = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(off, true) !== CDIR_SIG) {
      throw new XlsxParseError('Corrupt .xlsx (central directory).');
    }
    const method = view.getUint16(off + 10, true);
    const compressedSize = view.getUint32(off + 20, true);
    const nameLen = view.getUint16(off + 28, true);
    const extraLen = view.getUint16(off + 30, true);
    const commentLen = view.getUint16(off + 32, true);
    const localHeaderOffset = view.getUint32(off + 42, true);
    const name = dec.decode(new Uint8Array(buf, off + 46, nameLen));
    entries.push({ name, method, compressedSize, localHeaderOffset });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntryText(buf: ArrayBuffer, entry: ZipEntry): Promise<string> {
  const view = new DataView(buf);
  const o = entry.localHeaderOffset;
  if (view.getUint32(o, true) !== LOCAL_SIG) {
    throw new XlsxParseError(`Corrupt .xlsx (local header for ${entry.name}).`);
  }
  const nameLen = view.getUint16(o + 26, true);
  const extraLen = view.getUint16(o + 28, true);
  const dataStart = o + 30 + nameLen + extraLen;
  const raw = new Uint8Array(buf, dataStart, entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(raw);
  if (entry.method === 8) {
    // ReadableStream (not Blob.stream()) — identical on the edge runtime,
    // and node/jsdom test environments lack Blob.stream().
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(raw)); // copy — detached-buffer safety
        controller.close();
      },
    });
    const stream = source.pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(stream).text();
  }
  throw new XlsxParseError(`Unsupported ZIP compression method ${entry.method}.`);
}

// ── XML helpers (targeted, not a general parser) ─────────────────────────────

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m);
}

/** All `<t …>text</t>` contents inside a fragment, concatenated (rich runs). */
function textRuns(fragment: string): string {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) out += decodeXml(m[1]!);
  // Self-closing <t/> contributes nothing.
  return out;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(textRuns(m[1]!));
  return out;
}

/** "BC" → 54 (0-indexed). */
export function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(
  xml: string,
  shared: string[],
  limits: { maxRows: number; maxCols: number }
): Array<Array<string | number | boolean | null>> {
  const rows: Array<Array<string | number | boolean | null>> = [];
  const rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;
  const cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml)) !== null && rows.length < limits.maxRows) {
    const cells: Array<string | number | boolean | null> = [];
    let cm: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(rm[1]!)) !== null) {
      const attrs = cm[1]!;
      const inner = cm[2] ?? '';
      const refMatch = attrs.match(/r="([A-Z]+)\d+"/);
      const col = refMatch ? columnIndex(refMatch[1]!) : cells.length;
      if (col >= limits.maxCols) continue;
      const type = attrs.match(/t="(\w+)"/)?.[1] ?? 'n';

      let value: string | number | boolean | null = null;
      if (type === 'inlineStr') {
        value = textRuns(inner);
      } else {
        const v = inner.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
        if (v !== undefined) {
          const rawV = decodeXml(v);
          if (type === 's') value = shared[Number(rawV)] ?? '';
          else if (type === 'b') value = rawV === '1';
          else if (type === 'str') value = rawV;
          else {
            const n = Number(rawV);
            value = Number.isFinite(n) ? n : rawV;
          }
        }
      }
      // Pad skipped columns (sparse rows carry explicit refs).
      while (cells.length < col) cells.push(null);
      cells[col] = value;
    }
    rows.push(cells);
  }

  // Pad ragged rows to a uniform width for table rendering.
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  for (const r of rows) while (r.length < width) r.push(null);
  return rows;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function parseXlsx(
  buf: ArrayBuffer,
  opts?: { maxRows?: number; maxCols?: number; maxSheets?: number }
): Promise<ParsedWorkbook> {
  const limits = {
    maxRows: opts?.maxRows ?? 500,
    maxCols: opts?.maxCols ?? 60,
    maxSheets: opts?.maxSheets ?? 5,
  };
  const entries = readEntries(buf);
  const byName = new Map(entries.map((e) => [e.name, e]));

  // Sheet display names from workbook.xml (order matters; r:id ↔ rels map
  // to worksheet paths — for the common single-digit case sheetN.xml).
  const workbookXml = byName.has('xl/workbook.xml')
    ? await readEntryText(buf, byName.get('xl/workbook.xml')!)
    : '';
  const names: string[] = [];
  const nameRe = /<sheet\s[^>]*name="([^"]*)"[^>]*\/?>/g;
  let nm: RegExpExecArray | null;
  while ((nm = nameRe.exec(workbookXml)) !== null) names.push(decodeXml(nm[1]!));

  const shared = byName.has('xl/sharedStrings.xml')
    ? parseSharedStrings(await readEntryText(buf, byName.get('xl/sharedStrings.xml')!))
    : [];

  const sheetEntries = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort(
      (a, b) =>
        Number(a.name.match(/sheet(\d+)/)?.[1] ?? 0) - Number(b.name.match(/sheet(\d+)/)?.[1] ?? 0)
    )
    .slice(0, limits.maxSheets);

  if (sheetEntries.length === 0) {
    throw new XlsxParseError('No worksheets found — is this a valid .xlsx file?');
  }

  const sheets: ParsedSheet[] = [];
  for (let i = 0; i < sheetEntries.length; i++) {
    const xml = await readEntryText(buf, sheetEntries[i]!);
    sheets.push({ name: names[i] ?? `Sheet${i + 1}`, rows: parseSheet(xml, shared, limits) });
  }
  return { sheets };
}
