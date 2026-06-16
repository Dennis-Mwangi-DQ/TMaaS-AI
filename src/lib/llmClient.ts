import { ChatOpenAI } from '@langchain/openai';
import { getEnv, isLlmEnabled } from './env';

type DeepSeekChatModel = {
  invoke(input: unknown): Promise<unknown>;
  bindTools?(tools: unknown[]): {
    invoke(input: unknown): Promise<unknown>;
  };
};

export function isAgentLlmEnabled(): boolean {
  return isLlmEnabled();
}

export function createDeepSeekLlm(options: {
  temperature?: number;
  maxTokens?: number;
} = {}): DeepSeekChatModel {
  const env = getEnv();
  const apiKey = env.DEEPSEEK_API_KEY.trim();

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is required.');
  }

  const OpenAICompatibleChat = ChatOpenAI as unknown as {
    new (model: string, fields: Record<string, unknown>): DeepSeekChatModel;
  };

  return new OpenAICompatibleChat(env.DEEPSEEK_MODEL, {
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
