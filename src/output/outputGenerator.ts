import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { createDeepSeekLlm } from '../lib/llmClient';
import { invokeJson } from '../lib/llmJson';
import type { AssessmentSession, AssessmentResult, EvidenceRecord } from '../types';
import { DimensionNames } from '../types';
import { matchUseCases, primaryUseCaseNeedsValidation } from '../usecases/useCaseMatcher';
import { saveAssessmentResult } from './assessmentResultStore';
import { buildSessionEvidence } from './sessionEvidence';
import { sanitizeAssessmentResult } from './claimSanitizer';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '../scoring/dimensionLabels';

function computeStrengthAndGap(session: AssessmentSession) {
  const scores = session.dimensionScores ?? {};
  let bestKey = DIMENSION_ORDER[0]!;
  let worstKey = DIMENSION_ORDER[0]!;
  let bestScore = scores[bestKey] ?? 0;
  let worstScore = scores[worstKey] ?? 0;

  for (const key of DIMENSION_ORDER) {
    const score = scores[key] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
    if (score < worstScore) {
      worstScore = score;
      worstKey = key;
    }
  }

  return {
    primaryStrength: DIMENSION_LABELS[bestKey],
    primaryGap: DIMENSION_LABELS[worstKey],
  };
}

const NarrativeOutputSchema = z.object({
  narrative: z.string(),
  blockers: z.array(z.object({
    title: z.string(),
    description: z.string(),
  })).max(3),
  executiveSummary: z.object({
    primaryStrength: z.string(),
    primaryGap: z.string(),
  }),
  assumptions: z.array(z.string()).min(1).max(5),
  findings: z.object({
    believed: z.array(z.string()).min(1),
    uncertain: z.array(z.string()).min(1),
    biggestRisk: z.string(),
    recommendedNextStep: z.string(),
  }),
});

const BasicNarrativeOutputSchema = z.object({
  narrative: z.string(),
  blockers: z.array(z.object({
    title: z.string(),
    description: z.string(),
  })).max(3),
});

const DimensionAnalysisOutputSchema = z.object({
  dimensionAnalyses: z.array(z.object({
    dimension: DimensionNames,
    evidence: z.string(),
    gaps: z.string(),
    deploymentImpact: z.string(),
    recommendedActions: z.array(z.string()).min(1).max(3),
    confidence: z.enum(['Low', 'Medium', 'High']).optional(),
  })).min(1).max(7),
});

const DetailedBlockersOutputSchema = z.object({
  detailedBlockers: z.array(z.object({
    title: z.string(),
    affectedDimensions: z.array(z.string()).min(1),
    severity: z.string(),
    rootCause: z.string(),
    businessImpact: z.string(),
    resolutionPathway: z.string(),
    dependencies: z.string(),
  })).max(3),
});

const RoadmapOutputSchema = z.object({
  roadmap: z.array(z.object({
    horizon: z.enum(['Immediate', 'Foundation', 'Deployment']),
    timeline: z.string(),
    action: z.string(),
    owner: z.string(),
  })).min(1).max(3),
  risks: z.array(z.object({
    risk: z.string(),
    likelihood: z.string(),
    impact: z.string(),
    mitigation: z.string(),
  })).min(1).max(2),
  nextSteps: z.array(z.object({
    label: z.string(),
    timeframe: z.string(),
    action: z.string(),
  })).min(1).max(2),
  constraints: z.string(),
  firstAction: z.string(),
});

const UseCaseDetailsOutputSchema = z.object({
  useCaseDetails: z.array(z.object({
    rationale: z.string(),
    description: z.string(),
    businessRationale: z.string(),
    dataRequirements: z.string(),
    integrationPoints: z.string(),
    keyRisks: z.array(z.string()).min(1).max(3),
    sequencing: z.string(),
    vendorNote: z.string(),
  })),
});

const FirstActionSchema = z.object({
  firstAction: z.string(),
});

function loadPrompt(filename: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'prompts', filename), 'utf-8');
}

function fillPrompt(
  template: string,
  vars: Record<string, string>,
): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function buildContextVars(
  session: AssessmentSession,
  evidence: EvidenceRecord[],
): Record<string, string> {
  const conversation = session.conversationHistory
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join('\n');

  return {
    READINESS_LEVEL: session.readinessLevel || 'Unknown',
    RESPONDENT_NAME: session.respondentName || 'Not specified',
    ORGANISATION: session.organisation || 'Not specified',
    ORGANISATION_SIZE: session.organisationSize || 'Not specified',
    SECTOR: session.sector || 'Not specified',
    RESPONDENT_ROLE: session.respondentRole || 'Not specified',
    PRIMARY_USE_CASE: session.primaryUseCase || 'Not specified',
    DIMENSION_SCORES: JSON.stringify(session.dimensionScores, null, 2),
    EVIDENCE: JSON.stringify(
      evidence.map((e) => ({
        dimension: e.dimension,
        quality: e.quality,
        interpretation: e.agentInterpretation,
        source: e.source,
      })),
      null,
      2,
    ),
    CONVERSATION: conversation || 'No conversation recorded.',
  };
}

function jsonInstruction(schemaDescription: string): string {
  return `

Return ONLY valid JSON. Do not use markdown fences, comments, or prose.
The JSON shape must be:
${schemaDescription}
Do not use emojis.`;
}

function mapSummaryBlockersToDetailed(
  blockers: Array<{ title: string; description: string }>,
) {
  return blockers.map((blocker) => ({
    title: blocker.title,
    affectedDimensions: ['Multiple dimensions'],
    severity: 'High',
    rootCause: blocker.description,
    businessImpact: blocker.description,
    resolutionPathway: 'Address during the recommended first 30-day action.',
    dependencies: 'None identified.',
  }));
}

function buildFallbackDimensionAnalyses(
  session: AssessmentSession,
  evidence: EvidenceRecord[],
) {
  const scores = session.dimensionScores ?? {};
  return DIMENSION_ORDER.map((dimension) => {
    const matches = evidence.filter((record) => record.dimension === dimension);
    const match =
      matches.find((record) => record.source === 'CONVERSATION') ??
      matches.find((record) => record.quality === 'DOCUMENTED') ??
      matches[0];
    const score = scores[dimension] ?? 0;
    return {
      dimension,
      evidence: match?.agentInterpretation || 'Limited explicit evidence captured for this dimension.',
      gaps: score < 2
        ? 'Gaps remain before this dimension supports reliable AI delivery.'
        : 'No major gaps identified.',
      deploymentImpact: score === 0
        ? 'This dimension currently blocks most AI deployment paths.'
        : score === 1
          ? 'This dimension limits the reliability of AI outputs until improved.'
          : 'This dimension supports current AI deployment options.',
      recommendedActions: [
        `Review ${DIMENSION_LABELS[dimension]} with the accountable owner within 30 days.`,
      ],
      confidence: match ? 'Medium' as const : 'Low' as const,
    };
  });
}

async function generateFallbackAssessmentOutput(
  session: AssessmentSession,
  evidence: EvidenceRecord[],
): Promise<AssessmentResult> {
  const llm = createDeepSeekLlm({ temperature: 0.2 });
  const ctx = buildContextVars(session, evidence);
  const useCases = matchUseCases(session.sector || 'All', session.readinessLevel!, {
    problemStatement: session.primaryUseCase,
    conversation: ctx.CONVERSATION,
    evidence,
    maxResults: 2,
  });
  const sessionEvidence = buildSessionEvidence(session, evidence);

  const narrativePrompt = fillPrompt(loadPrompt('blocker_narrative.md'), ctx).concat(
    jsonInstruction(`{
  "narrative": "3-5 sentence readiness narrative",
  "blockers": [{ "title": "short title", "description": "specific description" }]
}
Include no more than 3 blockers.`),
  );

  const narrativeRes = await invokeJson(llm, narrativePrompt, BasicNarrativeOutputSchema);

  const firstActionPrompt = fillPrompt(
    fs.readFileSync(path.join(process.cwd(), 'prompts/first_action.md'), 'utf-8'),
    {
      READINESS_LEVEL: session.readinessLevel || 'Unknown',
      BLOCKERS: JSON.stringify(narrativeRes.blockers, null, 2),
    },
  ).concat(jsonInstruction('{ "firstAction": "single concrete 30-day action" }'));

  const actionRes = await invokeJson(llm, firstActionPrompt, FirstActionSchema);

  const result: AssessmentResult = {
    readinessLevel: session.readinessLevel!,
    narrative: narrativeRes.narrative,
    blockers: narrativeRes.blockers,
    useCases: useCases.map((uc) => ({
      useCase: uc,
      rationale: uc.value_statement,
    })),
    firstAction: actionRes.firstAction,
    extendedReport: {
      executiveSummary: computeStrengthAndGap(session),
      dimensionAnalyses: buildFallbackDimensionAnalyses(session, evidence),
      detailedBlockers: mapSummaryBlockersToDetailed(narrativeRes.blockers),
      useCaseDetails: useCases.map((uc) => ({
        rationale: uc.value_statement,
        description: uc.description,
        businessRationale: uc.value_statement,
        dataRequirements: uc.prerequisite,
        integrationPoints: 'To be confirmed during scoping.',
        keyRisks: ['Delivery risk until foundational gaps are addressed.'],
        sequencing: 'After immediate stabilisation actions.',
        vendorNote: 'Evaluate build vs buy during pilot scoping.',
      })),
      roadmap: [],
      assumptions: ['Assessment based on a single discovery session.'],
      risks: [],
      constraints: 'Full extended analysis could not be generated automatically; this is a condensed advisory.',
      nextSteps: [{
        label: 'Priority 1 Action (Days 1-7)',
        timeframe: 'Days 1-7',
        action: actionRes.firstAction,
      }],
      sessionEvidence,
      findings: {
        believed: [narrativeRes.narrative],
        uncertain: ['Some dimensions may need follow-up validation with system owners.'],
        biggestRisk: narrativeRes.blockers[0]?.title || 'Foundational gaps may block reliable AI delivery.',
        recommendedNextStep: actionRes.firstAction,
      },
    },
  };

  return sanitizeAssessmentResult(result, evidence, session);
}

export async function generateAssessmentOutput(
  session: AssessmentSession,
  evidence: EvidenceRecord[],
): Promise<AssessmentResult> {
  const llm = createDeepSeekLlm({ temperature: 0.2 });

  if (!session.readinessLevel || !session.dimensionScores) {
    throw new Error('Readiness level and dimension scores must be computed before generating output.');
  }

  const ctx = buildContextVars(session, evidence);
  const useCases = matchUseCases(session.sector || 'All', session.readinessLevel, {
    problemStatement: session.primaryUseCase,
    conversation: ctx.CONVERSATION,
    evidence,
    maxResults: 2,
  });
  const validationRequired = primaryUseCaseNeedsValidation(
    session.sector || 'All',
    session.readinessLevel,
    {
      problemStatement: session.primaryUseCase,
      conversation: ctx.CONVERSATION,
      evidence,
    },
  );
  const sessionEvidence = buildSessionEvidence(session, evidence);

  const narrativePrompt = fillPrompt(loadPrompt('blocker_narrative.md'), ctx).concat(
    jsonInstruction(`{
  "narrative": "3-5 sentence readiness narrative grounded in evidence",
  "blockers": [{ "title": "short title", "description": "specific description" }],
  "executiveSummary": { "primaryStrength": "...", "primaryGap": "..." },
  "assumptions": ["assumption 1", "..."],
  "findings": {
    "believed": ["what we believe is true"],
    "uncertain": ["what remains uncertain"],
    "biggestRisk": "single biggest risk",
    "recommendedNextStep": "concrete next step"
  }
}
Include no more than 3 blockers.`),
  );

  const narrativeRes = await invokeJson(llm, narrativePrompt, NarrativeOutputSchema);

  const dimensionRes = {
    dimensionAnalyses: buildFallbackDimensionAnalyses(session, evidence),
  };
  const detailedBlockersRes = {
    detailedBlockers: mapSummaryBlockersToDetailed(narrativeRes.blockers),
  };

  const useCasePrompt = fillPrompt(
    loadPrompt('use_case_details.md'),
    {
      ...ctx,
      USE_CASES: JSON.stringify(
        useCases.map((uc) => ({
          name: uc.name,
          description: uc.description,
          prerequisite: uc.prerequisite,
          dq_notes: uc.dq_notes,
          min_readiness_level: uc.min_readiness_level,
          complexity: uc.implementation_complexity,
          hasIndicativeCostBand: Boolean(uc.cost_band_indicative),
        })),
        null,
        2,
      ),
    },
  ).concat(
    jsonInstruction(`{
  "useCaseDetails": [
    {
      "rationale": "...",
      "description": "...",
      "businessRationale": "...",
      "dataRequirements": "...",
      "integrationPoints": "...",
      "keyRisks": ["risk 1"],
      "sequencing": "...",
      "vendorNote": "..."
    }
  ]
}
One entry per use case, same order as input.`),
  );

  const useCaseRes = await invokeJson(llm, useCasePrompt, UseCaseDetailsOutputSchema).catch((error) => {
    console.warn('Use case detail generation failed:', error);
    return {
      useCaseDetails: useCases.map((uc) => ({
        rationale: uc.value_statement,
        description: uc.description,
        businessRationale: uc.value_statement,
        dataRequirements: uc.prerequisite,
        integrationPoints: 'To be confirmed during scoping.',
        keyRisks: ['Delivery risk until foundational gaps are addressed.'],
        sequencing: 'After immediate stabilisation actions.',
        vendorNote: 'Evaluate build vs buy during pilot scoping.',
      })),
    };
  });

  const roadmapPrompt = fillPrompt(
    loadPrompt('roadmap_and_risks.md'),
    {
      ...ctx,
      DETAILED_BLOCKERS: JSON.stringify(detailedBlockersRes.detailedBlockers, null, 2),
    },
  ).concat(
    jsonInstruction(`{
  "roadmap": [
    { "horizon": "Immediate|Foundation|Deployment", "timeline": "Days 1-30", "action": "...", "owner": "Role/Team" }
  ],
  "risks": [{ "risk": "...", "likelihood": "High|Medium|Low", "impact": "High|Medium|Low", "mitigation": "..." }],
  "nextSteps": [{ "label": "Priority 1 Action (Days 1-7)", "timeframe": "Days 1-7", "action": "..." }],
  "constraints": "paragraph on assessment limitations",
  "firstAction": "single concrete 30-day action"
}
Provide as many roadmap and next-step items as evidence supports.`),
  );

  const roadmapRes = await invokeJson(llm, roadmapPrompt, RoadmapOutputSchema).catch(async (error) => {
    console.warn('Roadmap generation failed:', error);
    const firstActionPrompt = fillPrompt(
      fs.readFileSync(path.join(process.cwd(), 'prompts/first_action.md'), 'utf-8'),
      {
        READINESS_LEVEL: session.readinessLevel || 'Unknown',
        BLOCKERS: JSON.stringify(narrativeRes.blockers, null, 2),
      },
    ).concat(jsonInstruction('{ "firstAction": "single concrete 30-day action" }'));
    const actionRes = await invokeJson(llm, firstActionPrompt, FirstActionSchema);
    return {
      roadmap: [],
      risks: [],
      nextSteps: [{
        label: 'Priority 1 Action (Days 1-7)',
        timeframe: 'Days 1-7',
        action: actionRes.firstAction,
      }],
      constraints: 'Roadmap detail could not be fully generated automatically.',
      firstAction: actionRes.firstAction,
    };
  });

  const extendedReport = {
    executiveSummary: narrativeRes.executiveSummary,
    dimensionAnalyses: dimensionRes.dimensionAnalyses,
    detailedBlockers: detailedBlockersRes.detailedBlockers,
    useCaseDetails: useCaseRes.useCaseDetails,
    roadmap: roadmapRes.roadmap,
    assumptions: narrativeRes.assumptions,
    risks: roadmapRes.risks,
    constraints: roadmapRes.constraints,
    nextSteps: roadmapRes.nextSteps,
    sessionEvidence,
    findings: narrativeRes.findings,
  };

  const result: AssessmentResult = {
    readinessLevel: session.readinessLevel,
    narrative: narrativeRes.narrative,
    blockers: narrativeRes.blockers,
    useCases: useCases.map((uc, i) => ({
      useCase: uc,
      rationale: validationRequired && i === 0
        ? `${useCaseRes.useCaseDetails[i]?.rationale || uc.value_statement} (Validation required before this use case is confirmed viable.)`
        : useCaseRes.useCaseDetails[i]?.rationale || uc.value_statement,
      details: useCaseRes.useCaseDetails[i],
    })),
    firstAction: roadmapRes.firstAction,
    extendedReport,
  };

  const sanitized = sanitizeAssessmentResult(result, evidence, session);
  await saveAssessmentResult(session.sessionId, sanitized);
  return sanitized;
}

export async function generateAssessmentOutputWithFallback(
  session: AssessmentSession,
  evidence: EvidenceRecord[],
): Promise<AssessmentResult> {
  try {
    return await generateAssessmentOutput(session, evidence);
  } catch (error) {
    console.error('Full assessment output generation failed, using fallback:', error);
    const result = await generateFallbackAssessmentOutput(session, evidence);
    await saveAssessmentResult(session.sessionId, result);
    return result;
  }
}
