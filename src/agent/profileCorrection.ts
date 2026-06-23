import type { AssessmentSession } from '../types';

const CORRECTABLE_FIELDS = ['sector', 'organisation'] as const;
type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

export function detectProfileCorrections(
  session: AssessmentSession,
  updates: Partial<Pick<AssessmentSession, CorrectableField>>,
): CorrectableField[] {
  const corrected: CorrectableField[] = [];

  for (const field of CORRECTABLE_FIELDS) {
    const nextValue = updates[field];
    const currentValue = session[field];
    if (nextValue && currentValue && nextValue !== currentValue) {
      corrected.push(field);
    }
  }

  return corrected;
}

export function buildCorrectionEvidenceNote(
  correctedFields: CorrectableField[],
  session: AssessmentSession,
  updates: Partial<Pick<AssessmentSession, CorrectableField>>,
): string {
  const parts = correctedFields.map((field) => {
    const from = session[field];
    const to = updates[field];
    return `${field} changed from "${from}" to "${to}"`;
  });

  return `Context corrected: ${parts.join('; ')}. Prior document evidence and dimension scores retained.`;
}
