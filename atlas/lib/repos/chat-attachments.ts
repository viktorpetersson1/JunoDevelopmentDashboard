/**
 * Chat attachments repo (AJ-v3).
 *
 * Parsed spreadsheet content for the Ask Juno pane. Reads are OWNER-SCOPED
 * both at RLS (created_by = auth.uid()) and here (explicit .eq guard when
 * using the service client) — an attachment id in a prompt must never read
 * another user's file.
 */

import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export interface AttachmentSheet {
  name: string;
  rows: Array<Array<string | number | boolean | null>>;
}

export interface ChatAttachmentView {
  id: string;
  fileName: string;
  kind: 'csv' | 'xlsx';
  sheetNames: string[];
  rowCount: number;
  sheets: AttachmentSheet[];
  createdAt: string;
}

interface Row {
  id: string;
  file_name: string;
  kind: 'csv' | 'xlsx';
  sheet_names: string[] | null;
  row_count: number;
  content: { sheets?: AttachmentSheet[] } | null;
  created_at: string;
}

const COLS = 'id, file_name, kind, sheet_names, row_count, content, created_at';

function toView(row: Row): ChatAttachmentView {
  return {
    id: row.id,
    fileName: row.file_name,
    kind: row.kind,
    sheetNames: row.sheet_names ?? [],
    rowCount: row.row_count,
    sheets: row.content?.sheets ?? [],
    createdAt: row.created_at,
  };
}

export async function insertAttachment(input: {
  createdBy: string;
  fileName: string;
  kind: 'csv' | 'xlsx';
  sheets: AttachmentSheet[];
}): Promise<ChatAttachmentView> {
  const supabase = createSupabaseServiceRoleClient();
  const rowCount = input.sheets.reduce((s, sh) => s + sh.rows.length, 0);
  const { data, error } = await supabase
    .schema('atlas')
    .from('chat_attachments')
    .insert({
      created_by: input.createdBy,
      file_name: input.fileName,
      kind: input.kind,
      sheet_names: input.sheets.map((s) => s.name),
      row_count: rowCount,
      content: { sheets: input.sheets },
    })
    .select(COLS)
    .single();
  if (error) throw new Error(`insertAttachment: ${error.message}`);
  return toView(data as unknown as Row);
}

/** Owner-scoped fetch — userId is REQUIRED and enforced in the query. */
export async function findAttachmentForUser(
  id: string,
  userId: string
): Promise<ChatAttachmentView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('chat_attachments')
    .select(COLS)
    .eq('id', id)
    .eq('created_by', userId)
    .maybeSingle();
  if (error) throw new Error(`findAttachmentForUser: ${error.message}`);
  return data ? toView(data as unknown as Row) : null;
}
