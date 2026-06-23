import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { getOrCreateSession, updateSession } from '../memory/sessionManager';
import { fetchEvidenceContext } from './agent-session';
import { isAssessmentReadyForCompletion } from '../assessment/completeAssessment';
import { supabase } from '../db/supabaseClient';
import { canScoreAdoptionConditions } from '../assessment/adoptionGating';
import {
  buildCorrectionEvidenceNote,
  detectProfileCorrections,
} from './profileCorrection';
import { DimensionNames } from '../types';

const profileFields = {
  respondentName: z.string().min(1).optional(),
  organisation: z.string().min(1).optional(),
  organisationSize: z.string().min(1).optional(),
  sector: z.string().min(1).optional(),
  respondentRole: z.string().min(1).optional(),
  primaryUseCase: z.string().min(1).optional(),
};

const PROFILE_LABELS: Record<keyof typeof profileFields, string> = {
  respondentName: 'name',
  organisation: 'company',
  organisationSize: 'company size',
  sector: 'industry',
  respondentRole: 'role',
  primaryUseCase: 'primary business problem or use case',
};

function compactString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 500) : undefined;
}

export const getEvidenceContextTool = tool(
  async ({ sessionId }: { sessionId: string }) => {
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

export const updateSessionProfileTool = tool(
  async ({
    sessionId,
    respondentName,
    organisation,
    organisationSize,
    sector,
    respondentRole,
    primaryUseCase,
  }: {
    sessionId: string;
    respondentName?: string;
    organisation?: string;
    organisationSize?: string;
    sector?: string;
    respondentRole?: string;
    primaryUseCase?: string;
  }) => {
    const session = await getOrCreateSession(sessionId);
    const updates = {
      respondentName: compactString(respondentName),
      organisation: compactString(organisation),
      organisationSize: compactString(organisationSize),
      sector: compactString(sector),
      respondentRole: compactString(respondentRole),
      primaryUseCase: compactString(primaryUseCase),
    };
    const definedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value),
    );

    const correctedFields = detectProfileCorrections(session, definedUpdates);

    if (Object.keys(definedUpdates).length > 0) {
      await updateSession(sessionId, definedUpdates);
    }

    if (correctedFields.length > 0) {
      const note = buildCorrectionEvidenceNote(correctedFields, session, definedUpdates);
      await supabase.from('evidence_records').insert({
        session_id: sessionId,
        dimension: 'use_case_specificity',
        quality: 'STATED',
        extracted_text: note,
        agent_interpretation: note,
        source: 'CONVERSATION',
        document_name: null,
      });
    }

    const updatedSession = await getOrCreateSession(sessionId);
    const missing = Object.entries(PROFILE_LABELS)
      .filter(([key]) => !updatedSession[key as keyof typeof PROFILE_LABELS])
      .map(([, label]) => label);

    return JSON.stringify({
      status: 'profile_updated',
      captured: definedUpdates,
      missing,
      correctedFields,
      preservedScores: correctedFields.length > 0,
      preservedEvidence: correctedFields.length > 0,
    });
  },
  {
    name: 'update_session_profile',
    description: 'Capture basic respondent and organisation context: name, company, company size, industry, role, and primary business problem/use case.',
    schema: z.object({
      sessionId: z.string(),
      ...profileFields,
    }),
  },
);

export const recordDimensionSignalTool = tool(
  async ({
    sessionId,
    dimension,
    score,
    evidence,
  }: {
    sessionId: string;
    dimension: (typeof DimensionNames.options)[number];
    score: 0 | 1 | 2;
    evidence: string;
  }) => {
    const session = await getOrCreateSession(sessionId);

    if (dimension === 'adoption_conditions') {
      const adoptionCheck = canScoreAdoptionConditions(
        session.topicsCompleted,
        session.conversationHistory,
      );
      if (!adoptionCheck.allowed) {
        return adoptionCheck.reason ?? 'Adoption evidence required before scoring adoption_conditions.';
      }
    }

    const scores = { ...(session.dimensionScores || {}), [dimension]: score };
    await updateSession(sessionId, { dimensionScores: scores as any });

    const evidenceText = compactString(evidence) ?? 'Conversation evidence recorded by advisor.';

    const { data: existingRows } = await supabase
      .from('evidence_records')
      .select('id')
      .eq('session_id', sessionId)
      .eq('dimension', dimension)
      .eq('source', 'CONVERSATION')
      .limit(1);

    const existing = existingRows?.[0];

    if (existing?.id) {
      await supabase
        .from('evidence_records')
        .update({
          quality: 'STATED',
          extracted_text: evidenceText,
          agent_interpretation: evidenceText,
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('evidence_records').insert({
        session_id: sessionId,
        dimension,
        quality: 'STATED',
        extracted_text: evidenceText,
        agent_interpretation: evidenceText,
        source: 'CONVERSATION',
        document_name: null,
      });
    }

    return `Recorded score ${score} for dimension ${dimension}. Evidence: ${evidence}`;
  },
  {
    name: 'record_dimension_signal',
    description: 'Record a score (0, 1, or 2) for a specific readiness dimension. Requires explicit evidence from the respondent.',
    schema: z.object({
      sessionId: z.string(),
      dimension: DimensionNames,
      score: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      evidence: z.string().describe('Direct quote or paraphrase from the user supporting this score'),
    }),
  }
);

export const flagInconsistencyTool = tool(
  async ({ description }: { sessionId: string; description: string }) => {
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
  async ({
    sessionId,
    completedTopic,
  }: {
    sessionId: string;
    completedTopic?: 'Data' | 'Systems' | 'Use case' | 'People' | 'Leadership';
  }) => {
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
    description: 'Mark a topic as completed when you have sufficient depth (not just a mention) and check which topics remain.',
    schema: z.object({
      sessionId: z.string(),
      completedTopic: z.enum(['Data', 'Systems', 'Use case', 'People', 'Leadership']).optional(),
    }),
  }
);

export const completeAssessmentTool = tool(
  async ({ sessionId }: { sessionId: string }) => {
    const session = await getOrCreateSession(sessionId);
    if (!isAssessmentReadyForCompletion(session)) {
      return JSON.stringify({
        status: 'not_ready',
        message: 'Cover all five topics and record at least five dimension signals before completing.',
      });
    }

    return JSON.stringify({
      status: 'ready_for_report_generation',
    });
  },
  {
    name: 'complete_assessment',
    description: 'REQUIRED to finish the assessment interview. Call when all 5 topics are covered with sufficient depth and dimension signals are recorded. This marks the interview complete and triggers advisory document generation in the right panel.',
    schema: z.object({
      sessionId: z.string(),
    }),
  }
);

export const ALL_TOOLS = [
  getEvidenceContextTool,
  updateSessionProfileTool,
  recordDimensionSignalTool,
  flagInconsistencyTool,
  checkTopicCoverageTool,
  completeAssessmentTool,
];
