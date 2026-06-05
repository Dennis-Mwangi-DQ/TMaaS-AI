import { getEnv } from './env';

const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

export async function generateQueryEmbedding(input: string): Promise<number[] | null> {
  const apiKey = getEnv('OPENAI_API_KEY') ?? getEnv('OPENROUTER_API_KEY');
  if (!apiKey) {
    return null;
  }

  const baseUrl = getEnv('OPENROUTER_BASE_URL')?.replace(/\/$/, '');
  const url = baseUrl ? `${baseUrl}/v1/embeddings` : 'https://api.openai.com/v1/embeddings';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('generateQueryEmbedding failed', response.status, body);
      return null;
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    return payload.data?.[0]?.embedding ?? null;
  } catch (error) {
    console.error('generateQueryEmbedding failed', error);
    return null;
  }
}
