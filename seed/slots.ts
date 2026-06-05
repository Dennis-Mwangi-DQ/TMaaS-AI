import 'dotenv/config';
import { buildDemoSlots, DEMO_BRANCHES, DEMO_SERVICES } from '../src/lib/demoData';
import { addDays } from '../src/lib/dates';
import { requireSeedClient } from './shared';

async function main() {
  const supabase = requireSeedClient();
  const rows = [...Array.from({ length: 5 }).flatMap((_, index) => buildDemoSlots(addDays(new Date(), index + 1)))]
    .map((slot, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      branch_id: slot.branchId || DEMO_BRANCHES[0]!.id,
      service_id: slot.serviceId || DEMO_SERVICES[0]!.id,
      artist_id: slot.artistId,
      start_time: slot.startTime,
      end_time: slot.endTime,
      status: slot.status,
    }));

  const { error } = await supabase.from('time_slots').upsert(rows);
  if (error) {
    throw error;
  }

  console.log(`Seeded ${rows.length} time slots.`);
}

void main();
