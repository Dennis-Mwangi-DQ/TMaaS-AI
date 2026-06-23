import { describe, it, expect } from 'vitest';
import { matchUseCases, passesEvidenceGate, loadUseCases } from '../src/usecases/useCaseMatcher';
import type { EvidenceRecord } from '../src/types';

const demandForecastEvidence: EvidenceRecord[] = [
  {
    dimension: 'data_quality_history',
    quality: 'DOCUMENTED',
    extractedText: '12 months of historical sales data by SKU.',
    agentInterpretation: 'Historical sales data available for forecasting.',
    source: 'DOCUMENT',
    documentName: 'noorfresh.pdf',
  },
  {
    dimension: 'data_accessibility',
    quality: 'STATED',
    extractedText: 'Sales and inventory data in ERP exports.',
    agentInterpretation: 'Sales data accessible via ERP.',
    source: 'CONVERSATION',
  },
];

const routeEvidence: EvidenceRecord[] = [
  {
    dimension: 'systems_integration',
    quality: 'DOCUMENTED',
    extractedText: 'GPS telematics and fleet management integration.',
    agentInterpretation: 'Fleet GPS data available.',
    source: 'DOCUMENT',
    documentName: 'logistics.pdf',
  },
  {
    dimension: 'data_accessibility',
    quality: 'STATED',
    extractedText: 'Order and delivery history for 8 months.',
    agentInterpretation: 'Delivery history accessible.',
    source: 'CONVERSATION',
  },
];

describe('Use Case Matcher', () => {
  it('Matches Retail use cases for Pilot Ready when evidence supports them', () => {
    const cases = matchUseCases('Retail', 'Pilot Ready', {
      problemStatement: 'Improve product recommendations using customer purchase history.',
      conversation: 'We have customer purchase history and CRM integration.',
      evidence: [
        {
          dimension: 'data_quality_history',
          quality: 'DOCUMENTED',
          extractedText: 'Customer purchase history in CRM.',
          agentInterpretation: 'Historical customer data available.',
          source: 'DOCUMENT',
        },
        {
          dimension: 'systems_integration',
          quality: 'STATED',
          extractedText: 'CRM integration exists.',
          agentInterpretation: 'CRM connected.',
          source: 'CONVERSATION',
        },
      ],
    });
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.some(c => c.sectors.includes('Retail') || c.sectors.includes('All'))).toBe(true);
  });

  it('Excludes Scale Ready use cases when Not Ready', () => {
    const cases = matchUseCases('Retail', 'Not Ready', {
      problemStatement: 'Visual quality inspection on production line.',
      conversation: 'We need camera infrastructure and labelled images.',
      evidence: [
        {
          dimension: 'implementation_capability',
          quality: 'STATED',
          extractedText: 'No camera infrastructure yet.',
          agentInterpretation: 'Camera prerequisite missing.',
          source: 'CONVERSATION',
        },
      ],
    });
    expect(cases.some(c => c.min_readiness_level === 'Scale Ready')).toBe(false);
  });

  it('Ranks route optimisation first for a logistics route problem', () => {
    const cases = matchUseCases('Logistics', 'Foundation Needed', {
      problemStatement: 'We need route optimisation for delivery routes, fleet utilisation, and on-time delivery.',
      conversation: 'Fleet GPS telematics and delivery history are available.',
      evidence: routeEvidence,
      maxResults: 1,
    });

    expect(cases[0]?.use_case_id).toBe('UC-LOG-001');
  });

  it('Pins demand forecasting for NoorFresh-style problem and excludes document classification', () => {
    const cases = matchUseCases('Food & Beverage', 'Foundation Needed', {
      problemStatement: 'Demand forecasting for fresh produce inventory and sales planning.',
      conversation: 'We have historical sales data and seasonal demand patterns.',
      evidence: demandForecastEvidence,
      maxResults: 2,
    });

    expect(cases[0]?.use_case_id).toBe('UC-MFG-001');
    expect(cases.some((c) => c.use_case_id === 'UC-XS-002')).toBe(false);
  });

  it('Returns primary use case only when no evidence supports unrelated alternatives', () => {
    const cases = matchUseCases('Food & Beverage', 'Foundation Needed', {
      problemStatement: 'Demand forecasting for inventory.',
      conversation: 'We want demand forecasting.',
      evidence: [],
      maxResults: 2,
    });

    expect(cases).toHaveLength(1);
    expect(cases[0]?.use_case_id).toBe('UC-MFG-001');
  });

  it('passesEvidenceGate requires all five criteria', () => {
    const demandForecast = loadUseCases().find((uc) => uc.use_case_id === 'UC-MFG-001');
    expect(demandForecast).toBeDefined();

    expect(passesEvidenceGate(demandForecast!, {
      sector: 'Food & Beverage',
      readinessLevel: 'Foundation Needed',
      problemStatement: 'Demand forecasting for inventory.',
      conversation: 'Historical sales data available.',
      evidence: demandForecastEvidence,
    })).toBe(true);

    expect(passesEvidenceGate(demandForecast!, {
      sector: 'Food & Beverage',
      readinessLevel: 'Foundation Needed',
      problemStatement: 'Demand forecasting for inventory.',
      conversation: 'Historical sales data available.',
      evidence: [],
    })).toBe(false);
  });
});
