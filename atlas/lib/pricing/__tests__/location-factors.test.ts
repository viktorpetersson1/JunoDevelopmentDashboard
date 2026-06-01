import { describe, expect, it } from 'vitest';
import {
  WATERFRONT_TYPES,
  VIEW_PREMIUM_TYPES,
  TOWN_PROXIMITY_TYPES,
  WATERFRONT_LABELS,
  VIEW_PREMIUM_LABELS,
  TOWN_PROXIMITY_LABELS,
  WATERFRONT_OPTIONS,
  coerceWaterfrontType,
  coerceViewPremium,
  coerceTownProximity,
  subjectLocationLines,
  hasAnyLocationFactor,
  LOCATION_PROMPT_GUIDANCE,
} from '../location-factors';

describe('location-factors taxonomy', () => {
  it('waterfront enum matches the atlas.comps CHECK constraint values', () => {
    // If this drifts, subject ↔ comp matching breaks. Keep in lockstep with
    // the DB CHECK + lib/db/schema/comps.ts CompWaterfrontType.
    expect([...WATERFRONT_TYPES]).toEqual(['sound_front_bluff', 'bayfront', 'inlet', 'inland']);
  });

  it('every enum value has a human label', () => {
    for (const v of WATERFRONT_TYPES) expect(WATERFRONT_LABELS[v]).toBeTruthy();
    for (const v of VIEW_PREMIUM_TYPES) expect(VIEW_PREMIUM_LABELS[v]).toBeTruthy();
    for (const v of TOWN_PROXIMITY_TYPES) expect(TOWN_PROXIMITY_LABELS[v]).toBeTruthy();
  });

  it('select options lead with an unset entry then all enum values', () => {
    expect(WATERFRONT_OPTIONS[0]).toEqual({ value: '', label: '— Unknown —' });
    expect(WATERFRONT_OPTIONS.length).toBe(WATERFRONT_TYPES.length + 1);
    expect(WATERFRONT_OPTIONS.slice(1).map((o) => o.value)).toEqual([...WATERFRONT_TYPES]);
  });

  it('coercers accept valid values and reject everything else', () => {
    expect(coerceWaterfrontType('bayfront')).toBe('bayfront');
    expect(coerceWaterfrontType('oceanfront')).toBeNull();
    expect(coerceWaterfrontType('')).toBeNull();
    expect(coerceWaterfrontType(null)).toBeNull();
    expect(coerceWaterfrontType(42)).toBeNull();

    expect(coerceViewPremium('full')).toBe('full');
    expect(coerceViewPremium('spectacular')).toBeNull();

    expect(coerceTownProximity('walkable')).toBe('walkable');
    expect(coerceTownProximity('downtown')).toBeNull();
  });

  it('subjectLocationLines emits only the factors that are set', () => {
    expect(subjectLocationLines({})).toBe('');
    expect(hasAnyLocationFactor({})).toBe(false);

    const lines = subjectLocationLines({
      waterfrontType: 'bayfront',
      lotSizeAcres: 1.25,
    });
    expect(lines).toContain('bayfront');
    expect(lines).toContain('1.25 acres');
    expect(lines).not.toContain('view'); // viewPremium not set → no line
    expect(hasAnyLocationFactor({ yearBuilt: 2024 })).toBe(true);
  });

  it('prompt guidance names the waterfront ladder so the model can apply it', () => {
    expect(LOCATION_PROMPT_GUIDANCE).toContain('bayfront');
    expect(LOCATION_PROMPT_GUIDANCE).toContain('inland');
    expect(LOCATION_PROMPT_GUIDANCE.toLowerCase()).toContain('median');
  });
});
