import type { AssessmentSession, EvidenceRecord, SessionEvidenceItem } from '../types';
import { DIMENSION_LABELS } from '../scoring/dimensionLabels';

export function buildSessionEvidence(
  session: AssessmentSession,
  evidence: EvidenceRecord[],
): SessionEvidenceItem[] {
  const items: SessionEvidenceItem[] = [];

  for (const record of evidence) {
    items.push({
      dimension: DIMENSION_LABELS[record.dimension],
      source: record.source,
      text: record.agentInterpretation || record.extractedText,
    });
  }

  for (const turn of session.conversationHistory) {
    if (turn.role === 'user' && turn.content.trim()) {
      items.push({
        source: 'CONVERSATION',
        text: turn.content.trim(),
      });
    }
  }

  return items;
}
