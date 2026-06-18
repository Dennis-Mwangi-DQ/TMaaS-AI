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

export type UseCaseMatchContext = {
  problemStatement?: string;
  conversation?: string;
  maxResults?: number;
};

const STOP_WORDS = new Set([
  'about',
  'across',
  'after',
  'again',
  'also',
  'with',
  'from',
  'that',
  'this',
  'have',
  'want',
  'need',
  'using',
  'into',
  'their',
  'there',
  'where',
  'which',
  'would',
  'could',
  'should',
  'main',
  'goal',
  'business',
  'problem',
  'company',
  'organisation',
  'organization',
]);

const KEYWORD_EXPANSIONS: Record<string, string[]> = {
  route: ['delivery', 'fleet', 'vehicle', 'gps', 'telematics'],
  routing: ['route', 'delivery', 'fleet', 'vehicle'],
  optimise: ['optimise', 'optimize', 'optimisation', 'optimization'],
  optimize: ['optimise', 'optimize', 'optimisation', 'optimization'],
  reporting: ['report', 'dashboard', 'knowledge', 'document'],
  report: ['reporting', 'dashboard', 'knowledge', 'document'],
  maintenance: ['equipment', 'failure', 'downtime', 'sensor'],
  demand: ['forecast', 'forecasting', 'inventory', 'sales'],
  forecast: ['demand', 'forecasting', 'inventory', 'sales'],
  forecasting: ['demand', 'forecast', 'inventory', 'sales'],
  document: ['classification', 'extraction', 'invoice', 'contract', 'application'],
  documents: ['document', 'classification', 'extraction', 'invoice', 'contract'],
  quality: ['inspection', 'defect', 'vision', 'camera'],
  customer: ['support', 'ticket', 'crm', 'query'],
  fraud: ['transaction', 'payment', 'risk'],
  pricing: ['price', 'margin', 'inventory'],
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function tokenize(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }
  const tokens = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const synonym of KEYWORD_EXPANSIONS[token] ?? []) {
      expanded.add(synonym);
    }
  }
  return expanded;
}

function useCaseText(useCase: UseCaseEntry): string {
  return [
    useCase.name,
    useCase.description,
    useCase.value_statement,
    useCase.prerequisite,
    useCase.dq_notes ?? '',
  ].join(' ').toLowerCase();
}

function sectorMatches(useCase: UseCaseEntry, sector: string): boolean {
  const normalizedSector = normalize(sector);
  return useCase.sectors.some((entry) => {
    const normalizedEntry = normalize(entry);
    return normalizedEntry === 'all' || normalizedEntry === normalizedSector;
  });
}

function exactSectorMatch(useCase: UseCaseEntry, sector: string): boolean {
  const normalizedSector = normalize(sector);
  return useCase.sectors.some((entry) => normalize(entry) === normalizedSector);
}

function relevanceScore(
  useCase: UseCaseEntry,
  sector: string,
  readinessLevel: ReadinessLevel,
  problemTokens: Set<string>,
): number {
  const minRank = readinessRank[useCase.min_readiness_level] ?? 0;
  const currentRank = readinessRank[readinessLevel];
  const text = useCaseText(useCase);
  let score = 0;

  if (exactSectorMatch(useCase, sector)) {
    score += 8;
  } else if (useCase.sectors.some((entry) => normalize(entry) === 'all')) {
    score += 2;
  }

  score += minRank;
  score += Math.max(0, 3 - Math.abs(currentRank - minRank));

  for (const token of problemTokens) {
    if (text.includes(token)) {
      score += 4;
    }
  }

  return score;
}

export function matchUseCases(
  sector: string,
  readinessLevel: ReadinessLevel,
  context: UseCaseMatchContext = {},
): UseCaseEntry[] {
  const useCases = loadUseCases();
  const maxResults = context.maxResults ?? 3;
  const currentRank = readinessRank[readinessLevel];
  const resolvedSector = sector || 'All';
  const problemTokens = tokenize(
    [context.problemStatement, context.conversation].filter(Boolean).join(' '),
  );

  const matched = useCases.filter((uc) => {
    const sectorMatch = sectorMatches(uc, resolvedSector);
    const minRank = readinessRank[uc.min_readiness_level] ?? 0;
    const readinessMatch = currentRank >= minRank;
    return sectorMatch && readinessMatch;
  });

  matched.sort((a, b) => {
    const relevanceDelta =
      relevanceScore(b, resolvedSector, readinessLevel, problemTokens) -
      relevanceScore(a, resolvedSector, readinessLevel, problemTokens);
    if (relevanceDelta !== 0) {
      return relevanceDelta;
    }
    const rankA = readinessRank[a.min_readiness_level] ?? 0;
    const rankB = readinessRank[b.min_readiness_level] ?? 0;
    return rankB - rankA;
  });

  return matched.slice(0, maxResults);
}
