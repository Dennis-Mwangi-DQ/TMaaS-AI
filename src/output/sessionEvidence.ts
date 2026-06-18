import type { AssessmentSession, EvidenceRecord, SessionEvidenceItem } from '../types';
import { DIMENSION_LABELS } from '../scoring/dimensionLabels';

export function buildSessionEvidence(
  session: AssessmentSession,
  evidence: EvidenceRecord[],
): SessionEvidenceItem[] {
  const items: SessionEvidenceItem[] = [];
  const seen = new Set<string>();

  for (const record of evidence) {
    const text = (record.agentInterpretation || record.extractedText).trim();
    if (!text) {
      continue;
    }
    const key = `${record.dimension}:${record.source}:${text}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push({
      dimension: DIMENSION_LABELS[record.dimension],
      source: record.source,
      text,
    });
  }

  if (session.primaryUseCase) {
    items.unshift({
      dimension: 'Use Case Specificity',
      source: 'CONVERSATION',
      text: `Primary business problem/use case: ${session.primaryUseCase}`,
    });
  }

  return items.slice(0, 20);
}
