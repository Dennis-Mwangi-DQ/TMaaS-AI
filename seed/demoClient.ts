import 'dotenv/config';
import { addWeeks } from '../src/lib/dates';
import { requireSeedClient } from './shared';

const SARA_ID = '11111111-0000-0000-0000-000000000001';
const LAYLA_ID = '11111111-0000-0000-0000-000000000002';
const JULES_ID = '11111111-0000-0000-0000-000000000003';
const MAYA_ID = '11111111-0000-0000-0000-000000000004';
const REEMA_ID = '11111111-0000-0000-0000-000000000005';

async function main() {
  const supabase = requireSeedClient();
  const now = new Date();

  const { error: clientError } = await supabase.from('clients').upsert([
    {
      id: SARA_ID,
      name: 'Sara Al Mansoori',
      email: 'sara@demo.browz.ae',
      phone: '+971501234567',
      tier: 'VIP',
      preferences: 'Prefers Dr Zack Ally. Moderate pressure. Quiet during treatment.',
      skin_notes: 'Sensitive skin around brow area. Prefers lighter tint shade.',
    },
    {
      id: LAYLA_ID,
      name: 'Layla Hassan',
      email: 'layla@demo.browz.ae',
      phone: '+971564412290',
      tier: 'GOLD',
      preferences: 'Prefers female practitioners.',
    },
    {
      id: JULES_ID,
      name: 'Jules Tessier',
      email: 'jules@demo.browz.ae',
      phone: '+971508841212',
      tier: 'VIP',
      preferences: 'Named practitioner Dr Richard Devine.',
      allergies: ['Lidocaine - confirmed allergy. Use alternative anaesthetic.'],
    },
    {
      id: MAYA_ID,
      name: 'Maya Khoury',
      email: 'maya@demo.browz.ae',
      phone: '+971504123344',
      tier: 'GOLD',
    },
    {
      id: REEMA_ID,
      name: 'Reema Al Rashid',
      email: 'reema@demo.browz.ae',
      phone: '+971552209011',
      tier: 'VIP',
    },
  ]);
  if (clientError) throw clientError;

  const bookings = [
    {
      id: 'BRZ-2026-DEMO01',
      client_id: MAYA_ID,
      service_id: 's-011',
      branch_id: 'br-dxb',
      status: 'completed',
      booking_type: 'single',
      payment_type: 'full_upfront',
      deposit_amount_aed: 180,
      balance_due_aed: 0,
      payment_status: 'paid',
      channel: 'web',
      created_at: addWeeks(now, -3).toISOString(),
      updated_at: addWeeks(now, -3).toISOString(),
    },
    {
      id: 'BRZ-2026-DEMO02',
      client_id: REEMA_ID,
      service_id: 's-007',
      branch_id: 'br-auh',
      status: 'completed',
      booking_type: 'single',
      payment_type: 'deposit',
      deposit_amount_aed: 300,
      balance_due_aed: 1200,
      payment_status: 'paid',
      channel: 'whatsapp',
      created_at: addWeeks(now, -6).toISOString(),
      updated_at: addWeeks(now, -6).toISOString(),
    },
  ];

  const { error: bookingError } = await supabase.from('bookings').upsert(bookings);
  if (bookingError) throw bookingError;

  const { error: spmuError } = await supabase.from('spmu_clearances').insert({
    client_id: LAYLA_ID,
    service_category: 'spmu_lip',
    patch_test_done: true,
    patch_test_cleared: true,
    cleared_at: addWeeks(now, -8).toISOString(),
    valid_until: addWeeks(now, 16).toISOString(),
  });
  if (spmuError) console.warn('SPMU clearance seed warning:', spmuError.message);

  const { error: medicalError } = await supabase.from('medical_screenings').upsert({
    id: 'SCR-2026-DEMO1',
    client_id: JULES_ID,
    service_category: 'injectable',
    answers: {
      q1_pregnant: false,
      q2_medications: false,
      q3_allergies: true,
      q3_detail: 'Lidocaine allergy - alternative anaesthetic confirmed',
      q4_adverse_reaction: false,
      q5_autoimmune: false,
      q6_roaccutane: false,
      q7_active_infection: false,
    },
    flagged_questions: ['q3_allergies'],
    status: 'APPROVED',
    reviewed_by: 'pr-jade',
    reviewed_at: addWeeks(now, -4).toISOString(),
    approved_until: addWeeks(now, 8).toISOString(),
    reviewer_note: 'Approved. Lidocaine allergy flagged and noted - alternative anaesthetic required.',
  });
  if (medicalError) throw medicalError;

  console.log('Seeded demo clients, booking history, and clearance records aligned to the Supabase setup plan.');
}

void main();
