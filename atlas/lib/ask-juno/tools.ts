/**
 * Ask Juno tool definitions + server-side executors (V6.1 T115).
 *
 * Tool definitions follow the Anthropic Messages API `tools` format.
 * Executors call repos / services directly with the authenticated user
 * context — same gates as the API routes (Hard Rule #5).
 *
 * Deviation V6-07.a: Vercel AI SDK not in stack → using raw Anthropic
 * Messages API `tools` parameter (same fetch pattern as comp-researcher.ts).
 */

import {
  findManyProjects,
  findCurrentProjectByKey,
  findCurrentProjectUuidByKey,
} from '@/lib/repos/project';
import { findLatestLockedSnapshot } from '@/lib/repos/approval-snapshot';
import { runProject } from '@/lib/calc/project/runProject';
import { BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { buildProjectPnL } from '@/lib/finance/project-pnl';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveGlobalsWithCapital } from '@/lib/treasury/capital-position';
import { flagEnabled } from '@/lib/flags';
import { listMeetings, findMeetingById } from '@/lib/repos/meetings';
import {
  listOpportunities,
  findOpportunityById,
  insertOpportunity,
  patchOpportunity,
} from '@/lib/repos/opportunities';
import { findAttachmentForUser } from '@/lib/repos/chat-attachments';
import { listActualsByCategory } from '@/lib/services/actuals';
import { createActualsEntry, type CreateActualsEntryInput } from '@/lib/services/actuals';
import { insertRisk } from '@/lib/repos/project-risks';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { researchComps } from '@/lib/pricing/comp-researcher';
import type { User } from '@supabase/supabase-js';

// ── Tool definition shape (Anthropic tools format) ────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ── Tool result ───────────────────────────────────────────────────────────────

export interface ToolResult {
  /** Data to pass back to Claude as the tool_result content. */
  content: string;
  /** Optional audit log id emitted by write tools. */
  audit_log_id?: string | null;
  /** True if this was a write action. */
  is_write: boolean;
}

// ── READ tool definitions ─────────────────────────────────────────────────────

/**
 * V7 T134 — the tool set the model actually sees. The pricing surface is
 * parked by default; its research_comps tool (and the pricing LLM path behind
 * it) is only offered when ATLAS_FEATURE_FLAGS includes 'pricing'.
 */
export function availableToolDefinitions(): ToolDefinition[] {
  return flagEnabled('pricing')
    ? TOOL_DEFINITIONS
    : TOOL_DEFINITIONS.filter((t) => t.name !== 'research_comps');
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'list_projects',
    description:
      'List all active (non-archived) projects with key metrics (name, stage, status, total revenue, NPAT margin, sale date). Call this before answering any project-specific question.',
    input_schema: {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          description:
            'Optional stage filter: tbc | sourcing | pre_construction | construction | sales | sold',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_project_summary',
    description:
      'Get detailed summary for one project by its project_key (e.g. "p2", "84sbr"). Returns inputs, calc-engine KPIs, P&L, and 9-line margin breakdown.',
    input_schema: {
      type: 'object',
      properties: {
        project_key: { type: 'string', description: 'The stable project slug (e.g. "p2")' },
      },
      required: ['project_key'],
    },
  },
  {
    name: 'get_dashboard_kpis',
    description:
      'Get portfolio-level KPIs: total pipeline revenue, LOC utilisation, rollout trigger, peak equity, committed vs prospect breakdown.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_actuals',
    description: 'List recorded actual costs for a project grouped by category.',
    input_schema: {
      type: 'object',
      properties: {
        project_key: { type: 'string', description: 'The project slug' },
      },
      required: ['project_key'],
    },
  },
  // ── AJ-v3 — interaction protocol ──────────────────────────────────────────
  {
    // Never executed server-side: the route intercepts it and renders the
    // question as clickable options in the pane; the user's pick comes back
    // as the tool_result. Use whenever a request is ambiguous instead of
    // guessing (which project? archive or just remove from pipeline? which
    // column is the sale price?).
    name: 'ask_user',
    description:
      'Ask the user a clarifying question with 2-4 concrete options. Use when a request is ambiguous, when multiple records could match, or before an irreversible step needs a parameter choice. The user may also type a free-form answer. Ask ONE question at a time.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question, one sentence.' },
        options: {
          type: 'array',
          description: '2-4 mutually exclusive choices.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Short button label (1-6 words)' },
              description: { type: 'string', description: 'One-line explanation (optional)' },
            },
            required: ['label'],
          },
        },
      },
      required: ['question', 'options'],
    },
  },
  {
    name: 'read_attachment',
    description:
      'Read rows from a spreadsheet the user attached (they appear as [attachment:<id> <filename>] in the conversation). Returns the header + a page of rows. Page with offset/limit for large sheets; pick a sheet by name when the workbook has several. Numbers arrive as numbers; Excel DATES arrive as raw serial numbers (no style table) — ask the user if a date matters.',
    input_schema: {
      type: 'object',
      properties: {
        attachment_id: { type: 'string', description: 'The attachment uuid' },
        sheet: { type: 'string', description: 'Sheet name (default: first sheet)' },
        offset: { type: 'number', description: 'Row offset into the sheet (default 0)' },
        limit: { type: 'number', description: 'Max rows to return (default 80, cap 200)' },
      },
      required: ['attachment_id'],
    },
  },

  // ── V7 T143 — meetings + opportunities (READ) ─────────────────────────────
  {
    name: 'list_meetings',
    description:
      'List ingested Juno meetings (Fathom recordings): id, title, date, participant count, whether a transcript exists. Use FIRST for any "what did we decide/discuss/agree" question, then get_meeting for the detail.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_meeting',
    description:
      'Get one meeting by id: summary plus a transcript chunk. Transcripts are chunked (~12k chars); the result reports chunk/chunk_count — call again with the next chunk number if the answer needs more. Cite the meeting title + date when quoting.',
    input_schema: {
      type: 'object',
      properties: {
        meeting_id: { type: 'string', description: 'The meeting id from list_meetings' },
        chunk: { type: 'number', description: 'Transcript chunk number (1-based, default 1)' },
      },
      required: ['meeting_id'],
    },
  },
  {
    name: 'list_opportunities',
    description:
      'List pipeline opportunities (the standardized deal sheet): name, status, owner, cash needed, timeline, expected profit/margin, next step. Use for "which deal should we chase" / pipeline questions.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_opportunity',
    description:
      'Get one opportunity by id, including the research record (notes, links, decision log).',
    input_schema: {
      type: 'object',
      properties: {
        opportunity_id: { type: 'string', description: 'The opportunity id (uuid)' },
      },
      required: ['opportunity_id'],
    },
  },
  {
    // V6.1.5-001 — wraps the live Perplexity Sonar comp researcher.
    name: 'research_comps',
    description:
      'Research comparable sales (closed + active) for a subject property via the live pricing comp engine. Returns the comp set with $/sqft + verifiable source URLs, the sub-cut definition, data-gap severity, and a narrative. Use for "what are the comps for X" / "pull comps near Y". Read-only — auto-executes. May take 15-30s.',
    input_schema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Subject property address (e.g. "84 South Bayfront Rd, North Haven, NY")',
        },
        sub_cut_label: {
          type: 'string',
          description: 'Human sub-market / sub-cut label (e.g. "North Haven non-WF NC")',
        },
        ag_sqft: { type: 'number', description: 'Above-grade square footage of the subject' },
        is_nc: { type: 'boolean', description: 'New construction? Defaults true.' },
        comp_window_months: {
          type: 'number',
          description: 'Lookback window in months (default 24)',
        },
      },
      required: ['address', 'sub_cut_label', 'ag_sqft'],
    },
  },

  // ── WRITE tool definitions ────────────────────────────────────────────────

  {
    name: 'create_project',
    description:
      'Create a new project. Defaults stage to "tbc". ALWAYS requires user confirmation — never auto-executes.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name (required)' },
        purchase_date: { type: 'string', description: 'YYYY-MM start / purchase month' },
        villa_sqft_ag: { type: 'number', description: 'Above-grade sqft (required)' },
        land_cost_usd: { type: 'number', description: 'Land cost in USD (required)' },
        construction_months: { type: 'number', description: 'Construction duration months' },
        sales_months: { type: 'number', description: 'Sales period months' },
        address: { type: 'string', description: 'Site address (optional)' },
        build_cost_per_sqft: {
          type: 'number',
          description: 'Build $/sqft (optional, uses global default if null)',
        },
      },
      required: ['name', 'villa_sqft_ag', 'land_cost_usd'],
    },
  },
  {
    name: 'update_project',
    description:
      'Update one or more fields on an existing project. ALWAYS requires user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        project_key: { type: 'string', description: 'The project slug to update' },
        purchase_date: { type: 'string' },
        villa_sqft_ag: { type: 'number' },
        land_cost_usd: { type: 'number' },
        build_cost_per_sqft: { type: 'number' },
        soft_costs_lump_sum: { type: 'number' },
        senior_ltv_pct: { type: 'number', description: 'As decimal, e.g. 0.75 for 75%' },
        interest_rate_apr: { type: 'number', description: 'As decimal' },
        sale_price_override_usd: { type: 'number' },
        target_margin: { type: 'number', description: 'As decimal, e.g. 0.20 for 20%' },
        tax_rate_pct: { type: 'number' },
      },
      required: ['project_key'],
    },
  },
  {
    name: 'create_actuals_entry',
    description:
      'Log one actual cost entry for a project. Auto-executes when amount ≤ $10,000 and no locked snapshot.',
    input_schema: {
      type: 'object',
      properties: {
        project_key: { type: 'string', description: 'The project slug' },
        entry_date: { type: 'string', description: 'YYYY-MM-DD' },
        category: {
          type: 'string',
          description: 'land | build | soft | kingshaus | financing | other',
        },
        line_item: { type: 'string', description: 'Description of the cost' },
        amount_usd: { type: 'number', description: 'Amount in USD (positive)' },
        vendor: { type: 'string', description: 'Optional vendor name' },
        invoice_ref: { type: 'string', description: 'Optional invoice reference' },
      },
      required: ['project_key', 'entry_date', 'category', 'line_item', 'amount_usd'],
    },
  },
  {
    name: 'create_risk',
    description: 'Log a qualitative risk for a project. Auto-executes (no monetary impact).',
    input_schema: {
      type: 'object',
      properties: {
        project_key: { type: 'string' },
        risk: { type: 'string', description: 'Risk description (max 500 chars)' },
        severity: { type: 'string', description: 'low | medium | high | critical' },
        mitigation: { type: 'string', description: 'Optional mitigation plan' },
      },
      required: ['project_key', 'risk'],
    },
  },

  // ── AJ-v3 write tools ──────────────────────────────────────────────────────
  {
    name: 'archive_project',
    description:
      'Archive ("delete") a project — removes it from every surface and the engine while keeping the audit trail; reversible by an admin. ALWAYS requires user confirmation. Before proposing, confirm WHICH project via list_projects if there is any ambiguity.',
    input_schema: {
      type: 'object',
      properties: {
        project_key: { type: 'string', description: 'The project slug (e.g. "p2")' },
      },
      required: ['project_key'],
    },
  },
  {
    name: 'create_opportunity',
    description:
      'Add a potential deal to the pipeline (the standardized deal sheet). Requires confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Deal name (required)' },
        market: { type: 'string', description: 'e.g. shelter_island, miami' },
        status: {
          type: 'string',
          description: 'researching | contacted | negotiating (default researching)',
        },
        owner_name: { type: 'string' },
        cash_needed_usd: { type: 'number' },
        timeline_months: { type: 'number' },
        expected_profit_usd: { type: 'number' },
        expected_margin_pct: { type: 'number' },
        next_step: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_opportunity',
    description:
      'Update fields on a pipeline opportunity (metrics, status, next step). Promoted records are read-only. Requires confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        opportunity_id: {
          type: 'string',
          description: 'The opportunity uuid (from list_opportunities)',
        },
        status: {
          type: 'string',
          description: 'researching | contacted | negotiating | passed',
        },
        cash_needed_usd: { type: 'number' },
        timeline_months: { type: 'number' },
        expected_profit_usd: { type: 'number' },
        expected_margin_pct: { type: 'number' },
        next_step: { type: 'string' },
        next_step_owner: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['opportunity_id'],
    },
  },
];

// ── Executor ──────────────────────────────────────────────────────────────────

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}

/**
 * Execute a single tool call. Returns a ToolResult.
 * Throws on hard failures (unknown tool, execution error).
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  user: User
): Promise<ToolResult> {
  switch (toolName) {
    // ── READ tools ────────────────────────────────────────────────────────────

    case 'list_projects': {
      const opts = args.stage ? { stage: args.stage as string } : {};
      const { projects } = await findManyProjects({ ...opts, limit: 100 });
      const { globals } = await getActiveGlobals();
      const rows = projects.map((p) => {
        const r = runProject(p, globals, BASELINE_SCENARIO);
        const pnl = buildProjectPnL(r, { taxRatePct: p.tax_rate_pct });
        return {
          id: p.id,
          name: p.name,
          stage: p.stage,
          status: p.status,
          address: p.address,
          total_sales_usd: Math.round(r.kpis.total_sales),
          npat_usd: Math.round(pnl.net_profit_after_tax_usd),
          npat_margin_pct: (pnl.npat_margin_pct * 100).toFixed(1) + '%',
          sale_date: r.sale_date,
          irr: r.kpis.irr_annual != null ? (r.kpis.irr_annual * 100).toFixed(1) + '%' : null,
        };
      });
      return { content: JSON.stringify({ projects: rows, count: rows.length }), is_write: false };
    }

    case 'get_project_summary': {
      const key = String(args.project_key ?? '');
      const project = await findCurrentProjectByKey(key);
      if (!project) return { content: `Project "${key}" not found.`, is_write: false };
      const { globals } = await getActiveGlobals();
      const result = runProject(project, globals, BASELINE_SCENARIO);
      const pnl = buildProjectPnL(result, { taxRatePct: project.tax_rate_pct });
      return {
        content: JSON.stringify({
          project_key: project.id,
          name: project.name,
          address: project.address,
          stage: project.stage,
          status: project.status,
          start_date: result.start_date,
          sale_date: result.sale_date,
          inputs: {
            villa_sqft_ag: project.villa_sqft_ag,
            villa_sqft_bg: project.villa_sqft_bg,
            land_cost_usd: project.land_cost_usd,
            build_cost_per_sqft: project.build_cost_per_sqft,
            soft_costs_lump_sum: project.soft_costs_lump_sum,
            senior_ltv_pct: project.senior_ltv_pct,
            interest_rate_apr: project.interest_rate_apr,
          },
          kpis: {
            total_sales_usd: Math.round(result.kpis.total_sales),
            gross_profit_usd: Math.round(result.kpis.gross_profit),
            npat_usd: Math.round(pnl.net_profit_after_tax_usd),
            npat_margin_pct: (pnl.npat_margin_pct * 100).toFixed(1) + '%',
            irr_annual:
              result.kpis.irr_annual != null
                ? (result.kpis.irr_annual * 100).toFixed(1) + '%'
                : null,
            moic: result.kpis.moic.toFixed(2) + 'x',
            peak_debt_usd: Math.round(result.kpis.peak_debt),
            total_interest_usd: Math.round(result.kpis.total_interest),
          },
        }),
        is_write: false,
      };
    }

    case 'get_dashboard_kpis': {
      const { projects } = await findManyProjects({ limit: 100 });
      // T130 (V7 Rule 1): the agent's portfolio numbers use the same resolved
      // capital position as Home — the assistant may never quote a figure the
      // dashboard wouldn't show.
      const { globals } = await getActiveGlobalsWithCapital();
      const portfolio = aggregatePortfolio(projects, globals, BASELINE_SCENARIO);
      const k = portfolio.kpis;
      return {
        content: JSON.stringify({
          active_projects: k.active_project_count,
          total_pipeline_revenue_usd: Math.round(
            projects.reduce((s, p) => {
              const r = runProject(p, globals, BASELINE_SCENARIO);
              return s + r.kpis.total_sales;
            }, 0)
          ),
          peak_equity_usd: Math.round(k.peak_equity_required),
          max_debt_usd: Math.round(k.max_debt_outstanding),
          total_equity_called_usd: Math.round(k.total_equity_called),
        }),
        is_write: false,
      };
    }

    case 'search_actuals': {
      const key = String(args.project_key ?? '');
      const uuid = await findCurrentProjectUuidByKey(key);
      if (!uuid) return { content: `Project "${key}" not found.`, is_write: false };
      const { byCategory, totalCents } = await listActualsByCategory(uuid);
      return {
        content: JSON.stringify({
          project_key: key,
          total_usd: (totalCents / 100).toFixed(2),
          by_category: byCategory.map((c) => ({
            category: c.category,
            total_usd: (c.totalCents / 100).toFixed(2),
            entry_count: c.entries.length,
          })),
        }),
        is_write: false,
      };
    }

    // ── AJ-v3 — attachments (READ, owner-scoped) ──────────────────────────

    case 'read_attachment': {
      const id = String(args.attachment_id ?? '');
      const att = await findAttachmentForUser(id, user.id);
      if (!att) {
        return {
          content: `Attachment "${id}" not found (attachments are private to the uploader).`,
          is_write: false,
        };
      }
      const sheetName = args.sheet ? String(args.sheet) : undefined;
      const sheet = sheetName
        ? (att.sheets.find((s) => s.name === sheetName) ?? null)
        : (att.sheets[0] ?? null);
      if (!sheet) {
        return {
          content: JSON.stringify({
            error: `Sheet "${sheetName}" not found`,
            available_sheets: att.sheetNames,
          }),
          is_write: false,
        };
      }
      const offset = Math.max(0, Math.floor(Number(args.offset ?? 0)) || 0);
      const limit = Math.min(Math.max(1, Math.floor(Number(args.limit ?? 80)) || 80), 200);
      return {
        content: JSON.stringify({
          file_name: att.fileName,
          sheet: sheet.name,
          available_sheets: att.sheetNames,
          total_rows: sheet.rows.length,
          header: sheet.rows[0] ?? [],
          offset,
          rows: sheet.rows.slice(offset === 0 ? 1 : offset, (offset === 0 ? 1 : offset) + limit),
          note: offset === 0 ? 'Row 0 is returned as `header`; `rows` starts at row 1.' : undefined,
        }),
        is_write: false,
      };
    }

    // ── V7 T143 — meetings + opportunities (READ) ─────────────────────────

    case 'list_meetings': {
      const meetings = await listMeetings({ limit: 25 });
      return {
        content: JSON.stringify({
          meetings: meetings.map((m) => ({
            id: m.id,
            title: m.title,
            held_at: m.heldAt,
            participant_count: m.participants.length,
            has_transcript: !!m.transcriptMd,
          })),
          count: meetings.length,
        }),
        is_write: false,
      };
    }

    case 'get_meeting': {
      const id = String(args.meeting_id ?? '');
      const meeting = await findMeetingById(id);
      if (!meeting) return { content: `Meeting "${id}" not found.`, is_write: false };
      // Transcripts can be huge — chunk so a step result stays evidence-sized.
      const CHUNK = 12_000;
      const transcript = meeting.transcriptMd ?? '';
      const chunkCount = Math.max(1, Math.ceil(transcript.length / CHUNK));
      const chunkNum = Math.min(Math.max(1, Number(args.chunk ?? 1)), chunkCount);
      const slice = transcript.slice((chunkNum - 1) * CHUNK, chunkNum * CHUNK);
      return {
        content: JSON.stringify({
          id: meeting.id,
          title: meeting.title,
          held_at: meeting.heldAt,
          participants: meeting.participants,
          summary_md: meeting.summaryMd,
          transcript_chunk: slice || null,
          chunk: chunkNum,
          chunk_count: chunkCount,
        }),
        is_write: false,
      };
    }

    case 'list_opportunities': {
      const opportunities = await listOpportunities();
      return {
        content: JSON.stringify({
          opportunities: opportunities.map((o) => ({
            id: o.id,
            name: o.name,
            market: o.market,
            status: o.status,
            owner: o.ownerName,
            cash_needed_usd: o.cashNeededUsd,
            timeline_months: o.timelineMonths,
            expected_profit_usd: o.expectedProfitUsd,
            expected_margin_pct: o.expectedMarginPct,
            next_step: o.nextStep,
          })),
          count: opportunities.length,
        }),
        is_write: false,
      };
    }

    case 'get_opportunity': {
      const id = String(args.opportunity_id ?? '');
      const opp = await findOpportunityById(id);
      if (!opp) return { content: `Opportunity "${id}" not found.`, is_write: false };
      return {
        content: JSON.stringify({
          id: opp.id,
          name: opp.name,
          market: opp.market,
          status: opp.status,
          owner: opp.ownerName,
          cash_needed_usd: opp.cashNeededUsd,
          timeline_months: opp.timelineMonths,
          expected_profit_usd: opp.expectedProfitUsd,
          expected_margin_pct: opp.expectedMarginPct,
          next_step: opp.nextStep,
          notes: opp.notes,
          source: opp.source,
          research: opp.research,
          promoted_project_id: opp.promotedProjectId,
        }),
        is_write: false,
      };
    }

    case 'research_comps': {
      // V7 T134 — parked with the pricing surface; a stale/planned call while
      // the flag is off returns a clear error instead of spending an LLM call.
      if (!flagEnabled('pricing')) {
        return {
          content: JSON.stringify({
            error:
              'The pricing surface is parked (V7). Enable the "pricing" feature flag to use comp research.',
          }),
          is_write: false,
        };
      }
      // V6.1.5-001 — live Sonar comp research (researchComps branches on
      // PRICING_LLM_PROVIDER; perplexity is live in prod). The apiKey is only
      // used by the dormant Anthropic path; the Sonar path reads its own key.
      const research = await researchComps(
        {
          address: String(args.address ?? ''),
          subCutLabel: String(args.sub_cut_label ?? ''),
          agSqft: Number(args.ag_sqft) || 0,
          isNc: args.is_nc !== undefined ? Boolean(args.is_nc) : true,
          compWindowMonths:
            args.comp_window_months != null ? Number(args.comp_window_months) : undefined,
        },
        process.env.ANTHROPIC_API_KEY ?? ''
      );
      return {
        content: JSON.stringify({
          sub_cut: research.subCutDefinition ?? String(args.sub_cut_label ?? ''),
          data_gap_severity: research.dataGapSeverity ?? (research.dataGap ? 'red' : 'none'),
          confidence: research.confidence,
          used_web_search: research.usedWebSearch,
          comps: research.comps.slice(0, 25).map((c) => ({
            address: c.address,
            status: c.status,
            price_usd: c.salePriceUsd,
            ag_sqft: c.agSqft,
            psf: c.psf,
            closing_date: c.closingDate,
            waterfront: c.waterfrontType,
            new_construction: c.isNewConstruction,
            source_url: c.sourceUrl,
          })),
          sources: (research.citations ?? []).map((x) => x.url),
          narrative: research.narrativeSummary,
          error: research.error ?? null,
        }),
        is_write: false,
      };
    }

    // ── WRITE tools ───────────────────────────────────────────────────────────

    case 'create_actuals_entry': {
      const key = String(args.project_key ?? '');
      const uuid = await findCurrentProjectUuidByKey(key);
      if (!uuid) throw new Error(`Project "${key}" not found`);

      const amountCents = Math.round((Number(args.amount_usd) || 0) * 100);
      const input: CreateActualsEntryInput = {
        projectId: uuid,
        entryDate: String(args.entry_date ?? ''),
        category: (args.category as CreateActualsEntryInput['category']) ?? 'other',
        lineItem: String(args.line_item ?? ''),
        amountCents,
        vendor: args.vendor ? String(args.vendor) : null,
        invoiceRef: args.invoice_ref ? String(args.invoice_ref) : null,
        notes: null,
        source: 'api',
      };

      const result = await createActualsEntry(input, user);
      const orgId = await resolveOrgId();
      const auditId = await recordMutation({
        orgId,
        userId: user.id,
        route: 'service:create_actuals_entry',
        method: 'POST',
        statusCode: 201,
        source: 'ask_juno_agent',
        after: {
          actualsId: result.id,
          amountCents,
          category: input.category,
          lineItem: input.lineItem,
        },
      });

      return {
        content: JSON.stringify({ success: true, id: result.id, audit_log_id: auditId }),
        audit_log_id: auditId,
        is_write: true,
      };
    }

    case 'create_risk': {
      const key = String(args.project_key ?? '');
      const uuid = await findCurrentProjectUuidByKey(key);
      if (!uuid) throw new Error(`Project "${key}" not found`);

      const riskId = await insertRisk({
        projectId: uuid,
        risk: String(args.risk ?? '').slice(0, 500),
        severity: (args.severity as 'low' | 'medium' | 'high' | 'critical') ?? 'medium',
        mitigation: args.mitigation ? String(args.mitigation) : null,
        status: 'open',
        createdBy: user.id,
      });

      const orgId = await resolveOrgId();
      const auditId = await recordMutation({
        orgId,
        userId: user.id,
        route: 'service:create_risk',
        method: 'POST',
        statusCode: 201,
        source: 'ask_juno_agent',
        after: { riskId, projectId: uuid, risk: args.risk },
      });

      return {
        content: JSON.stringify({ success: true, id: riskId, audit_log_id: auditId }),
        audit_log_id: auditId,
        is_write: true,
      };
    }

    // ── AJ-v3 opportunity writes (confirm-gated by the route) ─────────────

    case 'create_opportunity': {
      const name = String(args.name ?? '').trim();
      if (!name) throw new Error('Opportunity name is required');
      const statusIn = String(args.status ?? 'researching');
      const status = ['researching', 'contacted', 'negotiating'].includes(statusIn)
        ? (statusIn as 'researching' | 'contacted' | 'negotiating')
        : 'researching';
      const numOrNull = (v: unknown) =>
        v === undefined || v === null || !Number.isFinite(Number(v)) ? null : Number(v);
      const view = await insertOpportunity({
        name: name.slice(0, 160),
        market: args.market ? String(args.market).slice(0, 80) : null,
        status,
        ownerName: args.owner_name ? String(args.owner_name).slice(0, 120) : null,
        cashNeededUsd: numOrNull(args.cash_needed_usd),
        timelineMonths:
          numOrNull(args.timeline_months) !== null
            ? Math.round(numOrNull(args.timeline_months)!)
            : null,
        expectedProfitUsd: numOrNull(args.expected_profit_usd),
        expectedMarginPct: numOrNull(args.expected_margin_pct),
        nextStep: args.next_step ? String(args.next_step).slice(0, 500) : null,
        notes: args.notes ? String(args.notes).slice(0, 4000) : null,
        source: 'Ask Juno',
      });
      const orgId = await resolveOrgId();
      const auditId = await recordMutation({
        orgId,
        userId: user.id,
        route: 'service:create_opportunity:ask_juno',
        method: 'POST',
        statusCode: 201,
        source: 'ask_juno_agent',
        after: { opportunityId: view.id, name: view.name },
      });
      return {
        content: JSON.stringify({
          success: true,
          id: view.id,
          name: view.name,
          audit_log_id: auditId,
        }),
        audit_log_id: auditId,
        is_write: true,
      };
    }

    case 'update_opportunity': {
      const id = String(args.opportunity_id ?? '');
      const existing = await findOpportunityById(id);
      if (!existing) throw new Error(`Opportunity "${id}" not found`);
      if (existing.status === 'promoted') {
        throw new Error('Opportunity is promoted — its record is read-only.');
      }
      const numOrU = (v: unknown) =>
        v === undefined ? undefined : v === null || !Number.isFinite(Number(v)) ? null : Number(v);
      const statusIn = args.status === undefined ? undefined : String(args.status);
      if (
        statusIn !== undefined &&
        !['researching', 'contacted', 'negotiating', 'passed'].includes(statusIn)
      ) {
        throw new Error(`Invalid status "${statusIn}" (promotion happens via the Pipeline UI).`);
      }
      const view = await patchOpportunity(id, {
        ...(statusIn !== undefined && {
          status: statusIn as 'researching' | 'contacted' | 'negotiating' | 'passed',
        }),
        ...(args.cash_needed_usd !== undefined && { cashNeededUsd: numOrU(args.cash_needed_usd) }),
        ...(args.timeline_months !== undefined && {
          timelineMonths:
            numOrU(args.timeline_months) === null
              ? null
              : Math.round(numOrU(args.timeline_months)!),
        }),
        ...(args.expected_profit_usd !== undefined && {
          expectedProfitUsd: numOrU(args.expected_profit_usd),
        }),
        ...(args.expected_margin_pct !== undefined && {
          expectedMarginPct: numOrU(args.expected_margin_pct),
        }),
        ...(args.next_step !== undefined && {
          nextStep: args.next_step === null ? null : String(args.next_step).slice(0, 500),
        }),
        ...(args.next_step_owner !== undefined && {
          nextStepOwner:
            args.next_step_owner === null ? null : String(args.next_step_owner).slice(0, 120),
        }),
        ...(args.notes !== undefined && {
          notes: args.notes === null ? null : String(args.notes).slice(0, 4000),
        }),
      });
      const orgId = await resolveOrgId();
      const auditId = await recordMutation({
        orgId,
        userId: user.id,
        route: `service:update_opportunity:ask_juno:${id}`,
        method: 'PATCH',
        statusCode: 200,
        source: 'ask_juno_agent',
        before: { status: existing.status },
        after: {
          opportunityId: id,
          fields: Object.keys(args).filter((k) => k !== 'opportunity_id'),
        },
      });
      return {
        content: JSON.stringify({
          success: true,
          id: view.id,
          name: view.name,
          audit_log_id: auditId,
        }),
        audit_log_id: auditId,
        is_write: true,
      };
    }

    case 'create_project':
    case 'update_project':
    case 'archive_project': {
      // These always go through the confirmation flow — they should never
      // reach executeTool directly. If they do, it means the caller bypassed
      // the risk classifier (which should have rejected auto-execute).
      throw new Error(
        `Tool '${toolName}' must be executed via user confirmation, not auto-execute`
      );
    }

    case 'ask_user': {
      // Protocol tool — the ROUTE intercepts ask_user and returns the
      // question to the pane; execution here means the interception was
      // bypassed.
      throw new Error(`Tool 'ask_user' is handled by the conversation loop, not the executor`);
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ── AJ-v3 shared tool-name sets (the route + runner derive from these) ───────

/** Tools that read only — always safe to execute inline. */
export const READ_ONLY_TOOL_NAMES: readonly string[] = [
  'list_projects',
  'get_project_summary',
  'get_dashboard_kpis',
  'search_actuals',
  'research_comps',
  'list_meetings',
  'get_meeting',
  'list_opportunities',
  'get_opportunity',
  'read_attachment',
];

/** Interaction-protocol tools the loop intercepts (never executed). */
export const PROTOCOL_TOOL_NAMES: readonly string[] = ['ask_user'];

/**
 * Check whether the target project has a locked approval snapshot.
 * Used by the risk classifier for write tools that take a project_key.
 */
export async function projectHasLockedSnapshot(projectKey: string): Promise<boolean> {
  const uuid = await findCurrentProjectUuidByKey(projectKey);
  if (!uuid) return false;
  const snap = await findLatestLockedSnapshot(uuid);
  return snap !== null;
}
