import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { getOrCreateSession, updateSession } from '../memory/sessionManager';
import { fetchEvidenceContext } from './agent-session';
import { scoreDimensions, determineReadinessLevel } from '../scoring/scoringEngine';
import { generateAssessmentOutput } from '../output/outputGenerator';
import { DimensionNames } from '../types';

export const getEvidenceContextTool = tool(
  async ({ sessionId }) => {
    const evidence = await fetchEvidenceContext(sessionId);
    return JSON.stringify(evidence);
  },
  {
    name: 'get_evidence_context',
    description: 'Retrieve evidence extracted from the user\'s uploaded documents.',
    schema: z.object({
      sessionId: z.string().describe('The ID of the current session.'),
    }),
  }
);

export const recordDimensionSignalTool = tool(
  async ({ sessionId, dimension, score }) => {
    const session = await getOrCreateSession(sessionId);
    const scores = { ...(session.dimensionScores || {}), [dimension]: score };
    await updateSession(sessionId, { dimensionScores: scores as any });
    return `Recorded score ${score} for dimension ${dimension}`;
  },
  {
    name: 'record_dimension_signal',
    description: 'Record a score (0, 1, or 2) for a specific readiness dimension based on the conversation.',
    schema: z.object({
      sessionId: z.string(),
      dimension: DimensionNames,
      score: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    }),
  }
);

export const flagInconsistencyTool = tool(
  async ({ sessionId, description }) => {
    return `Inconsistency flagged: ${description}. Please confront the user about this.`;
  },
  {
    name: 'flag_inconsistency',
    description: 'Flag an inconsistency between what the user said and the document evidence.',
    schema: z.object({
      sessionId: z.string(),
      description: z.string(),
    }),
  }
);

export const checkTopicCoverageTool = tool(
  async ({ sessionId, completedTopic }) => {
    const session = await getOrCreateSession(sessionId);
    let topics = session.topicsCompleted;
    if (completedTopic && !topics.includes(completedTopic)) {
      topics = [...topics, completedTopic];
      await updateSession(sessionId, { topicsCompleted: topics });
    }
    const allTopics = ['Data', 'Systems', 'Use case', 'People', 'Leadership'];
    const remaining = allTopics.filter(t => !topics.includes(t));
    return `Completed: ${topics.join(', ')}. Remaining: ${remaining.join(', ')}.`;
  },
  {
    name: 'check_topic_coverage',
    description: 'Mark a topic as completed and check which topics are remaining.',
    schema: z.object({
      sessionId: z.string(),
      completedTopic: z.enum(['Data', 'Systems', 'Use case', 'People', 'Leadership']).optional(),
    }),
  }
);

export const completeAssessmentTool = tool(
  async ({ sessionId }) => {
    const session = await getOrCreateSession(sessionId);
    const evidence = await fetchEvidenceContext(sessionId);
    
    // Fallback scoring for missing dimensions
    const finalScores = scoreDimensions(evidence, (session.dimensionScores as any) || {});
    const readinessLevel = determineReadinessLevel(finalScores);
    
    await updateSession(sessionId, { 
      dimensionScores: finalScores,
      readinessLevel,
      status: 'completed'
    });

    const sessionUpdated = await getOrCreateSession(sessionId);
    const result = await generateAssessmentOutput(sessionUpdated, evidence);
    
    return JSON.stringify({
      status: 'assessment_completed',
      result
    });
  },
  {
    name: 'complete_assessment',
    description: 'Call this when all 5 topics have been covered and you have recorded all dimension signals. This will compute the final readiness score and generate the advisory report.',
    schema: z.object({
      sessionId: z.string(),
    }),
  }
);

export const ALL_TOOLS = [
  getEvidenceContextTool,
  recordDimensionSignalTool,
  flagInconsistencyTool,
  checkTopicCoverageTool,
  completeAssessmentTool,
];
