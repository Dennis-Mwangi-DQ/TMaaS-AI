import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { buildReport } from '../src/report/reportBuilder';
import type { AssessmentResult, AssessmentSession, EvidenceRecord } from '../src/types';

function fixtureSession(): AssessmentSession {
  return {
    sessionId: '00000000-0000-4000-8000-000000000099',
    respondentName: 'Test Respondent',
    organisation: 'Fixture Org',
    organisationSize: '50-200',
    sector: 'Food & Beverage',
    respondentRole: 'Operations Director',
    primaryUseCase: 'Demand forecasting for fresh produce',
    documentsUploaded: ['fixture.pdf'],
    conversationHistory: [],
    topicsCompleted: ['Data', 'Systems', 'Use case', 'People', 'Leadership'],
    dimensionScores: {
      systems_integration: 1,
      data_accessibility: 1,
      data_quality_history: 2,
      use_case_specificity: 2,
      implementation_capability: 1,
      adoption_conditions: 1,
      leadership_sponsorship: 2,
    },
    status: 'completed',
    readinessLevel: 'Foundation Needed',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

function fixtureEvidence(): EvidenceRecord[] {
  return [{
    dimension: 'data_quality_history',
    quality: 'DOCUMENTED',
    extractedText: '12 months of historical sales data by SKU.',
    agentInterpretation: 'Historical sales data available.',
    source: 'DOCUMENT',
    documentName: 'fixture.pdf',
  }];
}

function fixtureResult(): AssessmentResult {
  return {
    readinessLevel: 'Foundation Needed',
    narrative: 'The organisation has a clear demand forecasting goal with usable historical sales data, but systems integration remains partial.',
    blockers: [{
      title: 'Systems integration gaps',
      description: 'ERP and inventory systems are not fully integrated for automated forecasting inputs.',
    }],
    useCases: [{
      useCase: {
        use_case_id: 'UC-MFG-001',
        name: 'AI demand forecasting',
        sectors: ['Food & Beverage'],
        min_readiness_level: 'Foundation Needed',
        description: 'Predicts product demand using historical sales.',
        value_statement: 'Supports inventory and production planning.',
        prerequisite: 'Historical sales data in queryable form.',
        implementation_complexity: 'Medium',
        cost_band_indicative: 'QAR 80K–200K implementation',
      },
      rationale: 'Matches the stated demand forecasting problem and available sales history.',
      details: {
        description: 'Forecast SKU-level demand for fresh produce.',
        businessRationale: 'Reduces waste and stockouts.',
        dataRequirements: '12+ months sales history.',
        integrationPoints: 'ERP and inventory exports.',
        keyRisks: ['Data continuity risk'],
        sequencing: 'Pilot after data validation.',
        vendorNote: 'Evaluate build vs buy during scoping.',
      },
    }],
    firstAction: 'Validate sales and inventory data exports with the ERP owner within 30 days.',
    extendedReport: {
      executiveSummary: {
        primaryStrength: 'Data Quality',
        primaryGap: 'Systems Integration',
      },
      dimensionAnalyses: [],
      detailedBlockers: [{
        title: 'Systems integration gaps',
        affectedDimensions: ['Systems Integration'],
        severity: 'High',
        rootCause: 'ERP and inventory systems are not fully integrated.',
        businessImpact: 'Manual exports slow forecasting cycles.',
        resolutionPathway: 'Map integration path with IT owner.',
        dependencies: 'ERP access',
      }],
      useCaseDetails: [],
      roadmap: [{
        horizon: 'Immediate',
        timeline: 'Days 1-30',
        action: 'Validate data exports.',
        owner: 'Operations',
      }],
      assumptions: ['Single discovery session only.'],
      risks: [{
        risk: 'Forecast accuracy limited by manual data pulls',
        likelihood: 'Medium',
        impact: 'High',
        mitigation: 'Prioritise ERP integration mapping.',
      }],
      constraints: 'No direct system access during assessment.',
      nextSteps: [{
        label: 'Priority 1 (Days 1-7)',
        timeframe: 'Days 1-7',
        action: 'Confirm ERP export fields with IT.',
      }],
      sessionEvidence: [
        { source: 'DOCUMENT', dimension: 'data_quality_history', text: '12 months of historical sales data by SKU.' },
        { source: 'DOCUMENT', dimension: 'data_accessibility', text: 'ERP exports available weekly for sales and inventory.' },
        { source: 'CONVERSATION', dimension: 'systems_integration', text: 'Inventory and ERP are partially integrated via manual CSV loads.' },
        { source: 'CONVERSATION', dimension: 'use_case_specificity', text: 'Primary goal is demand forecasting for fresh produce categories.' },
        { source: 'CONVERSATION', dimension: 'adoption_conditions', text: 'Store managers support forecasting pilots with training planned.' },
        { source: 'CONVERSATION', dimension: 'leadership_sponsorship', text: 'Operations director sponsors a bounded 90-day pilot.' },
      ],
      findings: {
        believed: ['Historical sales data exists.'],
        uncertain: ['Integration effort estimate'],
        biggestRisk: 'Systems integration gaps',
        recommendedNextStep: 'Validate data exports.',
      },
    },
  };
}

async function analyzePdf(buffer: Buffer) {
  const parsed = await pdfParse(buffer);
  const pages = parsed.text.split('\f').map((page) => page.trim()).filter(Boolean);
  const sparsePages = pages
    .map((text, index) => ({ index: index + 1, wordCount: text.split(/\s+/).filter(Boolean).length }))
    .filter((page) => page.wordCount < 50);

  return {
    pageCount: parsed.numpages,
    sparsePages,
  };
}

async function main() {
  const session = fixtureSession();
  const evidence = fixtureEvidence();
  const result = fixtureResult();
  const outDir = path.join(process.cwd(), 'tmp', 'pdf-verify');
  fs.mkdirSync(outDir, { recursive: true });

  const runs: Array<{ file: string; pageCount: number; sparsePages: { index: number; wordCount: number }[] }> = [];

  for (let i = 1; i <= 2; i += 1) {
    const buffer = await buildReport(result, session, evidence);
    const file = path.join(outDir, `fixture-run-${i}.pdf`);
    fs.writeFileSync(file, buffer);
    const analysis = await analyzePdf(buffer);
    runs.push({ file, ...analysis });
  }

  const pageCounts = runs.map((run) => run.pageCount);
  const allInRange = pageCounts.every((count) => count >= 3 && count <= 7);
  const noSparsePages = runs.every((run) => run.sparsePages.length === 0);
  const consistent = pageCounts[0] === pageCounts[1];

  console.log(JSON.stringify({ runs, allInRange, noSparsePages, consistent }, null, 2));

  if (!allInRange || !noSparsePages || !consistent) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
