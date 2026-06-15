import { describe, it, expect } from 'vitest';
import { scoreDimensions, determineReadinessLevel } from '../src/scoring/scoringEngine';

describe('Scoring Engine', () => {
  it('TP-01: Scores Not Ready when multiple dimensions are 0', () => {
    const scores = scoreDimensions([], {
      data_accessibility: 0,
      data_quality_history: 0,
      systems_integration: 0,
      use_case_specificity: 0,
      implementation_capability: 0,
      adoption_conditions: 0,
      leadership_sponsorship: 0
    });
    expect(determineReadinessLevel(scores)).toBe('Not Ready');
  });

  it('TP-04: Scores Scale Ready when all dimensions are high', () => {
    const scores = scoreDimensions([], {
      data_accessibility: 2,
      data_quality_history: 2,
      systems_integration: 2,
      use_case_specificity: 2,
      implementation_capability: 2,
      adoption_conditions: 2,
      leadership_sponsorship: 2
    });
    expect(determineReadinessLevel(scores)).toBe('Scale Ready');
  });

  it('TP-03: Scores Pilot Ready when one dimension is 0 but rest are high', () => {
    const scores = scoreDimensions([], {
      data_accessibility: 2,
      data_quality_history: 2,
      systems_integration: 2,
      use_case_specificity: 2,
      implementation_capability: 0, // 1 low
      adoption_conditions: 2,
      leadership_sponsorship: 1
    });
    expect(determineReadinessLevel(scores)).toBe('Pilot Ready');
  });
});
