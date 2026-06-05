import { describe, expect, it } from 'vitest';
import { generateSessionId } from '../src/lib/ids';
import { runAgentPipeline } from '../src/agent/pipeline';

describe('runAgentPipeline', () => {
  it('returns a usable greeting response', async () => {
    const result = await runAgentPipeline({
      message: 'Hello there',
      sessionId: generateSessionId(),
      channel: 'web',
    });

    expect(result.response.toLowerCase()).toContain('browz');
  });

  it('returns availability results for an in-scope message', async () => {
    const result = await runAgentPipeline({
      message: 'Can you check Brow Threading availability tomorrow?',
      sessionId: generateSessionId(),
      channel: 'web',
    });

    expect(result.response.length).toBeGreaterThan(0);
  });
});
