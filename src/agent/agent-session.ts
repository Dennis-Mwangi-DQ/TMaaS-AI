import type { AssessmentSession, EvidenceRecord } from '../types';
import { supabase } from '../db/supabaseClient';

export interface AgentContext {
  topicsCompleted: string[];
  dimensionSignals: Record<string, number>;
  inconsistenciesFlagged: string[];
  evidenceFlags: Record<string, string>;
}

export function buildAgentContext(session: AssessmentSession): AgentContext {
  return {
    topicsCompleted: session.topicsCompleted,
    dimensionSignals: session.dimensionScores || {},
    inconsistenciesFlagged: [], // Keep in memory for the conversation loop
    evidenceFlags: session.evidenceQuality || {},
  };
}

export async function fetchEvidenceContext(sessionId: string): Promise<EvidenceRecord[]> {
  const { data, error } = await supabase.from('evidence_records').select('*').eq('session_id', sessionId);
  if (error || !data) return [];
  return data.map(d => ({
    dimension: d.dimension,
    quality: d.quality,
    extractedText: d.extracted_text,
    agentInterpretation: d.agent_interpretation,
    source: d.source,
    documentName: d.document_name,
  })) as EvidenceRecord[];
}
