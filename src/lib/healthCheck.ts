import { getEnv, isLlmEnabled } from './env';

export type HealthStatus = {
  status: 'ok' | 'degraded';
  llm: {
    provider: 'deepseek';
    model: string;
    baseUrl: string;
    enabled: boolean;
  };
  embeddings: {
    provider: 'none';
    model: null;
  };
};

export async function getHealthStatus(): Promise<HealthStatus> {
  const env = getEnv();
  const llmEnabled = isLlmEnabled();

  return {
    status: llmEnabled ? 'ok' : 'degraded',
    llm: {
      provider: 'deepseek',
      model: env.DEEPSEEK_MODEL,
      baseUrl: env.DEEPSEEK_BASE_URL,
      enabled: llmEnabled,
    },
    embeddings: {
      provider: 'none',
      model: null,
    },
  };
}
