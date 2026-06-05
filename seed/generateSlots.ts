import 'dotenv/config';
import { requireSeedClient } from './shared';

const SLOT_TIMES = [
  '09:00', '10:00', '10:30', '11:00', '11:30', '12:00',
  '13:00', '13:30', '14:00', '15:00', '15:30',
  '16:00', '17:00', '17:30', '18:00', '19:00',
];

const ARTIST_BRANCH_SERVICES = [
  { artistId: 'pr-mia', branchId: 'br-dxb', serviceIds: ['s-001', 's-011', 's-012', 's-004', 's-021'] },
  { artistId: 'pr-noor', branchId: 'br-dxb-clinic', serviceIds: ['s-005', 's-900'] },
  { artistId: 'pr-jade', branchId: 'br-auh', serviceIds: ['s-007', 's-008', 's-009'] },
  { artistId: 'pr-lara', branchId: 'br-auh', serviceIds: ['s-007', 's-008', 's-009', 's-005'] },
];

const SERVICE_DURATION: Record<string, number> = {
  's-001': 60,
  's-004': 120,
  's-005': 60,
  's-007': 30,
  's-008': 60,
  's-009': 60,
  's-011': 60,
  's-012': 120,
  's-021': 90,
  's-900': 30,
};

function generateDates(daysAhead: number): string[] {
  const dates: string[] = [];
  const base = new Date();
  for (let i = 1; i <= daysAhead; i += 1) {
    const next = new Date(base);
    next.setDate(base.getDate() + i);
    dates.push(next.toISOString().split('T')[0] ?? '');
  }
  return dates.filter(Boolean);
}

async function main() {
  const supabase = requireSeedClient();
  const dates = generateDates(14);
  const slots: Array<Record<string, unknown>> = [];

  for (const { artistId, branchId, serviceIds } of ARTIST_BRANCH_SERVICES) {
    for (const serviceId of serviceIds) {
      const durationMin = SERVICE_DURATION[serviceId] ?? 60;
      for (const date of dates) {
        for (const time of SLOT_TIMES) {
          const start = new Date(`${date}T${time}:00+04:00`);
          const end = new Date(start.getTime() + durationMin * 60_000);

          if (end.getUTCHours() > 17 || (end.getUTCHours() === 17 && end.getUTCMinutes() > 0)) {
            continue;
          }

          slots.push({
            branch_id: branchId,
            service_id: serviceId,
            artist_id: artistId,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            status: 'available',
          });
        }
      }
    }
  }

  for (let index = 0; index < slots.length; index += 500) {
    const batch = slots.slice(index, index + 500);
    const { error } = await supabase.from('time_slots').insert(batch);
    if (error) {
      console.error(`Batch ${index / 500 + 1} failed:`, error.message);
    } else {
      console.log(`Inserted batch ${index / 500 + 1} (${batch.length} slots)`);
    }
  }

  console.log(`Done. Total slots generated: ${slots.length}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
