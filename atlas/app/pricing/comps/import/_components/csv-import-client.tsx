'use client';

/**
 * CSV bulk-import client.
 *
 * Workflow:
 *   1. User pastes CSV text (or uploads a file → text).
 *   2. Client parses + validates each row against the same shape the API
 *      expects. Renders a preview table with row-level error flags.
 *   3. If all rows parse, "Import N comps" enables. On click, POSTs to
 *      /api/comps/bulk; on duplicate, surfaces the conflict for the user
 *      to de-dupe upstream.
 *
 * Expected columns (case-insensitive, order-flexible):
 *   address, sub_cut_key, status, is_nc, closing_date, sale_price_usd,
 *   ag_sqft, lot_size_acres, year_built, waterfront_type, broker,
 *   source_url, notes
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

interface SubCutOpt {
  key: string;
  label: string;
}

interface ParsedRow {
  raw: string[];
  parsed: ImportComp | null;
  errors: string[];
}

interface ImportComp {
  address: string;
  subCutKey: string;
  waterfrontType: string | null;
  isNc: boolean;
  status: 'closed' | 'active' | 'pending' | 'withdrawn';
  closingDate: string | null;
  salePriceCents: number | null;
  agSqft: number;
  lotSizeAcres: number | null;
  yearBuilt: number | null;
  broker: string | null;
  sourceUrl: string | null;
  notes: string | null;
}

const SAMPLE = `address,sub_cut_key,status,is_nc,closing_date,sale_price_usd,ag_sqft,lot_size_acres,year_built,waterfront_type,broker,source_url,notes
1140 Park Ave Mattituck,north_fork_sound_front,closed,true,2025-08-14,10000000,5200,1.5,2024,sound_front_bluff,Daniel Gale,https://example.com/listing/123,Strongest NF anchor
14 Bay Ln Greenport,north_fork_bayfront,closed,false,2024-03-22,4250000,3800,0.6,1998,bayfront,Compass,,`;

// ────────────────────────────────────────────────────────────────────────────
// CSV parser — minimal RFC4180-compatible (handles quoted fields with commas
// and embedded double-quotes via "" escape). No header skipping by line
// count — we look up the first row as the header row.
// ────────────────────────────────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(cur);
        cur = '';
      } else if (c === '\n' || c === '\r') {
        if (cur !== '' || row.length > 0) {
          row.push(cur);
          rows.push(row);
          row = [];
          cur = '';
        }
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else {
        cur += c;
      }
    }
  }
  if (cur !== '' || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function parseRow(header: string[], rawRow: string[], subCutKeys: Set<string>): ParsedRow {
  const errors: string[] = [];
  const cell = (name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? (rawRow[i] ?? '').trim() : '';
  };

  const address = cell('address');
  if (!address) errors.push('address is required');

  const subCutKey = cell('sub_cut_key');
  if (!subCutKey) errors.push('sub_cut_key is required');
  else if (!subCutKeys.has(subCutKey))
    errors.push(`sub_cut_key '${subCutKey}' is not in the East End taxonomy`);

  const statusRaw = cell('status').toLowerCase();
  if (!['closed', 'active', 'pending', 'withdrawn'].includes(statusRaw)) {
    errors.push(`status must be closed|active|pending|withdrawn (got '${statusRaw}')`);
  }
  const status = statusRaw as ImportComp['status'];

  const isNcRaw = cell('is_nc').toLowerCase();
  const isNc = isNcRaw === 'true' || isNcRaw === '1' || isNcRaw === 'yes';

  const closingDateRaw = cell('closing_date');
  const closingDate = closingDateRaw || null;
  if (status === 'closed' && !closingDate) {
    errors.push('closing_date required for closed comps');
  } else if (closingDate && !/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) {
    errors.push(`closing_date must be YYYY-MM-DD (got '${closingDate}')`);
  }

  const salePriceRaw = cell('sale_price_usd');
  const salePriceUsd = salePriceRaw ? Number.parseFloat(salePriceRaw.replace(/[,$]/g, '')) : null;
  const salePriceCents =
    salePriceUsd != null && Number.isFinite(salePriceUsd) ? Math.round(salePriceUsd * 100) : null;
  if (status === 'closed' && (!salePriceCents || salePriceCents <= 0)) {
    errors.push('sale_price_usd > 0 required for closed comps');
  }

  const agSqftRaw = cell('ag_sqft');
  const agSqft = agSqftRaw ? Number.parseInt(agSqftRaw.replace(/,/g, ''), 10) : NaN;
  if (!Number.isFinite(agSqft) || agSqft <= 0) {
    errors.push('ag_sqft must be a positive integer');
  }

  const lotRaw = cell('lot_size_acres');
  const lotSizeAcres = lotRaw ? Number.parseFloat(lotRaw) : null;

  const yrRaw = cell('year_built');
  const yearBuilt = yrRaw ? Number.parseInt(yrRaw, 10) : null;
  if (yearBuilt != null && (yearBuilt < 1800 || yearBuilt > 2100)) {
    errors.push('year_built out of range 1800-2100');
  }

  const wfRaw = cell('waterfront_type').toLowerCase();
  const waterfrontType =
    wfRaw && ['sound_front_bluff', 'bayfront', 'inlet', 'inland'].includes(wfRaw) ? wfRaw : null;
  if (wfRaw && !waterfrontType) {
    errors.push(
      `waterfront_type must be one of sound_front_bluff|bayfront|inlet|inland (got '${wfRaw}')`
    );
  }

  const sourceUrl = cell('source_url') || null;
  if (sourceUrl && !sourceUrl.match(/^https?:\/\//)) {
    errors.push('source_url must start with http:// or https://');
  }

  if (errors.length > 0) {
    return { raw: rawRow, parsed: null, errors };
  }

  return {
    raw: rawRow,
    errors: [],
    parsed: {
      address,
      subCutKey,
      waterfrontType,
      isNc,
      status,
      closingDate,
      salePriceCents,
      agSqft,
      lotSizeAcres: Number.isFinite(lotSizeAcres as number) ? (lotSizeAcres as number) : null,
      yearBuilt,
      broker: cell('broker') || null,
      sourceUrl,
      notes: cell('notes') || null,
    },
  };
}

export function CsvImportClient({ subCuts }: { subCuts: SubCutOpt[] }) {
  const router = useRouter();
  const [csv, setCsv] = useState<string>('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  const [success, setSuccess] = useState<{ inserted: number } | null>(null);

  const subCutKeys = useMemo(() => new Set(subCuts.map((s) => s.key)), [subCuts]);

  const preview = useMemo(() => {
    if (!csv.trim()) return null;
    const all = parseCsv(csv);
    if (all.length < 2) return null;
    const header = (all[0] ?? []).map((h) => h.trim().toLowerCase());
    const dataRows = all.slice(1).filter((r) => r.some((c) => c.trim() !== ''));
    const parsed = dataRows.map((r) => parseRow(header, r, subCutKeys));
    return { header, parsed };
  }, [csv, subCutKeys]);

  const okRows = preview ? preview.parsed.filter((p) => p.parsed) : [];
  const badRows = preview ? preview.parsed.filter((p) => !p.parsed) : [];
  const canImport = preview != null && okRows.length > 0 && badRows.length === 0;

  function handleFile(file: File) {
    file.text().then(setCsv);
  }

  function handleImport() {
    setServerError(null);
    setSuccess(null);
    startSubmit(async () => {
      const comps = okRows
        .map((r) => r.parsed!)
        .map((c) => ({
          address: c.address,
          subCutKey: c.subCutKey,
          waterfrontType: c.waterfrontType,
          isNc: c.isNc,
          status: c.status,
          closingDate: c.closingDate,
          salePriceCents: c.salePriceCents,
          agSqft: c.agSqft,
          lotSizeAcres: c.lotSizeAcres,
          yearBuilt: c.yearBuilt,
          broker: c.broker,
          sourceUrl: c.sourceUrl,
          notes: c.notes,
          source: 'csv' as const,
        }));
      const res = await fetch('/api/comps/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
        body: JSON.stringify({ comps }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: { code: string; message: string };
        } | null;
        setServerError(json?.error?.message ?? `Import failed (HTTP ${res.status})`);
        return;
      }
      const body = (await res.json()) as { data: { inserted: number } };
      setSuccess({ inserted: body.data.inserted });
      setCsv('');
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
            color: 'var(--color-text-primary)',
          }}
        >
          Bulk import comps
        </h1>
        <p
          style={{
            margin: '4px 0 0 0',
            fontSize: 13,
            color: 'var(--color-text-secondary)',
          }}
        >
          Paste a CSV or upload a file. All rows must validate before the import button enables —
          this is the day-1 seeding path (Q2c).
        </p>
      </header>

      <section
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <label
            style={{
              fontSize: 13,
              fontWeight: 400,
              color: 'var(--color-text-primary)',
            }}
          >
            CSV input
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setCsv(SAMPLE)}>
              Load sample
            </Button>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 400,
                color: 'var(--color-text-primary)',
                background: 'var(--color-surface-base)',
                border: '1px solid var(--color-border-hairline)',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Upload .csv
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </div>
        </div>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={10}
          placeholder="Paste CSV here (header row required: address, sub_cut_key, status, …)"
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 8,
            background: 'var(--color-surface-base)',
            color: 'var(--color-text-primary)',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
          }}
        >
          Required columns: address, sub_cut_key, status, ag_sqft. For status=closed also
          closing_date + sale_price_usd. Optional: is_nc, lot_size_acres, year_built,
          waterfront_type, broker, source_url, notes. sub_cut_key must be one of:{' '}
          {subCuts.map((s) => s.key).join(', ')}.
        </p>
      </section>

      {preview && (
        <section
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 14,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <header
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--color-text-primary)',
              }}
            >
              Preview — {preview.parsed.length} rows ({okRows.length} valid, {badRows.length} with
              errors)
            </h2>
            {badRows.length > 0 && (
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--color-negative, #dc2626)',
                  fontWeight: 400,
                }}
              >
                Fix all errors above before importing.
              </span>
            )}
          </header>

          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-base)', position: 'sticky', top: 0 }}>
                  <th style={th}>#</th>
                  <th style={th}>Address</th>
                  <th style={th}>Sub-cut</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: 'right' }}>Price</th>
                  <th style={{ ...th, textAlign: 'right' }}>Sqft</th>
                  <th style={th}>Errors</th>
                </tr>
              </thead>
              <tbody>
                {preview.parsed.map((p, i) => {
                  const hasError = !p.parsed;
                  return (
                    <tr
                      key={i}
                      style={{
                        borderTop: '1px solid var(--color-border-hairline)',
                        background: hasError ? 'rgba(220, 38, 38, 0.05)' : 'transparent',
                      }}
                    >
                      <td style={td}>{i + 2}</td>
                      <td style={td}>{p.parsed?.address ?? p.raw[0] ?? '—'}</td>
                      <td style={td}>{p.parsed?.subCutKey ?? '—'}</td>
                      <td style={td}>{p.parsed?.status ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {p.parsed?.salePriceCents
                          ? `$${(p.parsed.salePriceCents / 100).toLocaleString()}`
                          : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {p.parsed?.agSqft.toLocaleString() ?? '—'}
                      </td>
                      <td
                        style={{
                          ...td,
                          color: hasError
                            ? 'var(--color-negative, #dc2626)'
                            : 'var(--color-text-tertiary)',
                        }}
                      >
                        {p.errors.join('; ') || 'OK'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {serverError && (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--color-negative, #dc2626)',
            background: 'var(--color-surface-base)',
            border: '1px solid var(--color-border-hairline)',
            borderLeft: '3px solid var(--color-negative, #dc2626)',
            borderRadius: 8,
            padding: '10px 14px',
          }}
        >
          {serverError}
        </p>
      )}

      {success && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--color-positive, #16a34a)',
            background: 'var(--color-surface-base)',
            border: '1px solid var(--color-border-hairline)',
            borderLeft: '3px solid var(--color-positive, #16a34a)',
            borderRadius: 8,
            padding: '10px 14px',
          }}
        >
          Imported {success.inserted} comp{success.inserted === 1 ? '' : 's'}. They are now
          available to pricing runs.
        </p>
      )}

      <footer style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button type="button" variant="secondary" onClick={() => router.push('/pricing/comps')}>
          Back to library
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleImport}
          disabled={!canImport}
          loading={isSubmitting}
        >
          {canImport ? `Import ${okRows.length} comp${okRows.length === 1 ? '' : 's'}` : 'Import'}
        </Button>
      </footer>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '8px 10px',
  color: 'var(--color-text-primary)',
  verticalAlign: 'top',
};
