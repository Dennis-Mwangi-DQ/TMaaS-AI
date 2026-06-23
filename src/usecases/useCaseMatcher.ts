import fs from 'fs';
import path from 'path';
import type {
  DimensionName,
  EvidenceRecord,
  ReadinessLevel,
  UseCaseEntry,
} from '../types';

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
  evidence?: EvidenceRecord[];
  maxResults?: number;
};

export type UseCaseGateInput = {
  sector: string;
  readinessLevel: ReadinessLevel;
  problemStatement?: string;
  conversation?: string;
  evidence: EvidenceRecord[];
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
  meeting: ['summarisation', 'summarization', 'transcript', 'action'],
  screening: ['cv', 'resume', 'hiring', 'recruitment'],
};

const PREREQUISITE_SIGNAL_MAP: Record<string, DimensionName[]> = {
  historical: ['data_quality_history', 'data_accessibility'],
  sales: ['data_quality_history', 'data_accessibility'],
  forecast: ['data_quality_history', 'data_accessibility'],
  demand: ['data_quality_history', 'data_accessibility'],
  sensor: ['systems_integration', 'data_accessibility'],
  iot: ['systems_integration', 'data_accessibility'],
  integration: ['systems_integration'],
  api: ['systems_integration'],
  ticket: ['data_accessibility', 'systems_integration'],
  document: ['data_accessibility'],
  recording: ['data_accessibility'],
  transcript: ['data_accessibility'],
  camera: ['systems_integration', 'implementation_capability'],
  gps: ['systems_integration', 'data_accessibility'],
  fleet: ['systems_integration', 'data_accessibility'],
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

function problemAligns(useCase: UseCaseEntry, problemTokens: Set<string>): boolean {
  if (problemTokens.size === 0) {
    return false;
  }
  const text = useCaseText(useCase);
  for (const token of problemTokens) {
    if (text.includes(token)) {
      return true;
    }
  }
  return false;
}

function prerequisiteTokens(prerequisite: string): Set<string> {
  return tokenize(prerequisite);
}

function evidenceCorpus(input: UseCaseGateInput): string {
  return [
    input.problemStatement ?? '',
    input.conversation ?? '',
    ...input.evidence.map((e) => `${e.extractedText} ${e.agentInterpretation}`),
  ].join(' ').toLowerCase();
}

function hasDataSignals(useCase: UseCaseEntry, input: UseCaseGateInput): boolean {
  if (input.evidence.length === 0) {
    return false;
  }

  const prereqText = useCase.prerequisite.toLowerCase();
  const relevantDimensions = new Set<DimensionName>();

  for (const [keyword, dimensions] of Object.entries(PREREQUISITE_SIGNAL_MAP)) {
    if (prereqText.includes(keyword) || useCaseText(useCase).includes(keyword)) {
      for (const dim of dimensions) {
        relevantDimensions.add(dim);
      }
    }
  }

  if (relevantDimensions.size === 0) {
    return input.evidence.some((record) =>
      record.quality === 'DOCUMENTED' || record.source === 'DOCUMENT',
    );
  }

  return input.evidence.some((record) => relevantDimensions.has(record.dimension));
}

function prerequisitesConfirmed(useCase: UseCaseEntry, input: UseCaseGateInput): boolean {
  const corpus = evidenceCorpus(input);
  const tokens = prerequisiteTokens(useCase.prerequisite);
  if (tokens.size === 0) {
    return input.evidence.length > 0;
  }

  let matched = 0;
  for (const token of tokens) {
    if (corpus.includes(token)) {
      matched += 1;
    }
  }

  return matched >= Math.min(2, tokens.size);
}

export function passesEvidenceGate(
  useCase: UseCaseEntry,
  input: UseCaseGateInput,
): boolean {
  const problemTokens = tokenize(
    [input.problemStatement, input.conversation].filter(Boolean).join(' '),
  );
  const currentRank = readinessRank[input.readinessLevel];
  const minRank = readinessRank[useCase.min_readiness_level] ?? 0;

  return (
    problemAligns(useCase, problemTokens) &&
    hasDataSignals(useCase, input) &&
    sectorMatches(useCase, input.sector || 'All') &&
    currentRank >= minRank &&
    prerequisitesConfirmed(useCase, input)
  );
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

function findBestCatalogMatch(
  problemStatement: string | undefined,
  candidates: UseCaseEntry[],
): UseCaseEntry | undefined {
  if (!problemStatement || candidates.length === 0) {
    return undefined;
  }

  const problemTokens = tokenize(problemStatement);
  if (problemTokens.size === 0) {
    return undefined;
  }

  let best: UseCaseEntry | undefined;
  let bestScore = -1;

  for (const uc of candidates) {
    const text = useCaseText(uc);
    let score = 0;
    for (const token of problemTokens) {
      if (text.includes(token)) {
        score += 4;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = uc;
    }
  }

  return bestScore > 0 ? best : undefined;
}

export function matchUseCases(
  sector: string,
  readinessLevel: ReadinessLevel,
  context: UseCaseMatchContext = {},
): UseCaseEntry[] {
  const useCases = loadUseCases();
  const maxResults = context.maxResults ?? 3;
  const resolvedSector = sector || 'All';
  const evidence = context.evidence ?? [];
  const problemTokens = tokenize(
    [context.problemStatement, context.conversation].filter(Boolean).join(' '),
  );

  const gateInput: UseCaseGateInput = {
    sector: resolvedSector,
    readinessLevel,
    problemStatement: context.problemStatement,
    conversation: context.conversation,
    evidence,
  };

  const gated = useCases.filter((uc) => passesEvidenceGate(uc, gateInput));

  gated.sort((a, b) => {
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

  const primary = findBestCatalogMatch(context.problemStatement, useCases);
  if (primary) {
    const primaryPasses = passesEvidenceGate(primary, gateInput);
    if (primaryPasses) {
      const secondaries = gated.filter((uc) => uc.use_case_id !== primary.use_case_id);
      return [primary, ...secondaries].slice(0, maxResults);
    }
    return [primary];
  }

  return gated.slice(0, maxResults);
}

export function primaryUseCaseNeedsValidation(
  sector: string,
  readinessLevel: ReadinessLevel,
  context: UseCaseMatchContext = {},
): boolean {
  if (!context.problemStatement) {
    return false;
  }

  const primary = findBestCatalogMatch(
    context.problemStatement,
    loadUseCases().filter((uc) => sectorMatches(uc, sector || 'All')),
  );
  if (!primary) {
    return false;
  }

  const gateInput: UseCaseGateInput = {
    sector: sector || 'All',
    readinessLevel,
    problemStatement: context.problemStatement,
    conversation: context.conversation,
    evidence: context.evidence ?? [],
  };

  return !passesEvidenceGate(primary, gateInput);
}
