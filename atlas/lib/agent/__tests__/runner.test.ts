/** Ask Juno v2 — runner pure logic: budget/ceiling decisions + plan parsing. */
import { describe, it, expect } from 'vitest';
import { decideNextAction, parsePlan } from '@/lib/agent/runner';

const run = (over: Partial<Parameters<typeof decideNextAction>[0]['run']> = {}) => ({
  currentStep: 0,
  stepCeiling: 20,
  stepHardCap: 40,
  costCeilingUsd: 0.5,
  costHardCapUsd: 2.0,
  continueAck: false,
  ...over,
});

describe('decideNextAction', () => {
  it('plans first when there is no plan', () => {
    expect(decideNextAction({ run: run(), hasPlan: false, pendingSteps: 0, spentUsd: 0, nextStepEstUsd: 0.01 }).action).toBe('plan');
  });

  it('completes when the plan is done', () => {
    expect(decideNextAction({ run: run(), hasPlan: true, pendingSteps: 0, spentUsd: 0.1, nextStepEstUsd: 0 }).action).toBe('complete');
  });

  it('executes under all ceilings', () => {
    expect(decideNextAction({ run: run({ currentStep: 3 }), hasPlan: true, pendingSteps: 2, spentUsd: 0.1, nextStepEstUsd: 0.02 }).action).toBe('execute');
  });

  it('SOFT step ceiling pauses; continue clears it', () => {
    const at = { run: run({ currentStep: 20 }), hasPlan: true, pendingSteps: 2, spentUsd: 0.1, nextStepEstUsd: 0.01 };
    expect(decideNextAction(at)).toEqual({ action: 'pause', reason: 'step_ceiling' });
    expect(decideNextAction({ ...at, run: run({ currentStep: 20, continueAck: true }) }).action).toBe('execute');
  });

  it('SOFT cost ceiling pauses; continue clears it', () => {
    const at = { run: run(), hasPlan: true, pendingSteps: 2, spentUsd: 0.49, nextStepEstUsd: 0.05 };
    expect(decideNextAction(at)).toEqual({ action: 'pause', reason: 'cost_ceiling' });
    expect(decideNextAction({ ...at, run: run({ continueAck: true }) }).action).toBe('execute');
  });

  it('HARD caps stop even with continue', () => {
    expect(
      decideNextAction({ run: run({ currentStep: 40, continueAck: true }), hasPlan: true, pendingSteps: 2, spentUsd: 0.1, nextStepEstUsd: 0.01 })
    ).toEqual({ action: 'pause', reason: 'step_hard_cap' });
    expect(
      decideNextAction({ run: run({ continueAck: true }), hasPlan: true, pendingSteps: 2, spentUsd: 1.99, nextStepEstUsd: 0.05 })
    ).toEqual({ action: 'pause', reason: 'cost_hard_cap' });
  });

  it('blocks even the plan call if it would breach the hard cost cap', () => {
    expect(
      decideNextAction({ run: run(), hasPlan: false, pendingSteps: 0, spentUsd: 1.99, nextStepEstUsd: 0.05 })
    ).toEqual({ action: 'pause', reason: 'cost_hard_cap' });
  });
});

describe('parsePlan', () => {
  it('keeps allowed READ tools, drops unknown, appends a synthesize step', () => {
    const raw = JSON.stringify({
      plan: 'Look at the portfolio then 84 SBR',
      steps: [
        { tool: 'get_dashboard_kpis', args: {} },
        { tool: 'delete_everything', args: {} }, // not allowed → dropped
        { tool: 'get_project_summary', args: { project_key: 'p2' } },
      ],
    });
    const p = parsePlan('run1', raw);
    expect(p.summary).toMatch(/portfolio/i);
    expect(p.steps.map((s) => s.tool)).toEqual(['get_dashboard_kpis', 'get_project_summary', null]);
    expect(p.steps.at(-1)!.type).toBe('synthesize');
    expect(p.steps[0]!.idempotencyKey).toBe('run1:0:get_dashboard_kpis');
  });

  it('handles non-JSON / empty by synthesizing directly', () => {
    const p = parsePlan('r', 'sorry I cannot');
    expect(p.steps).toHaveLength(1);
    expect(p.steps[0]!.type).toBe('synthesize');
  });

  it('parses a fenced ```json block and caps tool steps at 8', () => {
    const many = Array.from({ length: 12 }, () => ({ tool: 'list_projects', args: {} }));
    const p = parsePlan('r', '```json\n' + JSON.stringify({ plan: 'x', steps: many }) + '\n```');
    expect(p.steps.filter((s) => s.tool).length).toBe(8); // capped
    expect(p.steps.at(-1)!.type).toBe('synthesize');
  });
});
