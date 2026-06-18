import { describe, it, expect, vi } from 'vitest';
import { matchUseCases } from '../src/usecases/useCaseMatcher';
import * as useCaseMatcher from '../src/usecases/useCaseMatcher';

describe('Use Case Matcher', () => {
  it('Matches Retail use cases for Pilot Ready', () => {
    const cases = matchUseCases('Retail', 'Pilot Ready');
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.some(c => c.sectors.includes('Retail') || c.sectors.includes('All'))).toBe(true);
  });

  it('Excludes Scale Ready use cases when Not Ready', () => {
    const cases = matchUseCases('Retail', 'Not Ready');
    expect(cases.some(c => c.min_readiness_level === 'Scale Ready')).toBe(false);
  });

  it('Ranks route optimisation first for a logistics route problem', () => {
    const cases = matchUseCases('Logistics', 'Foundation Needed', {
      problemStatement: 'We need route optimisation for delivery routes, fleet utilisation, and on-time delivery.',
      maxResults: 1,
    });

    expect(cases[0]?.use_case_id).toBe('UC-LOG-001');
  });
});
