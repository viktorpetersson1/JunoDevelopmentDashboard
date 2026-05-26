import { describe, expect, it } from 'vitest';
import { sanitizeRedirect, SAFE_REDIRECT_FALLBACK } from '../safe-redirect';

/**
 * T085.2 — open-redirect allowlist invariants.
 *
 * Every case below maps to a real attack-surface or a benign path the
 * UX needs to preserve. A new failing case here is a real bug.
 */
describe('sanitizeRedirect', () => {
  it('blocks an absolute https URL to another origin', () => {
    expect(sanitizeRedirect('https://evil.com')).toBe('/dashboard');
  });

  it('blocks a protocol-relative URL to another origin', () => {
    expect(sanitizeRedirect('//evil.com')).toBe('/dashboard');
  });

  it('blocks a javascript: URL', () => {
    expect(sanitizeRedirect('javascript:alert(1)')).toBe('/dashboard');
  });

  it('allows an allowlisted top-level path with a child segment', () => {
    expect(sanitizeRedirect('/projects/abc')).toBe('/projects/abc');
  });

  it('allows an allowlisted path with query + hash preserved', () => {
    expect(sanitizeRedirect('/projects/abc?tab=capital')).toBe('/projects/abc?tab=capital');
    expect(sanitizeRedirect('/dashboard#kpi')).toBe('/dashboard#kpi');
  });

  it('returns fallback on undefined / null / empty', () => {
    expect(sanitizeRedirect(undefined)).toBe('/dashboard');
    expect(sanitizeRedirect(null)).toBe('/dashboard');
    expect(sanitizeRedirect('')).toBe('/dashboard');
  });

  it('blocks parent-traversal segments (defense in depth)', () => {
    expect(sanitizeRedirect('/../etc/passwd')).toBe('/dashboard');
    expect(sanitizeRedirect('/projects/../etc/passwd')).toBe('/dashboard');
    expect(sanitizeRedirect('/dashboard/..')).toBe('/dashboard'); // fallback, not 'allowed'
  });

  it('blocks backslash-escape tricks some browsers normalize', () => {
    expect(sanitizeRedirect('/\\evil.com')).toBe('/dashboard');
    expect(sanitizeRedirect('/projects\\evil')).toBe('/dashboard');
  });

  it('exports the canonical fallback as a constant for callers', () => {
    expect(SAFE_REDIRECT_FALLBACK).toBe('/dashboard');
  });

  it('paths not in the allowlist (e.g. /admin) get fallback', () => {
    expect(sanitizeRedirect('/admin')).toBe('/dashboard');
    expect(sanitizeRedirect('/internal/secrets')).toBe('/dashboard');
  });

  it('exact-match a top-level allowed path works', () => {
    expect(sanitizeRedirect('/dashboard')).toBe('/dashboard');
    expect(sanitizeRedirect('/pricing')).toBe('/pricing');
    expect(sanitizeRedirect('/settings')).toBe('/settings');
  });
});
