import { describe, it, expect } from 'vitest';
import {
  detectProfileCorrections,
  buildCorrectionEvidenceNote,
} from '../src/agent/profileCorrection';
import { buildProvisionalAssessmentResponse } from '../src/assessment/provisionalAssessment';
import type { AssessmentSession, EvidenceRecord } from '../src/types';

describe('contextCorrection', () => {
  it('detects sector and organisation corrections', () => {
    const session: AssessmentSession = {
      sessionId: '00000000-0000-4000-8000-000000000010',
      sector: 'Hospitality',
      organisation: 'Hotel A',
      documentsUploaded: [],
      conversationHistory: [],
      topicsCompleted: [],
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const corrected = detectProfileCorrections(session, {
      sector: 'Healthcare',
      organisation: 'Clinic B',
    });

    expect(corrected).toEqual(['sector', 'organisation']);
    expect(buildCorrectionEvidenceNote(corrected, session, {
      sector: 'Healthcare',
      organisation: 'Clinic B',
    })).toContain('Prior document evidence and dimension scores retained');
  });

  it('keeps provisional readiness when scores exist after correction evidence', () => {
    const session: AssessmentSession = {
      sessionId: '00000000-0000-4000-8000-000000000011',
      sector: 'Healthcare',
      documentsUploaded: ['pack.pdf'],
      conversationHistory: [],
      topicsCompleted: ['Data'],
      dimensionScores: {
        systems_integration: 1,
        data_accessibility: 1,
        data_quality_history: 1,
        use_case_specificity: 1,
        implementation_capability: 0,
        adoption_conditions: 0,
        leadership_sponsorship: 1,
      },
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const evidence: EvidenceRecord[] = [{
      dimension: 'use_case_specificity',
      quality: 'STATED',
      extractedText: 'Context corrected: sector changed from "Hospitality" to "Healthcare". Prior document evidence and dimension scores retained.',
      agentInterpretation: 'Context corrected: sector changed from "Hospitality" to "Healthcare". Prior document evidence and dimension scores retained.',
      source: 'CONVERSATION',
    }, {
      dimension: 'data_quality_history',
      quality: 'DOCUMENTED',
      extractedText: 'Documented sales history exists.',
      agentInterpretation: 'Documented sales history exists.',
      source: 'DOCUMENT',
      documentName: 'pack.pdf',
    }];

    const response = buildProvisionalAssessmentResponse(session, evidence);
    expect(response).not.toContain('Too early to classify');
    expect(response).toContain('Prior scoring retained');
  });
});
