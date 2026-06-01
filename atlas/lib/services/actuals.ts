/**
 * Actuals service. Thin: a single createActualsEntry that validates +
 * inserts + audits. UI calls this through POST /api/projects/[id]/actuals.
 *
 * No business rules beyond shape validation in v1. The category
 * taxonomy is fixed by the DB CHECK constraint; everything else is
 * free text. Future versions may add change-order linkages + invoice
 * de-dup; defer until we feel the pain.
 */

import { z } from 'zod';
import { recordMutation } from '@/lib/services/audit';
import {
  archiveActualsEntry,
  insertActualsEntry,
  type ActualsCategory,
  type ActualsEntryView,
} from '@/lib/repos/actuals';
import { findActualsByProject } from '@/lib/repos/actuals';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

export class ActualsValidationError extends Error {
  readonly code = 'ACTUALS_VALIDATION';
  constructor(message: string) {
    super(message);
    this.name = 'ActualsValidationError';
  }
}

export const CreateActualsEntrySchema = z.object({
  projectId: z.string().uuid(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'entryDate must be YYYY-MM-DD'),
  category: z.enum(['land', 'build', 'soft', 'kingshaus', 'financing', 'other']),
  lineItem: z.string().trim().min(1).max(200),
  amountCents: z.number().int().positive('amountCents must be > 0'),
  vendor: z.string().trim().max(200).optional().nullable(),
  invoiceRef: z.string().trim().max(120).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  source: z.enum(['manual', 'csv', 'api']).optional(),
});
export type CreateActualsEntryInput = z.infer<typeof CreateActualsEntrySchema>;

export async function createActualsEntry(
  input: CreateActualsEntryInput,
  user: User
): Promise<{ id: string }> {
  const parsed = CreateActualsEntrySchema.parse(input);
  const id = await insertActualsEntry({
    projectId: parsed.projectId,
    entryDate: parsed.entryDate,
    category: parsed.category as ActualsCategory,
    lineItem: parsed.lineItem,
    amountCents: parsed.amountCents,
    vendor: parsed.vendor ?? null,
    invoiceRef: parsed.invoiceRef ?? null,
    notes: parsed.notes ?? null,
    source: parsed.source ?? 'manual',
    createdBy: user.id,
  });

  await emitAudit(user.id, 'actuals.create', id, {
    projectId: parsed.projectId,
    category: parsed.category,
    amountCents: parsed.amountCents,
  });

  return { id };
}

export async function archiveActuals(entryId: string, user: User): Promise<void> {
  await archiveActualsEntry(entryId);
  await emitAudit(user.id, 'actuals.archive', entryId, {});
}

/**
 * Convenience helper for the Actuals tab: list + group totals per
 * category. Pure computation on top of the repo read.
 */
export interface ActualsByCategory {
  category: ActualsCategory;
  entries: ActualsEntryView[];
  totalCents: number;
}

const CATEGORIES: ActualsCategory[] = ['land', 'build', 'soft', 'kingshaus', 'financing', 'other'];

export async function listActualsByCategory(projectId: string): Promise<{
  entries: ActualsEntryView[];
  byCategory: ActualsByCategory[];
  totalCents: number;
}> {
  const entries = await findActualsByProject(projectId, { limit: 500 });
  const grouped: Record<ActualsCategory, ActualsEntryView[]> = {
    land: [],
    build: [],
    soft: [],
    kingshaus: [],
    financing: [],
    other: [],
  };
  for (const e of entries) grouped[e.category].push(e);
  const byCategory = CATEGORIES.map((c) => ({
    category: c,
    entries: grouped[c],
    totalCents: grouped[c].reduce((s, e) => s + e.amountCents, 0),
  }));
  const totalCents = byCategory.reduce((s, g) => s + g.totalCents, 0);
  return { entries, byCategory, totalCents };
}

async function emitAudit(
  userId: string,
  action: string,
  resourceId: string,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId,
      route: `service:${action}:${resourceId}`,
      method: 'POST',
      statusCode: 200,
      ip: null,
      userAgent: `atlas-service meta=${JSON.stringify(meta)}`,
    });
  } catch {
    // Best-effort.
  }
}

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}
