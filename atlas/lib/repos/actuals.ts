/**
 * Actuals repo. Reads + inserts for atlas.actuals_entries.
 *
 * Service (lib/services/actuals.ts) wraps inserts with Zod validation +
 * audit emission; UI talks to the service through the API route.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ActualsCategory = 'land' | 'build' | 'soft' | 'kingshaus' | 'financing' | 'other';
export type ActualsSource = 'manual' | 'csv' | 'api';

export interface ActualsEntryView {
  id: string;
  projectId: string;
  entryDate: string; // YYYY-MM-DD
  category: ActualsCategory;
  lineItem: string;
  amountCents: number;
  vendor: string | null;
  invoiceRef: string | null;
  notes: string | null;
  source: ActualsSource;
  isArchived: boolean;
  createdBy: string | null;
  createdAt: string;
}

interface ActualsRow {
  id: string;
  project_id: string;
  entry_date: string;
  category: string;
  line_item: string;
  amount_cents: number;
  vendor: string | null;
  invoice_ref: string | null;
  notes: string | null;
  source: string;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
}

function toView(row: ActualsRow): ActualsEntryView {
  return {
    id: row.id,
    projectId: row.project_id,
    entryDate: row.entry_date,
    category: row.category as ActualsCategory,
    lineItem: row.line_item,
    amountCents: row.amount_cents,
    vendor: row.vendor,
    invoiceRef: row.invoice_ref,
    notes: row.notes,
    source: row.source as ActualsSource,
    isArchived: row.is_archived,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS =
  'id, project_id, entry_date, category, line_item, amount_cents, vendor, invoice_ref, notes, source, is_archived, created_by, created_at';

/** List actuals for a project, newest entry_date first. Excludes archived by default. */
export async function findActualsByProject(
  projectId: string,
  opts: { includeArchived?: boolean; limit?: number } = {}
): Promise<ActualsEntryView[]> {
  const supabase = createSupabaseServerClient();
  let q = supabase
    .schema('atlas')
    .from('actuals_entries')
    .select(SELECT_COLUMNS)
    .eq('project_id', projectId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (!opts.includeArchived) q = q.eq('is_archived', false);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw new Error(`findActualsByProject: ${error.message}`);
  return ((data as unknown as ActualsRow[]) ?? []).map(toView);
}

export interface InsertActualsRow {
  projectId: string;
  entryDate: string;
  category: ActualsCategory;
  lineItem: string;
  amountCents: number;
  vendor?: string | null;
  invoiceRef?: string | null;
  notes?: string | null;
  source?: ActualsSource;
  createdBy: string;
}

export async function insertActualsEntry(row: InsertActualsRow): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('actuals_entries')
    .insert({
      project_id: row.projectId,
      entry_date: row.entryDate,
      category: row.category,
      line_item: row.lineItem,
      amount_cents: row.amountCents,
      vendor: row.vendor ?? null,
      invoice_ref: row.invoiceRef ?? null,
      notes: row.notes ?? null,
      source: row.source ?? 'manual',
      created_by: row.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertActualsEntry: ${error.message}`);
  return data.id as string;
}

/**
 * Batch insert. Single supabase `.insert([...])` call — Postgres treats it as
 * one statement, so a constraint violation aborts the whole batch (the
 * spirit of "rollback" required by V6.1 T108 §5).
 *
 * Throws on any error; caller surfaces the verbatim message.
 */
export async function bulkInsertActualsEntries(rows: InsertActualsRow[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const supabase = createSupabaseServerClient();
  const payload = rows.map((row) => ({
    project_id: row.projectId,
    entry_date: row.entryDate,
    category: row.category,
    line_item: row.lineItem,
    amount_cents: row.amountCents,
    vendor: row.vendor ?? null,
    invoice_ref: row.invoiceRef ?? null,
    notes: row.notes ?? null,
    source: row.source ?? 'csv',
    created_by: row.createdBy,
  }));
  const { data, error } = await supabase
    .schema('atlas')
    .from('actuals_entries')
    .insert(payload)
    .select('id');
  if (error) throw new Error(`bulkInsertActualsEntries: ${error.message}`);
  return (data ?? []).map((d) => d.id as string);
}

export async function archiveActualsEntry(entryId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .schema('atlas')
    .from('actuals_entries')
    .update({ is_archived: true })
    .eq('id', entryId);
  if (error) throw new Error(`archiveActualsEntry: ${error.message}`);
}
