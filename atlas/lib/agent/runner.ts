/**
 * Ask Juno v2 — runner (Phase 1, read-only).
 *
 * Loop: plan (one model call → ordered READ-tool steps + a final synthesize) →
 * execute each step → synthesize the answer. The pure decision bits
 * (`decideNextAction`, `parsePlan`) are unit-tested; the IO bits call the model
 * + the v1 READ tools. The advance route owns the SSE stream, lease + heartbeat,
 * and wall-clock batching, and drives this via `decideNextAction` + `executeStep`.
 *
 * Phase 1 tools are the 5 existing READ tools — no writes, no analysis tools.
 */
import type { User } from '@supabase/supabase-js';
import { TOOL_DEFINITIONS, executeTool, type ToolDefinition } from '@/lib/ask-juno/tools';
import { callAgentModel } from './llm';
import { estimateCostUsd, maxTokensFor, type AgentStepType } from './config';
import {
  setPlanAndSteps,
  type AgentRunView,
  type AgentStepView,
  type NewStep,
} from '@/lib/repos/agent-runs';

/** Phase 1 surface: the 5 existing READ tools only. */
export const READ_TOOL_NAMES = [
  'list_projects',
  'get_project_summary',
  'get_dashboard_kpis',
  'search_actuals',
  'research_comps',
] as const;

export function readToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS.filter((t) => (READ_TOOL_NAMES as readonly string[]).includes(t.name));
}

// ── SSE event protocol ────────────────────────────────────────────────────────

export type AgentEvent =
  | { type: 'run'; status: string; currentStep: number; costSpent: number; goal: string }
  | { type: 'plan'; summary: string; steps: Array<{ idx: number; tool: string | null; type: string; why?: string }> }
  | { type: 'step_start'; idx: number; tool: string | null; stepType: string }
  | { type: 'step_done'; idx: number; summary: string; costSpent: number }
  | { type: 'step_failed'; idx: number; error: string }
  | { type: 'paused'; reason: string; currentStep: number; costSpent: number }
  | { type: 'done'; answer: string; costSpent: number }
  | { type: 'error'; message: string }
  | { type: 'locked' }
  | { type: 'yield' };

export type Emit = (e: AgentEvent) => void;

// ── Pure: the next action ─────────────────────────────────────────────────────

export type NextAction =
  | { action: 'plan' }
  | { action: 'execute' }
  | { action: 'complete' }
  | { action: 'pause'; reason: 'step_ceiling' | 'step_hard_cap' | 'cost_ceiling' | 'cost_hard_cap' };

export function decideNextAction(input: {
  run: Pick<
    AgentRunView,
    'currentStep' | 'stepCeiling' | 'stepHardCap' | 'costCeilingUsd' | 'costHardCapUsd' | 'continueAck'
  >;
  hasPlan: boolean;
  pendingSteps: number;
  spentUsd: number;
  nextStepEstUsd: number;
}): NextAction {
  const { run, hasPlan, pendingSteps, spentUsd, nextStepEstUsd } = input;
  const projected = spentUsd + nextStepEstUsd;

  if (!hasPlan) {
    if (projected > run.costHardCapUsd) return { action: 'pause', reason: 'cost_hard_cap' };
    return { action: 'plan' };
  }
  if (pendingSteps === 0) return { action: 'complete' };

  // Hard caps always stop (not clearable by "continue").
  if (run.currentStep >= run.stepHardCap) return { action: 'pause', reason: 'step_hard_cap' };
  if (projected > run.costHardCapUsd) return { action: 'pause', reason: 'cost_hard_cap' };

  // Soft ceilings pause + ask, unless the user already pressed "continue".
  if (!run.continueAck) {
    if (run.currentStep >= run.stepCeiling) return { action: 'pause', reason: 'step_ceiling' };
    if (projected > run.costCeilingUsd) return { action: 'pause', reason: 'cost_ceiling' };
  }
  return { action: 'execute' };
}

/** Estimate the agent-model cost of the NEXT action (tool steps cost 0 — no agent call). */
export function estimateNextCost(model: string, action: 'plan' | 'synthesize' | 'tool'): number {
  if (action === 'tool') return 0;
  const site = action === 'plan' ? 'plan' : 'synthesize';
  // ~rough input estimate; the true-up after the call corrects the ledger.
  return estimateCostUsd(model, 2_000, maxTokensFor(site));
}

// ── Pure: parse the model's plan JSON into steps ──────────────────────────────

export interface ParsedPlan {
  summary: string;
  steps: NewStep[];
}

const MAX_TOOL_STEPS = 8;

export function parsePlan(runId: string, raw: string): ParsedPlan {
  let obj: { plan?: unknown; steps?: unknown } = {};
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = fenced?.[1] ?? raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;
    obj = JSON.parse(jsonStr) as typeof obj;
  } catch {
    obj = {};
  }
  const summary = typeof obj.plan === 'string' ? obj.plan : 'Plan unavailable; synthesizing directly.';
  const rawSteps = Array.isArray(obj.steps) ? obj.steps : [];
  const allow = new Set<string>(READ_TOOL_NAMES as readonly string[]);

  const toolSteps: NewStep[] = [];
  for (const s of rawSteps) {
    if (toolSteps.length >= MAX_TOOL_STEPS) break;
    if (!s || typeof s !== 'object') continue;
    const tool = String((s as { tool?: unknown }).tool ?? '');
    if (!allow.has(tool)) continue;
    const args = (s as { args?: unknown }).args;
    const idx = toolSteps.length;
    toolSteps.push({
      idx,
      type: (tool === 'research_comps' ? 'research' : 'read') as AgentStepType,
      tool,
      args: args && typeof args === 'object' ? args : {},
      idempotencyKey: `${runId}:${idx}:${tool}`,
    });
  }

  // Always end with a synthesize step (no tool).
  toolSteps.push({
    idx: toolSteps.length,
    type: 'synthesize',
    tool: null,
    args: {},
    idempotencyKey: `${runId}:${toolSteps.length}:synthesize`,
  });

  return { summary, steps: toolSteps };
}

// ── Prompts ───────────────────────────────────────────────────────────────────

function toolCatalog(): string {
  return readToolDefinitions()
    .map((t) => {
      const props = Object.keys(t.input_schema.properties ?? {}).join(', ') || '(none)';
      return `- ${t.name}(${props}) — ${t.description}`;
    })
    .join('\n');
}

const PLAN_SYSTEM = `You are Ask Juno, an analyst for the Juno Atlas real-estate development platform. You are in the PLANNING phase of a multi-step run. Pick the minimal ordered set of READ tools needed to answer the user's goal, then stop — the system executes them and you synthesize the answer afterwards.

Available READ tools:
{{CATALOG}}

Rules:
- Output ONLY a JSON object: {"plan": "<one sentence approach>", "steps": [{"tool": "<name>", "args": {...}, "why": "<short>"}]}.
- Use only the tools above. If you need a project key you don't have, plan list_projects first.
- Keep it to the fewest steps that answer the goal (max 8). Do NOT invent tools or write data — this is read-only.`;

const SYNTH_SYSTEM = `You are Ask Juno, an analyst for the Juno Atlas real-estate development platform. The system has gathered tool results for the user's goal. Write the final answer: direct, specific, grounded ONLY in the tool results below. Cite concrete numbers from the results; never invent figures. If the results are insufficient, say what's missing. Be concise.`;

// ── IO: plan + execute ────────────────────────────────────────────────────────

/** Make the planning call and persist the plan + pending steps. Returns the steps. */
export async function ensurePlan(run: AgentRunView, apiKey: string, emit: Emit): Promise<ParsedPlan> {
  const res = await callAgentModel({
    runId: run.id,
    stepId: null,
    callSite: 'plan',
    runModel: run.model,
    apiKey,
    system: PLAN_SYSTEM.replace('{{CATALOG}}', toolCatalog()),
    messages: [{ role: 'user', content: `Goal: ${run.goal}` }],
  });
  const parsed = parsePlan(run.id, res.text);
  await setPlanAndSteps(run.id, { summary: parsed.summary }, parsed.steps);
  emit({
    type: 'plan',
    summary: parsed.summary,
    steps: parsed.steps.map((s) => ({ idx: s.idx, tool: s.tool, type: s.type })),
  });
  return parsed;
}

/** Execute one step: a READ tool, or the final synthesis. Returns a result object + a summary. */
export async function executeStep(args: {
  run: AgentRunView;
  step: AgentStepView;
  priorResults: Array<{ tool: string | null; content: string }>;
  user: User;
  apiKey: string;
}): Promise<{ result: unknown; summary: string }> {
  const { run, step, priorResults, user, apiKey } = args;

  if (step.type === 'synthesize') {
    const evidence = priorResults
      .map((r, i) => `[${i + 1}] ${r.tool ?? 'result'}:\n${r.content}`)
      .join('\n\n')
      .slice(0, 24_000);
    const res = await callAgentModel({
      runId: run.id,
      stepId: step.id,
      callSite: 'synthesize',
      runModel: run.model,
      apiKey,
      system: SYNTH_SYSTEM,
      messages: [
        { role: 'user', content: `Goal: ${run.goal}\n\nTool results:\n${evidence || '(none)'}\n\nWrite the final answer.` },
      ],
    });
    return { result: { answer: res.text }, summary: res.text.slice(0, 200) };
  }

  // Tool step (read/research): deterministic execution via the v1 executor.
  if (!step.tool) return { result: { error: 'missing tool' }, summary: 'missing tool' };
  const tr = await executeTool(step.tool, (step.args as Record<string, unknown>) ?? {}, user);
  return { result: { content: tr.content }, summary: `${step.tool} → ${tr.content.slice(0, 120)}` };
}
