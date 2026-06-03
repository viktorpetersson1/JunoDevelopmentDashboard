import { describe, expect, it } from 'vitest';
import { parseCsv } from '../parse';

describe('parseCsv', () => {
  it('throws on an empty file', () => {
    expect(() => parseCsv('')).toThrow(/empty/i);
  });

  it('parses a simple 2x2 grid', () => {
    const out = parseCsv('a,b\n1,2');
    expect(out.header).toEqual(['a', 'b']);
    expect(out.rows).toEqual([['1', '2']]);
  });

  it('handles quoted fields containing commas', () => {
    const out = parseCsv('vendor,note\n"Acme, Inc","one,two"');
    expect(out.header).toEqual(['vendor', 'note']);
    expect(out.rows).toEqual([['Acme, Inc', 'one,two']]);
  });

  it('handles quoted fields containing newlines', () => {
    const csv = 'a,b\n"line1\nline2",ok';
    const out = parseCsv(csv);
    expect(out.rows).toEqual([['line1\nline2', 'ok']]);
  });

  it('handles escaped quotes inside a quoted field', () => {
    const out = parseCsv('a,b\n"she said ""hi""",ok');
    expect(out.rows).toEqual([['she said "hi"', 'ok']]);
  });

  it('tolerates a trailing newline + mixed CRLF/LF line endings', () => {
    const out = parseCsv('a,b\r\n1,2\r\n3,4\n');
    expect(out.header).toEqual(['a', 'b']);
    expect(out.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('pads short rows + truncates over-long rows to header width', () => {
    const out = parseCsv('a,b,c\n1,2\n4,5,6,7');
    expect(out.rows).toEqual([
      ['1', '2', ''],
      ['4', '5', '6'],
    ]);
  });

  it('throws on an unterminated quoted field', () => {
    expect(() => parseCsv('a,b\n"oops,1')).toThrow(/unterminated/i);
  });
});
