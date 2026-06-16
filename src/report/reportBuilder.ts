import puppeteer from "puppeteer";
import handlebars from "handlebars";
import fs from "fs";
import path from "path";
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
  AssessmentSession,
  DimensionScores,
  EvidenceRecord,
} from "../types";

function formatReportDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function buildDimensionRows(
  scores: DimensionScores,
  evidence: EvidenceRecord[],
) {
  return DIMENSION_ORDER.map((key) => {
    const score = scores[key] ?? 0;
    return {
      label: DIMENSION_LABELS[key],
      score,
      status: scoreStatusLabel(score),
      note: dimensionNote(key, score, evidence),
    };
  });
}

function computeStrengthAndGap(scores: DimensionScores) {
  let bestKey: (typeof DIMENSION_ORDER)[number] = DIMENSION_ORDER[0]!;
  let worstKey: (typeof DIMENSION_ORDER)[number] = DIMENSION_ORDER[0]!;
  let bestScore = scores[bestKey] ?? 0;
  let worstScore = scores[worstKey] ?? 0;

  for (const key of DIMENSION_ORDER) {
    const score = scores[key] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
    if (score < worstScore) {
      worstScore = score;
      worstKey = key;
    }
  }

  return {
    primaryStrength: DIMENSION_LABELS[bestKey],
    primaryGap: DIMENSION_LABELS[worstKey],
  };
}

function enrichDimensionAnalyses(
  result: AssessmentResult,
  scores: DimensionScores,
) {
  const analyses = result.extendedReport?.dimensionAnalyses ?? [];
  return analyses.map((analysis, index) => ({
    ...analysis,
    label: DIMENSION_LABELS[analysis.dimension],
    score: scores[analysis.dimension] ?? 0,
    status: scoreStatusLabel((scores[analysis.dimension] ?? 0) as 0 | 1 | 2),
    sectionNumber: index + 1,
    recommendedActionsText: analysis.recommendedActions.join("; "),
  }));
}

function horizonClass(horizon: string): string {
  if (horizon === "Immediate") return "horizon-immediate";
  if (horizon === "Foundation") return "horizon-foundation";
  return "horizon-deployment";
}

export async function buildReport(
  result: AssessmentResult,
  session: AssessmentSession,
  evidence: EvidenceRecord[] = [],
): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), "templates/report_template.html");
  const templateStr = fs.readFileSync(templatePath, "utf-8");
  const scores = session.dimensionScores ?? ({} as DimensionScores);
  const totalScore = totalDimensionScore(scores);
  const maxScore = DIMENSION_ORDER.length * 2;
  const computedSummary = computeStrengthAndGap(scores);
  const extended = result.extendedReport;

  const template = handlebars.compile(templateStr);
  const html = template({
    result,
    session,
    evidence,
    extended,
    formattedDate: formatReportDate(session.updatedAt || session.createdAt),
    totalScore,
    maxScore,
    levelSummary: readinessLevelSummary(result.readinessLevel),
    dimensionRows: buildDimensionRows(scores, evidence),
    executiveSummary: extended?.executiveSummary ?? computedSummary,
    dimensionAnalyses: enrichDimensionAnalyses(result, scores),
    detailedBlockers: extended?.detailedBlockers ?? [],
    roadmap: (extended?.roadmap ?? []).map((item) => ({
      ...item,
      horizonClass: horizonClass(item.horizon),
    })),
    assumptions: extended?.assumptions ?? [],
    risks: extended?.risks ?? [],
    constraints: extended?.constraints ?? "",
    nextSteps: extended?.nextSteps ?? [],
    sessionEvidence: extended?.sessionEvidence ?? [],
    findings: extended?.findings,
    hasExtended: Boolean(extended),
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "24px", left: "0" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
