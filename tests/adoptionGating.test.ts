import { describe, it, expect } from 'vitest';
import {
  canScoreAdoptionConditions,
  conversationHasAdoptionEvidence,
} from '../src/assessment/adoptionGating';

describe('adoptionGating', () => {
  it('detects adoption-related conversation', () => {
    const history = [{
      role: 'user' as const,
      content: 'Managers are supportive but frontline staff need training for adoption.',
      timestamp: '2026-01-01T00:00:00.000Z',
    }];

    expect(conversationHasAdoptionEvidence(history)).toBe(true);
  });

  it('blocks adoption scoring before People topic and adoption question', () => {
    const blocked = canScoreAdoptionConditions([], []);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('People');
  });

  it('blocks adoption scoring when People complete but no adoption exchange', () => {
    const blocked = canScoreAdoptionConditions(['People'], [{
      role: 'user' as const,
      content: 'We have two data engineers.',
      timestamp: '2026-01-01T00:00:00.000Z',
    }]);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('adoption');
  });

  it('allows adoption scoring when People complete and adoption discussed', () => {
    const allowed = canScoreAdoptionConditions(['People'], [{
      role: 'user' as const,
      content: 'Store managers support the pilot but teams need change management and training.',
      timestamp: '2026-01-01T00:00:00.000Z',
    }]);
    expect(allowed.allowed).toBe(true);
  });
});
