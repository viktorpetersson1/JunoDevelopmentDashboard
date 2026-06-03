/**
 * Project risks repo. Reads + writes for atlas.project_risks.
 *
 * All mutations use the standard server client (same as insertActualsEntry).
 * Route handlers call these directly — no intermediate service layer needed
 * for this table's simple CRUD pattern.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface ProjectRiskView {
  id: string;
  projectId: string;
  risk: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string | null;
  status: 'open' | 'mitigated' | 'closed';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InsertRiskRow {
  projectId: string;
  risk: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigation?: string | null;
  status?: 'open' | 'mitigated' | 'closed';
  createdBy: string;
}

export interface PatchRiskRow {
  risk?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  mitigation?: string | null;
  status?: 'open' | 'mitigated' | 'closed';
}

interface RiskRow {
  id: string;
  project_id: string;
  risk: string;
  severity: string;
  mitigation: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function toView(row: RiskRow): ProjectRiskView {
  return {
    id: row.id,
    projectId: row.project_id,
    risk: row.risk,
    severity: row.severity as ProjectRiskView['severity'],
    mitigation: row.mitigation,
    status: row.status as ProjectRiskView['status'],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, project_id, risk, severity, mitigation, status, created_by, created_at, updated_at';

/** List all risks for a project, newest first. */
export async function findRisksByProject(projectId: string): Promise<ProjectRiskView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('project_risks')
    .select(SELECT_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`findRisksByProject: ${error.message}`);
  return ((data as unknown as RiskRow[]) ?? []).map(toView);
}

/** Insert one risk row. Returns the new row id. */
export async function insertRisk(row: InsertRiskRow): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('project_risks')
    .insert({
      project_id: row.projectId,
      risk: row.risk,
      severity: row.severity,
      mitigation: row.mitigation ?? null,
      status: row.status ?? 'open',
      created_by: row.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertRisk: ${error.message}`);
  return data.id as string;
}

/** Apply a partial update to an existing risk row. */
export async function patchRisk(id: string, patch: PatchRiskRow): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.risk !== undefined) payload.risk = patch.risk;
  if (patch.severity !== undefined) payload.severity = patch.severity;
  if ('mitigation' in patch) payload.mitigation = patch.mitigation ?? null;
  if (patch.status !== undefined) payload.status = patch.status;
  const { error } = await supabase
    .schema('atlas')
    .from('project_risks')
    .update(payload)
    .eq('id', id);
  if (error) throw new Error(`patchRisk: ${error.message}`);
}

/** Hard-delete a risk row. */
export async function deleteRisk(id: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .schema('atlas')
    .from('project_risks')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`deleteRisk: ${error.message}`);
}
