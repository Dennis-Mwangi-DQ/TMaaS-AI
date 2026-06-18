import { describe, expect, it } from 'vitest';
import {
  buildProvisionalAssessmentResponse,
  isProvisionalAssessmentRequest,
} from '../src/assessment/provisionalAssessment';
import type { AssessmentSession, EvidenceRecord } from '../src/types';

describe('Provisional Assessment', () => {
  it('reports provisional readiness, confidence, evidence, and missing data', () => {
    const session: AssessmentSession = {
      sessionId: '00000000-0000-4000-8000-000000000001',
      organisation: 'Acme Logistics',
      sector: 'Logistics',
      organisationSize: '250 employees',
      primaryUseCase: 'Route optimisation',
      documentsUploaded: [],
      conversationHistory: [],
      topicsCompleted: ['Use case', 'Data'],
      dimensionScores: {
        use_case_specificity: 2,
        data_accessibility: 1,
      },
      status: 'active',
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    };
    const evidence: EvidenceRecord[] = [
      {
        dimension: 'use_case_specificity',
        quality: 'STATED',
        extractedText: 'Route optimisation is the main problem.',
        agentInterpretation: 'The stated use case is route optimisation.',
        source: 'CONVERSATION',
      },
    ];

    const response = buildProvisionalAssessmentResponse(session, evidence);

    expect(response).toContain('Provisional readiness');
    expect(response).toContain('Confidence');
    expect(response).toContain('Confirmed evidence so far');
    expect(response).toContain('Missing evidence required for final scoring');
    expect(response).toContain('Leadership Sponsorship');
  });

  it('detects provisional requests without hijacking normal answers', () => {
    expect(isProvisionalAssessmentRequest('Where are we so far?')).toBe(true);
    expect(isProvisionalAssessmentRequest('What is our readiness score?')).toBe(true);
    expect(isProvisionalAssessmentRequest('I have low confidence in our data quality.')).toBe(false);
    expect(isProvisionalAssessmentRequest('Please begin my AI readiness assessment.')).toBe(false);
  });
});
