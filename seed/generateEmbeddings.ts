import 'dotenv/config';
import { getEnv } from '../src/lib/env';
import { requireSeedClient } from './shared';

async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = getEnv('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required to generate FAQ embeddings.');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };

  const embedding = payload.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error('Embedding response did not include a vector.');
  }

  return embedding;
}

async function main() {
  const supabase = requireSeedClient();
  const { data: faqs, error } = await supabase
    .from('faqs')
    .select('id, question, answer')
    .is('embedding', null);

  if (error) {
    throw new Error(error.message);
  }

  if (!faqs || faqs.length === 0) {
    console.log('All FAQs already have embeddings.');
    return;
  }

  console.log(`Generating embeddings for ${faqs.length} FAQ records...`);

  for (const faq of faqs) {
    const text = `${faq.question}\n${faq.answer}`;
    const embedding = await getEmbedding(text);

    const { error: updateError } = await supabase
      .from('faqs')
      .update({ embedding })
      .eq('id', faq.id);

    if (updateError) {
      console.error(`Failed to update FAQ ${faq.id}:`, updateError.message);
    } else {
      console.log(`Embedded: ${String(faq.question).slice(0, 60)}...`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log('All FAQ embeddings generated successfully.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
