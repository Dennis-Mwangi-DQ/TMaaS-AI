import 'dotenv/config';
import { DEMO_SERVICES } from '../src/lib/demoData';
import { requireSeedClient } from './shared';

async function main() {
  const supabase = requireSeedClient();
  const payload = DEMO_SERVICES.map((service) => ({
    id: service.id,
    title: service.name,
    cat: service.category,
    service_tier: service.serviceTier,
    city: service.city,
    duration_min: service.durationMinutes,
    price_aed: service.priceAed,
    requires_consultation: service.requiresConsultation,
    requires_patch_test: service.requiresPatchTest,
    requires_screening: service.requiresScreening,
    is_medical_gated: service.isMedicalGated,
    min_frequency_weeks: service.minFrequencyWeeks,
    frequency_hard_block: service.frequencyHardBlock,
    description: service.description,
    active: true,
  }));

  const { error } = await supabase.from('services').upsert(payload);
  if (error) {
    throw error;
  }

  console.log(`Seeded ${payload.length} services.`);
}

void main();
