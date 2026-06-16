import { fetchEvidenceContext } from '../agent/agent-session';
import { getOrCreateSession, updateSession } from '../memory/sessionManager';
import { scoreDimensions, determineReadinessLevel } from '../scoring/scoringEngine';
import { fetchAssessmentResult } from '../output/assessmentResultStore';
import { generateAssessmentOutputWithFallback } from '../output/outputGenerator';
import type { AssessmentResult } from '../types';

const ASSESSMENT_TOPICS = ['Data', 'Systems', 'Use case', 'People', 'Leadership'];

export function isAssessmentReadyForCompletion(session: {
  topicsCompleted: string[];
  dimensionScores?: Record<string, number>;
}): boolean {
  const topicsDone = ASSESSMENT_TOPICS.every((topic) =>
    session.topicsCompleted.includes(topic),
  );
  const scoredDimensions = Object.keys(session.dimensionScores ?? {}).length;
  return topicsDone && scoredDimensions >= 5;
}

export async function runCompleteAssessment(
  sessionId: string,
): Promise<AssessmentResult> {
  const existing = await fetchAssessmentResult(sessionId);
  if (existing) {
    return existing;
  }

  const session = await getOrCreateSession(sessionId);
  const evidence = await fetchEvidenceContext(sessionId);
  const finalScores = scoreDimensions(
    evidence,
    (session.dimensionScores as Record<string, number>) || {},
  );
  const readinessLevel = determineReadinessLevel(finalScores);

  const sessionForOutput = {
    ...session,
    dimensionScores: finalScores,
    readinessLevel,
  };

  const result = await generateAssessmentOutputWithFallback(
    sessionForOutput,
    evidence,
  );

  await updateSession(sessionId, {
    dimensionScores: finalScores,
    readinessLevel,
    status: 'completed',
  });

  return result;
}
