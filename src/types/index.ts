import { z } from 'zod';

export const DimensionScore = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type DimensionScore = z.infer<typeof DimensionScore>;

export const EvidenceQuality = z.enum(['DOCUMENTED', 'INFERRED', 'STATED', 'ABSENT']);
export type EvidenceQuality = z.infer<typeof EvidenceQuality>;

export const ReadinessLevel = z.enum([
  'Not Ready',
  'Foundation Needed',
  'Pilot Ready',
  'Scale Ready',
]);
export type ReadinessLevel = z.infer<typeof ReadinessLevel>;

export const DimensionNames = z.enum([
  'data_accessibility',
  'data_quality_history',
  'systems_integration',
  'use_case_specificity',
  'implementation_capability',
  'adoption_conditions',
  'leadership_sponsorship',
]);
export type DimensionName = z.infer<typeof DimensionNames>;

export const EvidenceRecordSchema = z.object({
  dimension: DimensionNames,
  quality: EvidenceQuality,
  extractedText: z.string(),
  agentInterpretation: z.string(),
  source: z.enum(['DOCUMENT', 'CONVERSATION']),
  documentName: z.string().optional(),
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const DimensionScoresSchema = z.record(DimensionNames, DimensionScore);
export type DimensionScores = z.infer<typeof DimensionScoresSchema>;

export const EvidenceQualityMapSchema = z.record(DimensionNames, EvidenceQuality);
export type EvidenceQualityMap = z.infer<typeof EvidenceQualityMapSchema>;

export const ConversationTurn = z.object({
  role: z.enum(['user', 'agent']),
  content: z.string(),
  timestamp: z.string(),
});
export type ConversationTurn = z.infer<typeof ConversationTurn>;

export const AssessmentSessionSchema = z.object({
  sessionId: z.string().uuid(),
  organisation: z.string().optional(),
  sector: z.string().optional(),
  respondentRole: z.string().optional(),
  documentsUploaded: z.array(z.string()).default([]),
  conversationHistory: z.array(ConversationTurn).default([]),
  topicsCompleted: z.array(z.string()).default([]),
  dimensionScores: DimensionScoresSchema.optional(),
  evidenceQuality: EvidenceQualityMapSchema.optional(),
  status: z.enum(['active', 'completed']).default('active'),
  readinessLevel: ReadinessLevel.optional(),
  pdfUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AssessmentSession = z.infer<typeof AssessmentSessionSchema>;

export const UseCaseEntrySchema = z.object({
  use_case_id: z.string(),
  name: z.string(),
  sectors: z.array(z.string()),
  min_readiness_level: ReadinessLevel,
  description: z.string(),
  value_statement: z.string(),
  prerequisite: z.string(),
  implementation_complexity: z.string(),
  cost_band_indicative: z.string(),
  dq_notes: z.string().optional(),
});
export type UseCaseEntry = z.infer<typeof UseCaseEntrySchema>;

export const BlockerSchema = z.object({
  title: z.string(),
  description: z.string(),
});
export type Blocker = z.infer<typeof BlockerSchema>;

export const ExecutiveSummarySchema = z.object({
  primaryStrength: z.string(),
  primaryGap: z.string(),
});
export type ExecutiveSummary = z.infer<typeof ExecutiveSummarySchema>;

export const DimensionAnalysisSchema = z.object({
  dimension: DimensionNames,
  evidence: z.string(),
  gaps: z.string(),
  deploymentImpact: z.string(),
  recommendedActions: z.array(z.string()),
  confidence: z.enum(['Low', 'Medium', 'High']).optional(),
});
export type DimensionAnalysis = z.infer<typeof DimensionAnalysisSchema>;

export const DetailedBlockerSchema = z.object({
  title: z.string(),
  affectedDimensions: z.array(z.string()),
  severity: z.string(),
  rootCause: z.string(),
  businessImpact: z.string(),
  resolutionPathway: z.string(),
  dependencies: z.string(),
});
export type DetailedBlocker = z.infer<typeof DetailedBlockerSchema>;

export const UseCaseDetailSchema = z.object({
  description: z.string(),
  businessRationale: z.string(),
  dataRequirements: z.string(),
  integrationPoints: z.string(),
  keyRisks: z.array(z.string()),
  sequencing: z.string(),
  vendorNote: z.string(),
});
export type UseCaseDetail = z.infer<typeof UseCaseDetailSchema>;

export const RoadmapItemSchema = z.object({
  horizon: z.enum(['Immediate', 'Foundation', 'Deployment']),
  timeline: z.string(),
  action: z.string(),
  owner: z.string(),
});
export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;

export const RiskItemSchema = z.object({
  risk: z.string(),
  likelihood: z.string(),
  impact: z.string(),
  mitigation: z.string(),
});
export type RiskItem = z.infer<typeof RiskItemSchema>;

export const NextStepSchema = z.object({
  label: z.string(),
  timeframe: z.string(),
  action: z.string(),
});
export type NextStep = z.infer<typeof NextStepSchema>;

export const SessionEvidenceItemSchema = z.object({
  dimension: z.string().optional(),
  source: z.enum(['DOCUMENT', 'CONVERSATION']),
  text: z.string(),
});
export type SessionEvidenceItem = z.infer<typeof SessionEvidenceItemSchema>;

export const ExtendedReportSchema = z.object({
  executiveSummary: ExecutiveSummarySchema,
  dimensionAnalyses: z.array(DimensionAnalysisSchema),
  detailedBlockers: z.array(DetailedBlockerSchema),
  useCaseDetails: z.array(UseCaseDetailSchema),
  roadmap: z.array(RoadmapItemSchema),
  assumptions: z.array(z.string()),
  risks: z.array(RiskItemSchema),
  constraints: z.string(),
  nextSteps: z.array(NextStepSchema),
  sessionEvidence: z.array(SessionEvidenceItemSchema),
  findings: z.object({
    believed: z.array(z.string()),
    uncertain: z.array(z.string()),
    biggestRisk: z.string(),
    recommendedNextStep: z.string(),
  }).optional(),
});
export type ExtendedReport = z.infer<typeof ExtendedReportSchema>;

export const AssessmentResultSchema = z.object({
  readinessLevel: ReadinessLevel,
  narrative: z.string(),
  blockers: z.array(BlockerSchema),
  useCases: z.array(
    z.object({
      useCase: UseCaseEntrySchema,
      rationale: z.string(),
      details: UseCaseDetailSchema.optional(),
    })
  ),
  firstAction: z.string(),
  extendedReport: ExtendedReportSchema.optional(),
});
export type AssessmentResult = z.infer<typeof AssessmentResultSchema>;

export const ChatRequest = z.object({
  message: z.string().min(1),
  sessionId: z.string().uuid().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
