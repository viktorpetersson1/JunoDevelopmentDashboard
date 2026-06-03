import { describe, expect, it } from 'vitest';
import { classifyRisk } from '../risk-classifier';

describe('classifyRisk', () => {
  // ── Viewer role always blocks ─────────────────────────────────────────────
  it('viewer role: always returns auto_execute=false', () => {
    const r = classifyRisk('create_actuals_entry', { amount_usd: 100 }, 'viewer');
    expect(r.auto_execute).toBe(false);
    expect(r.reason).toMatch(/viewer/i);
  });

  it('viewer_basic role: always returns auto_execute=false', () => {
    const r = classifyRisk('create_actuals_entry', { amount_usd: 100 }, 'viewer_basic');
    expect(r.auto_execute).toBe(false);
  });

  // ── Non-eligible tools never auto-execute ─────────────────────────────────
  it('create_project: never auto-executes', () => {
    const r = classifyRisk('create_project', {}, 'editor');
    expect(r.auto_execute).toBe(false);
  });

  it('update_project: never auto-executes', () => {
    const r = classifyRisk('update_project', { project_key: 'p2' }, 'editor');
    expect(r.auto_execute).toBe(false);
  });

  it('unknown tool: never auto-executes', () => {
    const r = classifyRisk('delete_everything', {}, 'super_admin');
    expect(r.auto_execute).toBe(false);
  });

  // ── create_actuals_entry: the core low-risk-eligible tool ─────────────────
  it('create_actuals_entry: auto-executes at exactly $10,000', () => {
    const r = classifyRisk('create_actuals_entry', { amount_usd: 10_000 }, 'editor');
    expect(r.auto_execute).toBe(true);
  });

  it('create_actuals_entry: auto-executes below $10,000', () => {
    const r = classifyRisk('create_actuals_entry', { amount_usd: 5_000 }, 'editor');
    expect(r.auto_execute).toBe(true);
  });

  it('create_actuals_entry: blocks at $10,001', () => {
    const r = classifyRisk('create_actuals_entry', { amount_usd: 10_001 }, 'editor');
    expect(r.auto_execute).toBe(false);
    expect(r.reason).toMatch(/10,000/);
  });

  it('create_actuals_entry: blocks at $50,000', () => {
    const r = classifyRisk('create_actuals_entry', { amount_usd: 50_000 }, 'editor');
    expect(r.auto_execute).toBe(false);
  });

  it('create_actuals_entry: auto-executes with amount_cents <= $10k equivalent', () => {
    const r = classifyRisk('create_actuals_entry', { amount_cents: 500_00 }, 'editor'); // $500
    expect(r.auto_execute).toBe(true);
  });

  it('create_actuals_entry: blocks with amount_cents > $10k equivalent', () => {
    const r = classifyRisk('create_actuals_entry', { amount_cents: 1_500_000 }, 'editor'); // $15k
    expect(r.auto_execute).toBe(false);
  });

  it('create_actuals_entry: no amount field → treated as $0 → auto-executes', () => {
    const r = classifyRisk('create_actuals_entry', { category: 'other', line_item: 'misc' }, 'editor');
    expect(r.auto_execute).toBe(true);
  });

  // ── Batch guard ───────────────────────────────────────────────────────────
  it('create_actuals_entry: blocks when entries array has >=5 items', () => {
    const r = classifyRisk('create_actuals_entry', {
      amount_usd: 100,
      entries: [1, 2, 3, 4, 5],
    }, 'editor');
    expect(r.auto_execute).toBe(false);
    expect(r.reason).toMatch(/batch/i);
  });

  it('create_actuals_entry: allows entries array with 4 items', () => {
    const r = classifyRisk('create_actuals_entry', {
      amount_usd: 100,
      entries: [1, 2, 3, 4],
    }, 'editor');
    expect(r.auto_execute).toBe(true);
  });

  // ── Locked snapshot guard ─────────────────────────────────────────────────
  it('create_actuals_entry: blocks when project has a locked snapshot', () => {
    const r = classifyRisk('create_actuals_entry', { amount_usd: 100 }, 'editor', true);
    expect(r.auto_execute).toBe(false);
    expect(r.reason).toMatch(/locked/i);
  });

  it('create_actuals_entry: allows when no locked snapshot', () => {
    const r = classifyRisk('create_actuals_entry', { amount_usd: 100 }, 'editor', false);
    expect(r.auto_execute).toBe(true);
  });

  // ── create_risk ───────────────────────────────────────────────────────────
  it('create_risk: auto-executes (no monetary impact)', () => {
    const r = classifyRisk('create_risk', { risk: 'Permit delay', severity: 'medium' }, 'editor');
    expect(r.auto_execute).toBe(true);
  });

  it('create_risk: blocks for viewer', () => {
    const r = classifyRisk('create_risk', { risk: 'test' }, 'viewer');
    expect(r.auto_execute).toBe(false);
  });

  // ── super_admin role ──────────────────────────────────────────────────────
  it('super_admin can auto-execute low-risk actuals entry', () => {
    const r = classifyRisk('create_actuals_entry', { amount_usd: 500 }, 'super_admin');
    expect(r.auto_execute).toBe(true);
  });

  it('super_admin still blocked above $10k threshold', () => {
    const r = classifyRisk('create_actuals_entry', { amount_usd: 25_000 }, 'super_admin');
    expect(r.auto_execute).toBe(false);
  });
});
