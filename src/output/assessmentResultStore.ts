import { supabase } from "../db/supabaseClient";
import type { AssessmentResult } from "../types";
import { AssessmentResultSchema } from "../types";

type AssessmentResultRow = {
  readiness_level: string;
  narrative: string;
  blockers: unknown;
  use_cases: unknown;
  first_action: string;
  extended_report?: unknown;
};

export function hydrateAssessmentResult(
  row: AssessmentResultRow,
): AssessmentResult | undefined {
  const candidate = {
    readinessLevel: row.readiness_level,
    narrative: row.narrative,
    blockers: row.blockers,
    useCases: row.use_cases,
    firstAction: row.first_action,
    extendedReport: row.extended_report ?? undefined,
  };

  const validated = AssessmentResultSchema.safeParse(candidate);
  return validated.success ? validated.data : undefined;
}

export async function fetchAssessmentResult(
  sessionId: string,
): Promise<AssessmentResult | undefined> {
  const { data, error } = await supabase
    .from("assessment_results")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch assessment result:", error);
    return undefined;
  }

  if (!data) {
    return undefined;
  }

  return hydrateAssessmentResult(data as AssessmentResultRow);
}

export async function saveAssessmentResult(
  sessionId: string,
  result: AssessmentResult,
): Promise<void> {
  const extendedReport = result.extendedReport;
  const baseRow = {
    session_id: sessionId,
    readiness_level: result.readinessLevel,
    narrative: result.narrative,
    blockers: result.blockers,
    use_cases: result.useCases,
    first_action: result.firstAction,
  };

  const saveRow = async (row: Record<string, unknown>) => {
    const { data: existing } = await supabase
      .from("assessment_results")
      .select("id")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("assessment_results")
        .update(row)
        .eq("session_id", sessionId);
      if (error) throw error;
      return;
    }

    const { error } = await supabase.from("assessment_results").insert(row);
    if (error) throw error;
  };

  try {
    await saveRow(
      extendedReport ? { ...baseRow, extended_report: extendedReport } : baseRow,
    );
  } catch (error) {
    if (!extendedReport) {
      throw error;
    }
    console.warn(
      "Assessment save with extended_report failed, retrying without:",
      error,
    );
    await saveRow(baseRow);
  }
}
