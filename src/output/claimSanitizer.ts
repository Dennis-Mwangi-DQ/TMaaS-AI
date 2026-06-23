import type {
  AssessmentResult,
  AssessmentSession,
  EvidenceRecord,
} from '../types';
import { loadUseCases } from '../usecases/useCaseMatcher';

const INDICATIVE_LABEL = '[Indicative benchmark — not confirmed in assessment]';
const REMOVED_CLAIM = '[Claim removed — not supported by assessment evidence]';

const ROI_PATTERN =
  /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*%\s*(?:ROI|return|savings?|reduction|improvement)\b/gi;
const PERCENT_CLAIM_PATTERN =
  /\b(?:\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*%\s*(?:reduction|savings?|improvement|increase|decrease|ROI))\b/gi;
const CURRENCY_PATTERN =
  /\b(?:QAR|USD|\$|£|€)\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s*(?:K|M|k|m))?(?:\s*[-–]\s*(?:QAR|USD|\$|£|€)?\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s*(?:K|M|k|m))?)?\b/gi;
const DOWNTIME_PATTERN =
  /\b\d{1,3}(?:\.\d+)?\s*%\s*(?:downtime|unplanned downtime)\b/gi;
const DELIVERY_TIMELINE_PATTERN =
  /\bwithin\s+\d{1,3}\s+(?:days?|weeks?|months?)\b/gi;
const VENDOR_PATTERN =
  /\b(?:using|via|from|powered by|integrate with|platform[s]?:?)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3})\b/g;

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ');
}

function buildAllowedCorpus(
  session: AssessmentSession,
  evidence: EvidenceRecord[],
): string {
  const parts: string[] = [];

  if (session.respondentName) parts.push(session.respondentName);
  if (session.organisation) parts.push(session.organisation);
  if (session.sector) parts.push(session.sector);
  if (session.primaryUseCase) parts.push(session.primaryUseCase);

  for (const turn of session.conversationHistory) {
    parts.push(turn.content);
  }

  for (const record of evidence) {
    parts.push(record.extractedText);
    parts.push(record.agentInterpretation);
  }

  for (const uc of loadUseCases()) {
    if (uc.cost_band_indicative) {
      parts.push(uc.cost_band_indicative);
    }
  }

  return normalizeForMatch(parts.join(' '));
}

function isInCorpus(phrase: string, corpus: string): boolean {
  const normalized = normalizeForMatch(phrase);
  if (!normalized || normalized.length < 3) {
    return true;
  }
  return corpus.includes(normalized);
}

function looksLikeCostBand(phrase: string): boolean {
  return /\b(?:QAR|USD|\$|£|€)\b/i.test(phrase) ||
    /\b\d{1,3}K\s*[-–]\s*\d{1,3}K\b/i.test(phrase);
}

function sanitizeText(text: string, corpus: string): string {
  if (!text) {
    return text;
  }

  let result = text;

  const replaceIfUnsupported = (
    pattern: RegExp,
    indicativeFallback: boolean,
  ): void => {
    result = result.replace(pattern, (match) => {
      if (isInCorpus(match, corpus)) {
        return match;
      }
      if (indicativeFallback && looksLikeCostBand(match)) {
        return INDICATIVE_LABEL;
      }
      return REMOVED_CLAIM;
    });
  };

  replaceIfUnsupported(ROI_PATTERN, false);
  replaceIfUnsupported(PERCENT_CLAIM_PATTERN, false);
  replaceIfUnsupported(CURRENCY_PATTERN, true);
  replaceIfUnsupported(DOWNTIME_PATTERN, false);
  replaceIfUnsupported(DELIVERY_TIMELINE_PATTERN, false);

  result = result.replace(VENDOR_PATTERN, (full, vendorName: string) => {
    const genericTerms = new Set([
      'Build',
      'Buy',
      'SaaS',
      'In',
      'House',
      'The',
      'Our',
      'Your',
      'Internal',
      'External',
    ]);
    if (genericTerms.has(vendorName) || isInCorpus(vendorName, corpus)) {
      return full;
    }
    return full.replace(vendorName, 'a suitable vendor (to be evaluated during scoping)');
  });

  return result
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .trim();
}

function sanitizeStringArray(items: string[], corpus: string): string[] {
  return items.map((item) => sanitizeText(item, corpus));
}

export function sanitizeAssessmentResult(
  result: AssessmentResult,
  evidence: EvidenceRecord[],
  session: AssessmentSession,
): AssessmentResult {
  const corpus = buildAllowedCorpus(session, evidence);

  const sanitized: AssessmentResult = {
    ...result,
    narrative: sanitizeText(result.narrative, corpus),
    blockers: result.blockers.map((b) => ({
      title: sanitizeText(b.title, corpus),
      description: sanitizeText(b.description, corpus),
    })),
    firstAction: sanitizeText(result.firstAction, corpus),
    useCases: result.useCases.map((uc) => ({
      ...uc,
      rationale: sanitizeText(uc.rationale, corpus),
      details: uc.details
        ? {
            ...uc.details,
            description: sanitizeText(uc.details.description, corpus),
            businessRationale: sanitizeText(uc.details.businessRationale, corpus),
            dataRequirements: sanitizeText(uc.details.dataRequirements, corpus),
            integrationPoints: sanitizeText(uc.details.integrationPoints, corpus),
            keyRisks: sanitizeStringArray(uc.details.keyRisks, corpus),
            sequencing: sanitizeText(uc.details.sequencing, corpus),
            vendorNote: sanitizeText(uc.details.vendorNote, corpus),
          }
        : undefined,
    })),
  };

  if (!result.extendedReport) {
    return sanitized;
  }

  const ext = result.extendedReport;
  sanitized.extendedReport = {
    ...ext,
    executiveSummary: {
      primaryStrength: sanitizeText(ext.executiveSummary.primaryStrength, corpus),
      primaryGap: sanitizeText(ext.executiveSummary.primaryGap, corpus),
    },
    dimensionAnalyses: ext.dimensionAnalyses.map((a) => ({
      ...a,
      evidence: sanitizeText(a.evidence, corpus),
      gaps: sanitizeText(a.gaps, corpus),
      deploymentImpact: sanitizeText(a.deploymentImpact, corpus),
      recommendedActions: sanitizeStringArray(a.recommendedActions, corpus),
    })),
    detailedBlockers: ext.detailedBlockers.map((b) => ({
      ...b,
      title: sanitizeText(b.title, corpus),
      severity: sanitizeText(b.severity, corpus),
      rootCause: sanitizeText(b.rootCause, corpus),
      businessImpact: sanitizeText(b.businessImpact, corpus),
      resolutionPathway: sanitizeText(b.resolutionPathway, corpus),
      dependencies: sanitizeText(b.dependencies, corpus),
    })),
    useCaseDetails: ext.useCaseDetails.map((d) => ({
      ...d,
      description: sanitizeText(d.description, corpus),
      businessRationale: sanitizeText(d.businessRationale, corpus),
      dataRequirements: sanitizeText(d.dataRequirements, corpus),
      integrationPoints: sanitizeText(d.integrationPoints, corpus),
      keyRisks: sanitizeStringArray(d.keyRisks, corpus),
      sequencing: sanitizeText(d.sequencing, corpus),
      vendorNote: sanitizeText(d.vendorNote, corpus),
    })),
    roadmap: ext.roadmap.map((r) => ({
      ...r,
      timeline: sanitizeText(r.timeline, corpus),
      action: sanitizeText(r.action, corpus),
      owner: sanitizeText(r.owner, corpus),
    })),
    assumptions: sanitizeStringArray(ext.assumptions, corpus),
    risks: ext.risks.map((r) => ({
      ...r,
      risk: sanitizeText(r.risk, corpus),
      mitigation: sanitizeText(r.mitigation, corpus),
    })),
    constraints: sanitizeText(ext.constraints, corpus),
    nextSteps: ext.nextSteps.map((n) => ({
      ...n,
      action: sanitizeText(n.action, corpus),
    })),
    findings: ext.findings
      ? {
          believed: sanitizeStringArray(ext.findings.believed, corpus),
          uncertain: sanitizeStringArray(ext.findings.uncertain, corpus),
          biggestRisk: sanitizeText(ext.findings.biggestRisk, corpus),
          recommendedNextStep: sanitizeText(ext.findings.recommendedNextStep, corpus),
        }
      : undefined,
  };

  return sanitized;
}

export { sanitizeText, buildAllowedCorpus, INDICATIVE_LABEL, REMOVED_CLAIM };
