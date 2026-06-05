import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { getEnv } from '../../lib/env';

const supabaseKey =
  getEnv('SUPABASE_SERVICE_ROLE_KEY') ??
  getEnv('SUPABASE_KEY') ??
  getEnv('SUPABASE_PUBLISHABLE_KEY') ??
  getEnv('SUPABASE_ANON_KEY');

const supabase = createClient(
  process.env.SUPABASE_URL!,
  supabaseKey!
);

// Slot times for each branch (UAE working day: 9am–9pm)
const SLOT_TIMES = [
  '09:00', '10:00', '10:30', '11:00', '11:30', '12:00',
  '13:00', '13:30', '14:00', '15:00', '15:30',
  '16:00', '17:00', '17:30', '18:00', '19:00'
];

// Which services each artist provides, at which branch
const ARTIST_BRANCH_SERVICES = [
  { artistId: 'pr-mia',  branchId: 'br-dxb',        serviceIds: ['s-001','s-011','s-015','s-002','s-016','s-012','s-004','s-021'] },
  { artistId: 'pr-noor', branchId: 'br-dxb-clinic',  serviceIds: ['s-003','s-006','s-013','s-014','s-017','s-019','s-022','s-023','s-005'] },
  { artistId: 'pr-jade', branchId: 'br-auh',          serviceIds: ['s-007','s-008','s-009'] },
  { artistId: 'pr-lara', branchId: 'br-auh',          serviceIds: ['s-007','s-008','s-009','s-005','s-022'] },
];

// Service durations in minutes (must match services table)
const SERVICE_DURATION: Record<string, number> = {
  's-001': 60, 's-002': 90, 's-003': 60, 's-004': 120, 's-005': 60,
  's-006': 30, 's-007': 30, 's-008': 60, 's-009': 60, 's-011': 60,
  's-012': 120,'s-013': 45, 's-014': 45, 's-015': 60, 's-016': 30,
  's-017': 60, 's-019': 45, 's-021': 90, 's-022': 60, 's-023': 45,
  's-900': 30,
};

function generateDates(daysAhead: number): string[] {
  const dates: string[] = [];
  const base = new Date();
  for (let i = 1; i <= daysAhead; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const isoDate = d.toISOString().split('T')[0];
    if (isoDate) {
      dates.push(isoDate);  // YYYY-MM-DD
    }
  }
  return dates;
}

async function main() {
  const dates = generateDates(14);  // next 14 days
  const slots: object[] = [];

  for (const { artistId, branchId, serviceIds } of ARTIST_BRANCH_SERVICES) {
    for (const serviceId of serviceIds) {
      const durationMin = SERVICE_DURATION[serviceId] ?? 60;
      for (const date of dates) {
        for (const time of SLOT_TIMES) {
          const start = new Date(`${date}T${time}:00+04:00`);  // UAE = UTC+4
          const end = new Date(start.getTime() + durationMin * 60000);

          // Only include if end time is before 21:00
          if (end.getHours() > 21 || (end.getHours() === 21 && end.getMinutes() > 0)) continue;

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

  // Insert in batches of 500
  for (let i = 0; i < slots.length; i += 500) {
    const batch = slots.slice(i, i + 500);
    const { error } = await supabase.from('time_slots').insert(batch);
    if (error) {
      console.error(`Batch ${i / 500} failed:`, error.message);
    } else {
      console.log(`Inserted batch ${i / 500 + 1} (${batch.length} slots)`);
    }
  }

  console.log(`Done. Total slots generated: ${slots.length}`);
}

main().catch(console.error);
