import { getEnv } from './env';

export const MODEL = 'qwen/qwen3-next-80b-a3b-instruct:free';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_API_KEY = getEnv('OPENAI_API_KEY');
const ANTHROPIC_API_KEY = getEnv('ANTHROPIC_API_KEY');

export const hasOpenAIConfig = Boolean(OPENAI_API_KEY || ANTHROPIC_API_KEY);

async function openaiRequest(payload: Record<string, unknown>): Promise<any> {
  const apiKey = OPENAI_API_KEY ?? ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY or ANTHROPIC_API_KEY');
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed ${response.status}: ${body}`);
  }

  return response.json();
}

export async function createChatCompletion(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
  const payload = {
    model: MODEL,
    messages,
    temperature: 0.2,
    max_tokens: 600,
  };
  const result = await openaiRequest(payload);
  return String(result.choices?.[0]?.message?.content ?? '');
}
