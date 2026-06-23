import type {
  AssessmentSession,
  DimensionName,
  DimensionScores,
  EvidenceRecord,
  ReadinessLevel,
} from '../types';
import { determineReadinessLevel } from '../scoring/scoringEngine';
import {
  DIMENSION_LABELS,
  DIMENSION_ORDER,
  scoreStatusLabel,
  totalDimensionScore,
} from '../scoring/dimensionLabels';

const ASSESSMENT_TOPICS = ['Data', 'Systems', 'Use case', 'People', 'Leadership'];

const PROFILE_REQUIREMENTS: Array<{
  key: keyof Pick<
    AssessmentSession,
    | 'respondentName'
    | 'organisation'
    | 'organisationSize'
    | 'sector'
    | 'respondentRole'
    | 'primaryUseCase'
  >;
  label: string;
}> = [
  { key: 'respondentName', label: 'respondent name' },
  { key: 'organisation', label: 'company name' },
  { key: 'organisationSize', label: 'company size' },
  { key: 'sector', label: 'industry/sector' },
  { key: 'respondentRole', label: 'respondent role' },
  { key: 'primaryUseCase', label: 'primary business problem or use case' },
];

function hasScore(
  scores: Partial<Record<DimensionName, number>>,
  dimension: DimensionName,
): boolean {
  return scores[dimension] === 0 || scores[dimension] === 1 || scores[dimension] === 2;
}

function projectedScores(
  scores: Partial<Record<DimensionName, number>>,
): DimensionScores {
  return Object.fromEntries(
    DIMENSION_ORDER.map((dimension) => [
      dimension,
      hasScore(scores, dimension) ? scores[dimension] : 1,
    ]),
  ) as DimensionScores;
}

function confidenceLabel(scoredCount: number, topicCount: number): 'Low' | 'Medium' | 'High' {
  if (scoredCount >= 6 && topicCount >= 5) {
    return 'High';
  }
  if (scoredCount >= 4 && topicCount >= 3) {
    return 'Medium';
  }
  return 'Low';
}

function evidenceForDimension(
  dimension: DimensionName,
  evidence: EvidenceRecord[],
): EvidenceRecord | undefined {
  const matches = evidence.filter((record) => record.dimension === dimension);
  return (
    matches.find((record) => record.source === 'CONVERSATION') ??
    matches.find((record) => record.quality === 'DOCUMENTED') ??
    matches[0]
  );
}

function formatEvidenceLine(
  dimension: DimensionName,
  score: 0 | 1 | 2,
  evidence: EvidenceRecord[],
): string {
  const record = evidenceForDimension(dimension, evidence);
  const basis = record?.agentInterpretation || record?.extractedText || 'Score recorded; supporting detail needs validation.';
  const source = record ? record.source.toLowerCase() : 'session';
  return `- **${DIMENSION_LABELS[dimension]}:** ${score}/2 (${scoreStatusLabel(score)}) - ${basis} [${source}]`;
}

export function isProvisionalAssessmentRequest(message: string): boolean {
  const lower = message.toLowerCase();
  if (/\b(start|begin|kick off|use the documents|use my uploaded)\b/.test(lower)) {
    return false;
  }
  if (/\b(download|pdf|full report|final report|complete report)\b/.test(lower)) {
    return false;
  }
  if (/\b(provisional|early read|initial read|rough score|so far|where (?:are|am) (?:we|i))\b/.test(lower)) {
    return true;
  }
  const asksForAssessment =
    lower.includes('?') ||
    /\b(what|where|how|give|show|tell|can|could|please)\b/.test(lower);
  return asksForAssessment && /\b(readiness level|readiness score|score|confidence)\b/.test(lower);
}

export function buildProvisionalAssessmentResponse(
  session: AssessmentSession,
  evidence: EvidenceRecord[],
): string {
  const scores = (session.dimensionScores ?? {}) as Partial<Record<DimensionName, number>>;
  const scoredDimensions = DIMENSION_ORDER.filter((dimension) => hasScore(scores, dimension));
  const missingDimensions = DIMENSION_ORDER.filter((dimension) => !hasScore(scores, dimension));
  const completedTopics = session.topicsCompleted.length;
  const missingTopics = ASSESSMENT_TOPICS.filter(
    (topic) => !session.topicsCompleted.includes(topic),
  );
  const missingProfile = PROFILE_REQUIREMENTS.filter(({ key }) => !session[key])
    .map(({ label }) => label);

  if (scoredDimensions.length === 0) {
    return [
      '## Provisional Assessment',
      '',
      '**Provisional readiness:** Too early to classify',
      '**Confidence:** Low',
      '',
      'I do not have enough scored evidence yet to make a meaningful readiness call.',
      '',
      '**Missing evidence required for final scoring:**',
      ...[
        ...missingProfile.map((item) => `- Basic profile: ${item}`),
        ...ASSESSMENT_TOPICS.map((topic) => `- ${topic} evidence`),
      ],
      '',
      '**Assumption control:** I am not treating missing dimensions as strengths. They remain unknown until confirmed.',
    ].join('\n');
  }

  const correctionNote = evidence.find((record) =>
    record.agentInterpretation.toLowerCase().includes('context corrected'),
  );

  const projected = projectedScores(scores);
  const readiness = determineReadinessLevel(projected);
  const confidence = confidenceLabel(scoredDimensions.length, completedTopics);
  const total = totalDimensionScore(projected);
  const maxScore = DIMENSION_ORDER.length * 2;

  const confirmedLines = scoredDimensions.map((dimension) =>
    formatEvidenceLine(dimension, scores[dimension] as 0 | 1 | 2, evidence),
  );
  const missingLines = [
    ...missingProfile.map((item) => `- Basic profile: ${item}`),
    ...missingTopics.map((topic) => `- Topic: ${topic}`),
    ...missingDimensions.map((dimension) => `- Dimension: ${DIMENSION_LABELS[dimension]}`),
  ];

  return [
    '## Provisional Assessment',
    '',
    `**Provisional readiness:** ${readiness} (${total}/${maxScore}, unscored dimensions treated as partial until verified)`,
    `**Confidence:** ${confidence}`,
    `**Evidence coverage:** ${scoredDimensions.length}/7 dimensions scored; ${completedTopics}/5 topics complete.`,
    '',
    ...(correctionNote
      ? ['**Context note:** Prior scoring retained; only corrected profile fields were updated.', '']
      : []),
    '**Confirmed evidence so far:**',
    ...confirmedLines,
    '',
    '**Missing evidence required for final scoring:**',
    ...(missingLines.length ? missingLines : ['- No major evidence gaps remain; final report generation is available.']),
    '',
    '**Assumption control:** The provisional level is not a final score. Missing or inferred areas are not counted as confirmed strengths, and any sector, cost, ROI, volume, or legal claim must be validated before it appears as a recommendation.',
  ].join('\n');
}
