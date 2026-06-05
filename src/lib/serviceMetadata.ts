import type { Service } from '../types';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveGateCategory(input: Pick<Service, 'id' | 'name' | 'category' | 'serviceTier'>): string {
  if (input.serviceTier === 'T2') {
    const normalized = normalize(`${input.id} ${input.name} ${input.category}`);
    if (normalized.includes('lip')) {
      return 'spmu_lip';
    }
    if (normalized.includes('eye') || normalized.includes('lash') || normalized.includes('liner')) {
      return 'spmu_eyeliner';
    }
    return 'spmu_brow';
  }

  if (input.serviceTier === 'T3') {
    const normalized = normalize(`${input.id} ${input.name} ${input.category}`);
    if (normalized.includes('laser')) {
      return 'laser';
    }
    if (
      normalized.includes('morpheus') ||
      normalized.includes('ultherapy') ||
      normalized.includes('hifu') ||
      normalized.includes('energy')
    ) {
      return 'energy_device';
    }
    if (
      normalized.includes('inject') ||
      normalized.includes('filler') ||
      normalized.includes('profhilo') ||
      normalized.includes('anti-wrinkle') ||
      normalized.includes('botox')
    ) {
      return 'injectable';
    }
    return 'medical_facial';
  }

  return input.category;
}
