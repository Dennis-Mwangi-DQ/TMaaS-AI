import { getEnv } from './env';
import { DEMO_BRANCHES, DEMO_SERVICES } from './demoData';
import { resolveGateCategory } from './serviceMetadata';
import { supabase } from '../db/supabaseClient';
import type { Branch, Service } from '../types';

function mapService(row: Record<string, unknown>): Service {
  const baseService = {
    id: String(row.id),
    name: String(row.title ?? row.name ?? ''),
    category: String(row.cat ?? row.category ?? ''),
    serviceTier: String(row.service_tier ?? 'T1') as Service['serviceTier'],
    city: row.city ? String(row.city) : null,
    durationMinutes: Number(row.duration_min ?? row.duration_minutes ?? 0),
    priceAed: Number(row.price_aed ?? 0),
    requiresConsultation: Boolean(row.requires_consultation),
    requiresPatchTest: Boolean(row.requires_patch_test),
    requiresScreening: Boolean(row.requires_screening),
    isMedicalGated: Boolean(row.is_medical_gated ?? row.is_medical),
    minFrequencyWeeks: row.min_frequency_weeks == null ? null : Number(row.min_frequency_weeks),
    frequencyHardBlock: Boolean(row.frequency_hard_block),
    description: String(row.description ?? ''),
  } satisfies Omit<Service, 'gateCategory'>;

  return {
    ...baseService,
    gateCategory: resolveGateCategory(baseService),
  };
}

function mapBranch(row: Record<string, unknown>): Branch {
  return {
    id: String(row.id),
    name: String(row.name),
    city: String(row.city ?? row.location ?? ''),
    address: String(row.address ?? ''),
    phone: String(row.phone ?? ''),
    hours: (row.hours as Record<string, string> | undefined) ?? {},
    categories: Array.isArray(row.categories) ? (row.categories as string[]) : [],
    status: row.status ? String(row.status) : 'open',
  };
}

export async function getServiceById(serviceId: string): Promise<Service | null> {
  if (supabase) {
    const { data, error } = await supabase.from('services').select('*').eq('id', serviceId).maybeSingle();
    if (!error && data) {
      return mapService(data);
    }
  }

  return DEMO_SERVICES.find((service) => service.id === serviceId) ?? null;
}

export async function findServiceByName(name?: string): Promise<Service | null> {
  if (!name) {
    return null;
  }

  if (supabase) {
    const { data, error } = await supabase.from('services').select('*').ilike('title', `%${name}%`).limit(1);
    if (!error && data && data.length > 0) {
      return mapService(data[0] as Record<string, unknown>);
    }
  }

  const normalized = name.toLowerCase();
  return (
    DEMO_SERVICES.find((service) => service.name.toLowerCase().includes(normalized) || normalized.includes(service.name.toLowerCase())) ??
    null
  );
}

export async function getBranchById(branchId: string): Promise<Branch | null> {
  if (supabase) {
    const { data, error } = await supabase.from('branches').select('*').eq('id', branchId).maybeSingle();
    if (!error && data) {
      return mapBranch(data);
    }
  }

  return DEMO_BRANCHES.find((branch) => branch.id === branchId) ?? null;
}

export async function findBranchByName(name?: string): Promise<Branch | null> {
  if (!name) {
    return getDefaultBranch();
  }

  if (supabase) {
    const { data, error } = await supabase.from('branches').select('*').or(`name.ilike.%${name}%,city.ilike.%${name}%`).limit(1);
    if (!error && data && data.length > 0) {
      return mapBranch(data[0] as Record<string, unknown>);
    }
  }

  const normalized = name.toLowerCase();
  return (
    DEMO_BRANCHES.find((branch) => branch.name.toLowerCase().includes(normalized) || branch.city.toLowerCase().includes(normalized)) ??
    getDefaultBranch()
  );
}

export function getDefaultBranch(): Branch {
  const configured = getEnv('DEFAULT_BRANCH_ID');
  if (configured) {
    return DEMO_BRANCHES.find((branch) => branch.id === configured) ?? DEMO_BRANCHES[0]!;
  }
  return DEMO_BRANCHES[0]!;
}
