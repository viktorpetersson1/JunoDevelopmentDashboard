import { describe, it, expect } from 'vitest';
import { getCommitmentTier, hasRealAddress } from '../commitment-tier';

describe('hasRealAddress', () => {
  it('accepts a real address', () => {
    expect(hasRealAddress('84 Sunset Beach Road, Sag Harbor')).toBe(true);
  });
  it('rejects null / empty / whitespace / TBC', () => {
    expect(hasRealAddress(null)).toBe(false);
    expect(hasRealAddress(undefined)).toBe(false);
    expect(hasRealAddress('')).toBe(false);
    expect(hasRealAddress('   ')).toBe(false);
    expect(hasRealAddress('TBC')).toBe(false);
    expect(hasRealAddress(' tbc ')).toBe(false);
  });
});

describe('getCommitmentTier', () => {
  it('is committed with a real address past sourcing', () => {
    expect(getCommitmentTier({ address: '84 SBR', stage: 'pre_construction' })).toBe('committed');
    expect(getCommitmentTier({ address: '84 SBR', stage: 'construction' })).toBe('committed');
    expect(getCommitmentTier({ address: '84 SBR', stage: 'sales' })).toBe('committed');
  });

  it('is prospect while still sourcing, even with a real address', () => {
    expect(getCommitmentTier({ address: '84 SBR', stage: 'sourcing' })).toBe('prospect');
  });

  it('is prospect without a real address, even past sourcing', () => {
    expect(getCommitmentTier({ address: 'TBC', stage: 'pre_construction' })).toBe('prospect');
    expect(getCommitmentTier({ address: null, stage: 'construction' })).toBe('prospect');
    expect(getCommitmentTier({ address: '', stage: 'sales' })).toBe('prospect');
  });

  it('is prospect when stage is missing', () => {
    expect(getCommitmentTier({ address: '84 SBR', stage: null })).toBe('prospect');
    expect(getCommitmentTier({ address: '84 SBR' })).toBe('prospect');
  });
});
