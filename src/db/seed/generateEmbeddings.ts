import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';  // or use @anthropic-ai/sdk with their embedding endpoint
import 'dotenv/config';
import { getEnv } from '../../lib/env';

const supabaseKey =
  getEnv('SUPABASE_SERVICE_ROLE_KEY') ??
  getEnv('SUPABASE_KEY') ??
  getEnv('SUPABASE_PUBLISHABLE_KEY') ??
  getEnv('SUPABASE_ANON_KEY');

const supabase = createClient(process.env.SUPABASE_URL!, supabaseKey!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  const first = response.data[0];
  if (!first?.embedding) {
    throw new Error('Embedding response did not contain an embedding vector.');
  }
  return first.embedding;
}

async function main() {
  // Fetch all FAQs that don't yet have an embedding
  const { data: faqs, error } = await supabase
    .from('faqs')
    .select('id, question, answer')
    .is('embedding', null);

  if (error) throw new Error(error.message);
  if (!faqs || faqs.length === 0) {
    console.log('All FAQs already have embeddings.');
    return;
  }

  console.log(`Generating embeddings for ${faqs.length} FAQ records...`);

  for (const faq of faqs) {
    // Embed the question + answer together for richer semantic match
    const text = `${faq.question}\n${faq.answer}`;
    const embedding = await getEmbedding(text);

    const { error: updateError } = await supabase
      .from('faqs')
      .update({ embedding })
      .eq('id', faq.id);

    if (updateError) {
      console.error(`Failed to update FAQ ${faq.id}:`, updateError.message);
    } else {
      console.log(`Embedded: ${faq.question.slice(0, 60)}...`);
    }

    // Rate limit: 1 request per 100ms
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('All FAQ embeddings generated successfully.');
}

main().catch(console.error);
