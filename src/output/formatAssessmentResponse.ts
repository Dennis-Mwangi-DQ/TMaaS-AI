import {
  DIMENSION_LABELS,
  DIMENSION_ORDER,
  dimensionNote,
  readinessLevelSummary,
  scoreStatusLabel,
  totalDimensionScore,
} from "../scoring/dimensionLabels";
import type {
  AssessmentResult,
  DimensionScores,
  EvidenceRecord,
} from "../types";

export function formatAssessmentResponse(
  result: AssessmentResult,
  dimensionScores: DimensionScores,
  evidence: EvidenceRecord[] = [],
): string {
  const total = totalDimensionScore(dimensionScores);
  const maxScore = DIMENSION_ORDER.length * 2;
  const summary = readinessLevelSummary(result.readinessLevel);
  const findings = result.extendedReport?.findings;
  const executive = result.extendedReport?.executiveSummary;

  const scorecardLines = DIMENSION_ORDER.map((key) => {
    const score = dimensionScores[key] ?? 0;
    const label = DIMENSION_LABELS[key];
    const note = dimensionNote(key, score, evidence);
    return `| ${label} | ${score} | ${scoreStatusLabel(score)} | ${note} |`;
  });

  const blockerLines = result.blockers.map(
    (blocker, index) =>
      `${index + 1}. **${blocker.title}** — ${blocker.description}`,
  );

  const useCaseLines = result.useCases.map((entry) => {
    const cost = entry.useCase.cost_band_indicative;
    const complexity = entry.useCase.implementation_complexity;
    return `- **${entry.useCase.name}** (${cost}, ${complexity}) — ${entry.rationale}`;
  });

  const lines: string[] = [
    "## Assessment Complete",
    "",
    `**Readiness:** ${result.readinessLevel} (${total}/${maxScore})`,
    "",
  ];

  if (findings) {
    lines.push(
      "### What I believe is true",
      "",
      ...findings.believed.map((item) => `- ${item}`),
      "",
      "### What I'm uncertain about",
      "",
      ...findings.uncertain.map((item) => `- ${item}`),
      "",
      `**Biggest risk:** ${findings.biggestRisk}`,
      "",
      `**Recommended next step:** ${findings.recommendedNextStep}`,
      "",
    );
  } else {
    lines.push(summary, "");
  }

  if (executive) {
    lines.push(
      `**Primary strength:** ${executive.primaryStrength}`,
      `**Primary gap:** ${executive.primaryGap}`,
      "",
    );
  }

  lines.push(
    result.narrative,
    "",
    "### Scorecard",
    "",
    "| Dimension | Score | Status | Assessment |",
    "| --- | ---: | --- | --- |",
    ...scorecardLines,
    "",
    "### Top Blockers",
    "",
    ...blockerLines,
    "",
    "### Recommended First Action",
    "",
    result.firstAction,
    "",
    "### Recommended AI Use Cases",
    "",
    ...useCaseLines,
    "",
    "_Your full advisory report is available in the panel on the right and as a downloadable PDF._",
  );

  return lines.join("\n");
}
