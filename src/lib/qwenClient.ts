import { getEnv } from './env';

export const MODEL = 'qwen/qwen3-next-80b-a3b-instruct:free';
const OPENROUTER_BASE_URL = getEnv('OPENROUTER_BASE_URL');
const OPENAI_API_KEY = getEnv('OPENAI_API_KEY') ?? getEnv('OPENROUTER_API_KEY');
const OPENAI_API_URL = OPENROUTER_BASE_URL
  ? `${OPENROUTER_BASE_URL.replace(/\/$/, '')}/v1/chat/completions`
  : 'https://api.openai.com/v1/chat/completions';
const OLLAMA_API_URL = getEnv('OLLAMA_API_URL')?.replace(/\/$/, '') ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = getEnv('OLLAMA_MODEL') ?? 'llama2';
const OLLAMA_API_KEY = getEnv('OLLAMA_API_KEY');

export const hasOpenAIConfig = Boolean(OPENAI_API_KEY);
export const hasLlmConfig = Boolean(OPENAI_API_KEY || OLLAMA_API_URL);

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseNdjson(raw: string): unknown[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => tryParseJson(line))
    .filter((value): value is unknown => value !== null);
}

function flattenContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => flattenContent(item)).join('');
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  const record = value as Record<string, unknown>;

  if (typeof record.text === 'string') {
    return record.text;
  }

  if (typeof record.content === 'string') {
    return record.content;
  }

  if (Array.isArray(record.content)) {
    return record.content.map((item) => flattenContent(item)).join('');
  }

  if (typeof record.response === 'string') {
    return record.response;
  }

  if (typeof record.output === 'string') {
    return record.output;
  }

  if (typeof record.output_text === 'string') {
    return record.output_text;
  }

  if (record.message) {
    return flattenContent(record.message);
  }

  if (Array.isArray(record.choices)) {
    return record.choices
      .map((choice) => {
        if (!choice || typeof choice !== 'object') {
          return '';
        }
        const choiceRecord = choice as Record<string, unknown>;
        return flattenContent(choiceRecord.message ?? choiceRecord.delta ?? choiceRecord.text ?? '');
      })
      .join('');
  }

  return '';
}

function isLikelyProviderEnvelope(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.action === 'string' || typeof record.tool_name === 'string') {
    return false;
  }

  const hasOllamaShape =
    typeof record.model === 'string' &&
    ('message' in record || 'response' in record || 'done' in record || 'created_at' in record);

  const hasOpenAIShape =
    Array.isArray(record.choices) &&
    ('id' in record || 'model' in record || 'created' in record);

  return hasOllamaShape || hasOpenAIShape;
}

function extractCompletionText(rawBody: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return '';
  }

  const parsed = tryParseJson(trimmed);
  if (parsed) {
    const extracted = flattenContent(parsed).trim();
    if (extracted) {
      return extracted;
    }
    if (isLikelyProviderEnvelope(parsed)) {
      return '';
    }
    return trimmed;
  }

  const ndjsonObjects = parseNdjson(trimmed);
  if (ndjsonObjects.length > 0) {
    const extracted = ndjsonObjects.map((item) => flattenContent(item)).join('').trim();
    if (extracted) {
      return extracted;
    }

    const last = ndjsonObjects[ndjsonObjects.length - 1];
    if (last) {
      const lastText = flattenContent(last).trim();
      if (lastText) {
        return lastText;
      }
    }
  }

  return trimmed;
}

async function openaiRequest(payload: Record<string, unknown>): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY or OPENROUTER_API_KEY');
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed ${response.status}: ${body}`);
  }

  const body = await response.text();
  return extractCompletionText(body);
}

async function ollamaRequest(payload: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      ...(OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      ...payload,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama request failed ${response.status}: ${body}`);
  }

  const body = await response.text();
  return extractCompletionText(body);
}

export async function createChatCompletion(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
  const payload = {
    messages,
    temperature: 0.2,
    max_tokens: 600,
  };

  const result = OPENAI_API_KEY
    ? await openaiRequest({ model: MODEL, ...payload })
    : await ollamaRequest(payload);

  return String(result ?? '').trim();
}
