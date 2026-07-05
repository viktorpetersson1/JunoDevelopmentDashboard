/**
 * AJ-v3 — zero-dep xlsx parser tests.
 *
 * Builds REAL .xlsx byte streams in-test: a hand-rolled ZIP writer with
 * STORED entries, and a DEFLATE variant produced by the runtime's own
 * CompressionStream('deflate-raw') — no fixtures, no deps.
 */

import { describe, expect, it } from 'vitest';
import { parseXlsx, columnIndex, XlsxParseError } from '../parse-xlsx';

// ── Minimal ZIP writer (test-only) ───────────────────────────────────────────

interface FileSpec {
  name: string;
  data: Uint8Array;
  /** 0 = stored, 8 = deflate (data must already be deflate-raw bytes). */
  method: 0 | 8;
  /** Uncompressed size (equals data.length for stored). */
  rawSize: number;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}

function buildZip(files: FileSpec[]): ArrayBuffer {
  const enc = new TextEncoder();
  const chunks: number[] = [];
  const central: number[] = [];
  const offsets: number[] = [];

  for (const f of files) {
    offsets.push(chunks.length);
    const name = enc.encode(f.name);
    // Local header (CRC left 0 — the parser does not verify CRCs).
    chunks.push(
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(f.method),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(f.data.length),
      ...u32(f.rawSize),
      ...u16(name.length),
      ...u16(0)
    );
    chunks.push(...name, ...f.data);
  }

  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    const name = enc.encode(f.name);
    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(f.method),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(f.data.length),
      ...u32(f.rawSize),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offsets[i]!)
    );
    central.push(...name);
  }

  const cdStart = chunks.length;
  chunks.push(...central);
  chunks.push(
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(central.length),
    ...u32(cdStart),
    ...u16(0)
  );
  return new Uint8Array(chunks).buffer;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ── Workbook fixtures ────────────────────────────────────────────────────────

const WORKBOOK_XML = `<?xml version="1.0"?><workbook><sheets><sheet name="Figures &amp; Costs" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const SHARED_XML = `<?xml version="1.0"?><sst count="3" uniqueCount="3"><si><t>Project</t></si><si><r><t>Land </t></r><r><t>cost</t></r></si><si><t>84 Sunset Beach Road</t></si></sst>`;
const SHEET_XML = `<?xml version="1.0"?><worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="str"><v>Target sale</v></c></row>
<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>2200000</v></c><c r="D2" t="b"><v>1</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>North Haven</t></is></c><c r="C3"><v>8009893.5</v></c></row>
</sheetData></worksheet>`;

function specs(method: 0 | 8, enc: (s: string) => Promise<Uint8Array> | Uint8Array) {
  const raw = new TextEncoder();
  return Promise.all(
    [
      { name: 'xl/workbook.xml', xml: WORKBOOK_XML },
      { name: 'xl/sharedStrings.xml', xml: SHARED_XML },
      { name: 'xl/worksheets/sheet1.xml', xml: SHEET_XML },
    ].map(async (f) => {
      const rawBytes = raw.encode(f.xml);
      const data = await enc(f.xml);
      return { name: f.name, data, method, rawSize: rawBytes.length } as FileSpec;
    })
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('parseXlsx (zero-dep)', () => {
  it('parses a STORED workbook: shared strings, rich runs, sparse cells, types', async () => {
    const files = await specs(0, (s) => new TextEncoder().encode(s));
    const wb = await parseXlsx(buildZip(files));

    expect(wb.sheets).toHaveLength(1);
    expect(wb.sheets[0]!.name).toBe('Figures & Costs');
    const rows = wb.sheets[0]!.rows;
    expect(rows[0]).toEqual(['Project', 'Land cost', 'Target sale', null]);
    expect(rows[1]).toEqual(['84 Sunset Beach Road', 2_200_000, null, true]);
    expect(rows[2]).toEqual(['North Haven', null, 8_009_893.5, null]);
  });

  it('parses a DEFLATE workbook (real deflate-raw via CompressionStream)', async () => {
    const files = await specs(8, (s) => deflateRaw(new TextEncoder().encode(s)));
    const wb = await parseXlsx(buildZip(files));
    expect(wb.sheets[0]!.rows[1]![1]).toBe(2_200_000);
    expect(wb.sheets[0]!.rows[2]![0]).toBe('North Haven');
  });

  it('respects row/col limits', async () => {
    const files = await specs(0, (s) => new TextEncoder().encode(s));
    const wb = await parseXlsx(buildZip(files), { maxRows: 2, maxCols: 2 });
    expect(wb.sheets[0]!.rows).toHaveLength(2);
    expect(wb.sheets[0]!.rows[0]).toEqual(['Project', 'Land cost']);
  });

  it('rejects non-zip bytes with a readable error', async () => {
    await expect(parseXlsx(new TextEncoder().encode('hello,world').buffer)).rejects.toThrow(
      XlsxParseError
    );
  });

  it('rejects a zip with no worksheets', async () => {
    const only = await specs(0, (s) => new TextEncoder().encode(s));
    await expect(parseXlsx(buildZip([only[0]!]))).rejects.toThrow(/No worksheets/);
  });

  it('columnIndex maps A→0, Z→25, AA→26, BC→54', () => {
    expect(columnIndex('A')).toBe(0);
    expect(columnIndex('Z')).toBe(25);
    expect(columnIndex('AA')).toBe(26);
    expect(columnIndex('BC')).toBe(54);
  });
});
