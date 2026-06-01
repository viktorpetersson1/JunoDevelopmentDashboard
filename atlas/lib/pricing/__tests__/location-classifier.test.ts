import { describe, expect, it } from 'vitest';
import { parseLocationClassification } from '../location-classifier';

const META = { usedWebSearch: true, geocodedCity: 'Sag Harbor' };

describe('parseLocationClassification', () => {
  it('parses a well-formed classification and passes through metadata', () => {
    const raw = JSON.stringify({
      waterfront_type: 'bayfront',
      view_premium: 'full',
      town_proximity: 'short_drive',
      lot_size_acres: 0.92,
      year_built: 2007,
      confidence: 'high',
      reasoning: 'Abuts Sag Harbor Bay; ~1.5mi to village.',
    });
    const c = parseLocationClassification(raw, META);
    expect(c).toMatchObject({
      waterfrontType: 'bayfront',
      viewPremium: 'full',
      townProximity: 'short_drive',
      lotSizeAcres: 0.92,
      yearBuilt: 2007,
      confidence: 'high',
      usedWebSearch: true,
      geocodedCity: 'Sag Harbor',
    });
    expect(c.error).toBeUndefined();
  });

  it('coerces invalid enums and out-of-range numbers to null', () => {
    const raw = JSON.stringify({
      waterfront_type: 'oceanfront', // invalid
      view_premium: 'spectacular', // invalid
      town_proximity: 'downtown', // invalid
      lot_size_acres: -3, // invalid (<0)
      year_built: 1500, // invalid (<1800)
      confidence: 'mystery', // unknown → low
      reasoning: 'unsure',
    });
    const c = parseLocationClassification(raw, META);
    expect(c.waterfrontType).toBeNull();
    expect(c.viewPremium).toBeNull();
    expect(c.townProximity).toBeNull();
    expect(c.lotSizeAcres).toBeNull();
    expect(c.yearBuilt).toBeNull();
    expect(c.confidence).toBe('low');
  });

  it('handles a fenced JSON block and partial fields', () => {
    const raw =
      '```json\n{ "waterfront_type": "inland", "confidence": "low", "reasoning": "No water frontage." }\n```';
    const c = parseLocationClassification(raw, { usedWebSearch: false, geocodedCity: null });
    expect(c.waterfrontType).toBe('inland');
    expect(c.viewPremium).toBeNull();
    expect(c.confidence).toBe('low');
    expect(c.usedWebSearch).toBe(false);
  });

  it('returns an all-null result with an error on unparseable text', () => {
    const c = parseLocationClassification('the model refused to answer', META);
    expect(c.waterfrontType).toBeNull();
    expect(c.confidence).toBe('low');
    expect(c.error).toBeTruthy();
  });
});
