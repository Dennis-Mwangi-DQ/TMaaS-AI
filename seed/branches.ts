import 'dotenv/config';
import { DEMO_BRANCHES } from '../src/lib/demoData';
import { requireSeedClient } from './shared';

async function main() {
  const supabase = requireSeedClient();
  const payload = DEMO_BRANCHES.map((branch) => ({
    id: branch.id,
    name: branch.name,
    city: branch.city,
    address: branch.address,
    phone: branch.phone,
    hours: branch.hours,
    categories: branch.categories,
    status: branch.status,
  }));

  const { error } = await supabase.from('branches').upsert(payload);
  if (error) {
    throw error;
  }

  console.log(`Seeded ${payload.length} branches.`);
}

void main();
