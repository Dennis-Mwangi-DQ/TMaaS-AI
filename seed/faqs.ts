import 'dotenv/config';
import { DEMO_FAQS } from '../src/lib/demoData';
import { requireSeedClient } from './shared';

async function main() {
  const supabase = requireSeedClient();
  const payload = DEMO_FAQS.map((faq) => ({
    question: faq.question,
    answer: faq.answer,
    category: faq.category,
  }));

  const { error } = await supabase.from('faqs').insert(payload);
  if (error) {
    throw error;
  }

  console.log('Seeded FAQs. Run `npm run seed:generate-embeddings` after this if OPENAI_API_KEY is configured.');
}

void main();
