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

export const AssessmentResultSchema = z.object({
  readinessLevel: ReadinessLevel,
  narrative: z.string(),
  blockers: z.array(BlockerSchema),
  useCases: z.array(
    z.object({
      useCase: UseCaseEntrySchema,
      rationale: z.string(),
    })
  ),
  firstAction: z.string(),
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
