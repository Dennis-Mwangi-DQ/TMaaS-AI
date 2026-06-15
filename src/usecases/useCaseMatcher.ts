import fs from 'fs';
import path from 'path';
import type { ReadinessLevel, UseCaseEntry } from '../types';

let useCasesCache: UseCaseEntry[] | null = null;

export function loadUseCases(): UseCaseEntry[] {
  if (useCasesCache) {
    return useCasesCache;
  }
  const filePath = path.join(process.cwd(), 'data/use_cases.json');
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    useCasesCache = JSON.parse(data) as UseCaseEntry[];
    return useCasesCache;
  } catch (error) {
    console.error('Failed to load use cases:', error);
    return [];
  }
}

const readinessRank: Record<ReadinessLevel, number> = {
  'Not Ready': 0,
  'Foundation Needed': 1,
  'Pilot Ready': 2,
  'Scale Ready': 3,
};

export function matchUseCases(sector: string, readinessLevel: ReadinessLevel): UseCaseEntry[] {
  const useCases = loadUseCases();
  const currentRank = readinessRank[readinessLevel];

  // Filter by sector (or 'All') and readiness level
  const matched = useCases.filter((uc) => {
    const sectorMatch = uc.sectors.includes('All') || uc.sectors.includes(sector);
    const minRank = readinessRank[uc.min_readiness_level as ReadinessLevel] ?? 0;
    const readinessMatch = currentRank >= minRank;
    return sectorMatch && readinessMatch;
  });

  // Sort by readiness level (highest suitable first) and take top 3
  matched.sort((a, b) => {
    const rankA = readinessRank[a.min_readiness_level as ReadinessLevel] ?? 0;
    const rankB = readinessRank[b.min_readiness_level as ReadinessLevel] ?? 0;
    return rankB - rankA;
  });

  return matched.slice(0, 3);
}
