import type { DimensionName, DimensionScores, EvidenceRecord } from "../types";

export const DIMENSION_LABELS: Record<DimensionName, string> = {
  systems_integration: "Systems Integration",
  data_accessibility: "Data Accessibility",
  data_quality_history: "Data Quality",
  use_case_specificity: "Use Case Specificity",
  implementation_capability: "Implementation Capability",
  adoption_conditions: "Adoption Conditions",
  leadership_sponsorship: "Leadership Sponsorship",
};

export const DIMENSION_ORDER: DimensionName[] = [
  "systems_integration",
  "data_accessibility",
  "data_quality_history",
  "use_case_specificity",
  "implementation_capability",
  "adoption_conditions",
  "leadership_sponsorship",
];

export function totalDimensionScore(scores: DimensionScores): number {
  return DIMENSION_ORDER.reduce((sum, key) => sum + (scores[key] ?? 0), 0);
}

export function scoreStatusLabel(score: 0 | 1 | 2): string {
  if (score === 0) return "Critical gap";
  if (score === 1) return "Partial";
  return "Strong";
}

export function dimensionNote(
  dimension: DimensionName,
  score: 0 | 1 | 2,
  evidence: EvidenceRecord[],
): string {
  const match = evidence.find((record) => record.dimension === dimension);
  if (match?.agentInterpretation) {
    return match.agentInterpretation;
  }

  if (score === 0) {
    return "No evidence of adequate capability in this dimension.";
  }
  if (score === 1) {
    return "Some foundation exists, but gaps remain before reliable AI delivery.";
  }
  return "Adequate capability for the current readiness level.";
}

export function readinessLevelSummary(level: string): string {
  switch (level) {
    case "Not Ready":
      return "Structural prerequisites are missing. Address foundational data, systems, and governance gaps before investing in AI delivery.";
    case "Foundation Needed":
      return "Your organization has energy and intent, but critical structural gaps need to be addressed before AI can deliver reliably.";
    case "Pilot Ready":
      return "You can pursue a bounded pilot, provided scope, metrics, and ownership are tightly defined.";
    case "Scale Ready":
      return "Core foundations are in place to scale AI initiatives with appropriate governance and measurement.";
    default:
      return "";
  }
}
