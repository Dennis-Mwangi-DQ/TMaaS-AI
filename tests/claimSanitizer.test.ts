import { describe, it, expect } from 'vitest';
import {
  sanitizeText,
  sanitizeAssessmentResult,
  INDICATIVE_LABEL,
  REMOVED_CLAIM,
} from '../src/output/claimSanitizer';
import type { AssessmentResult, AssessmentSession, EvidenceRecord } from '../src/types';

const baseSession: AssessmentSession = {
  sessionId: '00000000-0000-4000-8000-000000000001',
  documentsUploaded: [],
  conversationHistory: [],
  topicsCompleted: [],
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('claimSanitizer', () => {
  it('strips unsupported ROI and currency claims', () => {
    const corpus = 'no financial figures here';
    const input = 'Expected 15% ROI and QAR 50,000 savings within 8 weeks.';
    const output = sanitizeText(input, corpus);

    expect(output).not.toContain('15% ROI');
    expect(output).not.toContain('QAR 50,000');
    expect(output).toContain(REMOVED_CLAIM);
  });

  it('preserves figures that appear in evidence corpus', () => {
    const evidence: EvidenceRecord[] = [{
      dimension: 'data_quality_history',
      quality: 'DOCUMENTED',
      extractedText: 'Historical sales data shows 15% seasonal variance.',
      agentInterpretation: '15% seasonal variance documented.',
      source: 'DOCUMENT',
      documentName: 'report.pdf',
    }];
    const session: AssessmentSession = {
      ...baseSession,
      conversationHistory: [{
        role: 'user',
        content: 'We see 15% seasonal variance in demand.',
        timestamp: '2026-01-01T00:00:00.000Z',
      }],
    };

    const result = sanitizeAssessmentResult({
      readinessLevel: 'Foundation Needed',
      narrative: 'Demand shows 15% seasonal variance based on uploaded evidence.',
      blockers: [],
      useCases: [],
      firstAction: 'Validate data pipeline.',
    }, evidence, session);

    expect(result.narrative).toContain('15%');
  });

  it('relabels unsupported cost bands as indicative benchmark', () => {
    const output = sanitizeText('Implementation cost QAR 80K–200K.', '');
    expect(output).toContain(INDICATIVE_LABEL);
  });

  it('sanitizes vendor references not in corpus', () => {
    const output = sanitizeText('Deploy using Salesforce CRM integration.', '');
    expect(output).not.toContain('Salesforce');
    expect(output).toContain('suitable vendor');
  });

  it('walks nested extended report fields', () => {
    const result = sanitizeAssessmentResult({
      readinessLevel: 'Pilot Ready',
      narrative: 'Ready for pilot with 20% ROI expected.',
      blockers: [{ title: 'Gap', description: 'QAR 100,000 budget needed.' }],
      useCases: [],
      firstAction: 'Start scoping.',
      extendedReport: {
        executiveSummary: { primaryStrength: 'Data', primaryGap: 'Systems' },
        dimensionAnalyses: [],
        detailedBlockers: [],
        useCaseDetails: [],
        roadmap: [],
        assumptions: ['15% ROI assumed'],
        risks: [{ risk: 'Vendor lock-in with SAP', likelihood: 'Low', impact: 'Medium', mitigation: 'Evaluate alternatives' }],
        constraints: 'Single session only.',
        nextSteps: [],
        sessionEvidence: [],
      },
    }, [], baseSession);

    expect(result.extendedReport?.assumptions[0]).toContain(REMOVED_CLAIM);
    expect(result.blockers[0]?.description).toContain(INDICATIVE_LABEL);
  });
});
