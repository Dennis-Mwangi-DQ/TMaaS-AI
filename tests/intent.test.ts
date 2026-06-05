import { describe, expect, it } from 'vitest';
import { classifyIntent } from '../src/agent/intentClassifier';

describe('classifyIntent', () => {
  it('detects availability intent and service entity', async () => {
    const result = await classifyIntent('What times do you have for Brow Threading tomorrow?', []);
    expect(result.intent).toBe('check_availability');
    expect(result.entities.service).toBe('Brow Threading');
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('detects escalation intent', async () => {
    const result = await classifyIntent('I need to speak to someone please', []);
    expect(result.intent).toBe('escalate_human');
  });
});
