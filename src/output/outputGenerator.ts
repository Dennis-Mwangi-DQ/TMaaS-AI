import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { createDeepSeekLlm } from '../lib/llmClient';
import { invokeJson } from '../lib/llmJson';
import type { AssessmentSession, AssessmentResult, DimensionScores, UseCaseEntry, EvidenceRecord } from '../types';
import { matchUseCases } from '../usecases/useCaseMatcher';
import { supabase } from '../db/supabaseClient';

const NarrativeOutputSchema = z.object({
  narrative: z.string(),
  blockers: z.array(z.object({
    title: z.string(),
    description: z.string()
  })).max(3),
});

const UseCaseRationaleSchema = z.object({
  rationales: z.array(z.string())
});

const FirstActionSchema = z.object({
  firstAction: z.string()
});

export async function generateAssessmentOutput(
  session: AssessmentSession,
  evidence: EvidenceRecord[]
): Promise<AssessmentResult> {
  const llm = createDeepSeekLlm({ temperature: 0.2 });
  
  if (!session.readinessLevel || !session.dimensionScores) {
    throw new Error('Readiness level and dimension scores must be computed before generating output.');
  }

  const useCases = matchUseCases(session.sector || 'All', session.readinessLevel);

  const narrativePromptTpl = fs.readFileSync(path.join(process.cwd(), 'prompts/blocker_narrative.md'), 'utf-8');
  const narrativePrompt = narrativePromptTpl
    .replace('{{READINESS_LEVEL}}', session.readinessLevel)
    .replace('{{DIMENSION_SCORES}}', JSON.stringify(session.dimensionScores, null, 2))
    .replace('{{EVIDENCE}}', JSON.stringify(evidence.map(e => ({ dimension: e.dimension, interpretation: e.agentInterpretation })), null, 2))
    .concat(`

Return ONLY valid JSON. Do not use markdown fences, comments, or prose.
The JSON shape must be:
{
  "narrative": "3-4 sentence readiness narrative",
  "blockers": [
    { "title": "short blocker title", "description": "specific blocker description" }
  ]
}
Include no more than 3 blockers.`);

  const narrativeRes = await invokeJson(llm, narrativePrompt, NarrativeOutputSchema);

  const ucPrompt = `For each of the following use cases, provide one sentence explaining why it is relevant for an organization in the ${session.sector || 'unknown'} sector at ${session.readinessLevel} readiness.

Use Cases:
${JSON.stringify(useCases.map(u => u.name))}

Return ONLY valid JSON. Do not use markdown fences, comments, or prose.
The JSON shape must be:
{
  "rationales": ["one sentence per use case, in the same order"]
}`;
  const ucRes = await invokeJson(llm, ucPrompt, UseCaseRationaleSchema);

  const firstActionTpl = fs.readFileSync(path.join(process.cwd(), 'prompts/first_action.md'), 'utf-8');
  const firstActionPrompt = firstActionTpl
    .replace('{{READINESS_LEVEL}}', session.readinessLevel)
    .replace('{{BLOCKERS}}', JSON.stringify(narrativeRes.blockers, null, 2))
    .concat(`

Return ONLY valid JSON. Do not use markdown fences, comments, or prose.
The JSON shape must be:
{
  "firstAction": "single concrete 30-day action"
}`);
    
  const actionRes = await invokeJson(llm, firstActionPrompt, FirstActionSchema);

  const result: AssessmentResult = {
    readinessLevel: session.readinessLevel,
    narrative: narrativeRes.narrative,
    blockers: narrativeRes.blockers,
    useCases: useCases.map((uc, i) => ({
      useCase: uc,
      rationale: ucRes.rationales[i] || uc.value_statement
    })),
    firstAction: actionRes.firstAction
  };

  if (supabase) {
    await supabase.from('assessment_results').insert({
      session_id: session.sessionId,
      readiness_level: result.readinessLevel,
      narrative: result.narrative,
      blockers: result.blockers,
      use_cases: result.useCases,
      first_action: result.firstAction
    });
  }

  return result;
}
