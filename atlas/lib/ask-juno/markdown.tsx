/**
 * AJ-v4 — minimal, safe markdown for Ask Juno replies.
 *
 * Hand-rolled (Rule 3: no new UI deps) and rendered as REACT ELEMENTS —
 * never innerHTML — so model output cannot inject markup; anything not
 * recognised stays literal text and React escapes it.
 *
 * Supported:
 *   blocks : paragraphs · #–#### headings · - / * / 1. lists · GFM pipe tables
 *   inline : **bold** · *italic* · `code` · [text](href)
 *
 * Links: internal hrefs (/projects/p12, …) render with next/link so the
 * pane can deep-link entities; https:// opens a new tab; every other
 * scheme (javascript:, data:, …) is REFUSED and renders as plain text.
 */
import React, { type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';

// ── Inline ────────────────────────────────────────────────────────────────────

const INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(\[[^\]\n]+\]\([^()\s]+\))/g;

const codeStyle: CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: '0.92em',
  background: 'var(--color-surface-raised, #f0f0ee)',
  border: '1px solid var(--color-border-subtle, #ececea)',
  borderRadius: 4,
  padding: '0 4px',
};

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(text.slice(last, idx));
    const token = m[0];
    const key = `${keyBase}-i${k++}`;
    if (token.startsWith('`')) {
      nodes.push(
        <code key={key} style={codeStyle}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      // [label](href)
      const close = token.indexOf('](');
      const label = token.slice(1, close);
      const href = token.slice(close + 2, -1);
      if (href.startsWith('/')) {
        nodes.push(
          <Link key={key} href={href} style={{ textDecoration: 'underline', color: 'inherit' }}>
            {label}
          </Link>
        );
      } else if (href.startsWith('https://')) {
        nodes.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'underline', color: 'inherit' }}
          >
            {label}
          </a>
        );
      } else {
        // Unsafe scheme — keep the visible label only, as plain text.
        nodes.push(label);
      }
    }
    last = idx + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Inline nodes with single newlines preserved as <br/>. */
function renderInlineWithBreaks(text: string, keyBase: string): ReactNode[] {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push(<br key={`${keyBase}-br${i}`} />);
    out.push(...renderInline(line, `${keyBase}-l${i}`));
  });
  return out;
}

// ── Blocks ────────────────────────────────────────────────────────────────────

const tableWrapStyle: CSSProperties = { overflowX: 'auto', margin: '6px 0' };
const tableStyle: CSSProperties = {
  borderCollapse: 'collapse',
  fontSize: '0.95em',
  lineHeight: 1.4,
  minWidth: '60%',
};
const cellStyle: CSSProperties = {
  border: '1px solid var(--color-border-subtle, #ececea)',
  padding: '4px 8px',
  textAlign: 'left',
  verticalAlign: 'top',
};

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

const isTableLine = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isSeparatorLine = (l: string) => /^\s*\|?[\s|:-]+\|?\s*$/.test(l) && l.includes('-');
const listMatch = (l: string) => /^\s*([-*]|\d+[.)])\s+(.*)$/.exec(l);
const headingMatch = (l: string) => /^(#{1,4})\s+(.*)$/.exec(l);

/**
 * Render Ask Juno markdown to React nodes. Fault-tolerant: anything the
 * mini-grammar doesn't recognise renders as a plain paragraph.
 */
export function renderMarkdown(text: string): ReactNode {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let b = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i++;
      continue;
    }

    // Table block.
    if (isTableLine(line) && i + 1 < lines.length && isSeparatorLine(lines[i + 1]!)) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableLine(lines[i]!)) {
        rows.push(splitRow(lines[i]!));
        i++;
      }
      const key = `b${b++}`;
      blocks.push(
        <div key={key} style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {header.map((h, hi) => (
                  <th key={hi} style={{ ...cellStyle, fontWeight: 600 }}>
                    {renderInline(h, `${key}-h${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} style={cellStyle}>
                      {renderInline(c, `${key}-r${ri}c${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // List block (ordered when the first marker is numeric).
    const firstItem = listMatch(line);
    if (firstItem) {
      const ordered = /^\d/.test(firstItem[1]!);
      const items: string[] = [];
      while (i < lines.length) {
        const m = listMatch(lines[i]!);
        if (!m) break;
        items.push(m[2]!);
        i++;
      }
      const key = `b${b++}`;
      const children = items.map((item, ii) => (
        <li key={ii} style={{ margin: '2px 0' }}>
          {renderInline(item, `${key}-it${ii}`)}
        </li>
      ));
      blocks.push(
        ordered ? (
          <ol key={key} style={{ margin: '4px 0', paddingLeft: 20 }}>
            {children}
          </ol>
        ) : (
          <ul key={key} style={{ margin: '4px 0', paddingLeft: 20 }}>
            {children}
          </ul>
        )
      );
      continue;
    }

    // Heading.
    const h = headingMatch(line);
    if (h) {
      const key = `b${b++}`;
      blocks.push(
        <div key={key} style={{ fontWeight: 700, fontSize: '1.04em', margin: '10px 0 4px' }}>
          {renderInline(h[2]!, key)}
        </div>
      );
      i++;
      continue;
    }

    // Paragraph — consume until a blank line or a structural line.
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !isTableLine(lines[i]!) &&
      !listMatch(lines[i]!) &&
      !headingMatch(lines[i]!)
    ) {
      para.push(lines[i]!);
      i++;
    }
    const key = `b${b++}`;
    blocks.push(
      <p key={key} style={{ margin: '0 0 8px' }}>
        {renderInlineWithBreaks(para.join('\n'), key)}
      </p>
    );
  }

  return <>{blocks}</>;
}
