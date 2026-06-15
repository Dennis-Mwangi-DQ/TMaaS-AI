import type { EvidenceRecord, DimensionScores, ReadinessLevel, DimensionName } from '../types';
import { DimensionNames } from '../types';

export function scoreDimensions(
  evidence: EvidenceRecord[],
  conversationSignals: Record<string, number>
): DimensionScores {
  const scores: Partial<DimensionScores> = {};

  for (const dimension of DimensionNames.options) {
    let rawScore = 0;
    
    // Check conversation signals first (agent overrides)
    if (dimension in conversationSignals) {
      rawScore = conversationSignals[dimension];
    } else {
      // Fallback to evidence scoring (simple heuristic: more evidence = higher score, 
      // but in reality we need the LLM to output a signal, or we map qualities to scores)
      // For this prototype, we'll assume conversationSignals is the primary source of truth,
      // which the agent calls via tool `record_dimension_signal`.
      // If missing, default to 0.
      rawScore = 0;
    }
    
    // Ensure bounds
    scores[dimension] = Math.max(0, Math.min(2, Math.round(rawScore))) as 0 | 1 | 2;
  }

  return scores as DimensionScores;
}

export function determineReadinessLevel(scores: DimensionScores): ReadinessLevel {
  const values = Object.values(scores) as number[];
  
  const count0 = values.filter((s) => s === 0).length;
  const count1 = values.filter((s) => s === 1).length;
  const count2 = values.filter((s) => s === 2).length;

  if (count0 >= 3) {
    return 'Not Ready';
  }

  if (count0 > 1 || count1 >= 4) {
    return 'Foundation Needed';
  }

  if (count0 <= 1 && (count1 + count2) >= 6) {
    if (count0 === 0 && count2 >= 5) {
      return 'Scale Ready';
    }
    return 'Pilot Ready';
  }

  // Fallback
  return 'Foundation Needed';
}
