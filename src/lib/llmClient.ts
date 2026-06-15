import { ChatOpenAI } from '@langchain/openai';
import { getEnv, isLlmEnabled } from './env';

export function isAgentLlmEnabled(): boolean {
  return isLlmEnabled();
}

export function createDeepSeekLlm(options: {
  temperature?: number;
  maxTokens?: number;
} = {}): ChatOpenAI {
  const env = getEnv();
  const apiKey = env.DEEPSEEK_API_KEY.trim();

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is required.');
  }

  return new ChatOpenAI({
    model: env.DEEPSEEK_MODEL,
    apiKey,
    openAIApiKey: apiKey,
    temperature: options.temperature ?? env.AGENT_TEMPERATURE,
    maxTokens: options.maxTokens ?? env.AGENT_MAX_TOKENS,
    configuration: {
      apiKey,
      baseURL: env.DEEPSEEK_BASE_URL,
    },
  });
}

export const createAgentLlm = createDeepSeekLlm;
