import { z } from 'zod';
import { createDeepSeekLlm } from '../lib/llmClient';
import { invokeJson } from '../lib/llmJson';
import { EvidenceRecordSchema, type EvidenceRecord } from '../types';
import fs from 'fs';
import path from 'path';
import { supabase } from '../db/supabaseClient';

const ExtractedEvidenceRecordSchema = EvidenceRecordSchema.omit({
  source: true,
  documentName: true,
});

const EvidenceExtractionOutput = z.object({
  records: z.array(ExtractedEvidenceRecordSchema),
});

export async function extractEvidence(
  rawText: string,
  sessionId: string,
  documentName: string
): Promise<EvidenceRecord[]> {
  const promptTemplate = fs.readFileSync(path.join(process.cwd(), 'prompts/evidence_extraction.md'), 'utf-8');
  
  const llm = createDeepSeekLlm({ temperature: 0.1 });
  const prompt = `${promptTemplate.replace('{{DOCUMENT_CONTENT}}', rawText)}

Return ONLY valid JSON. Do not use markdown fences, comments, or prose.
The JSON shape must be:
{
  "records": [
    {
      "dimension": "data_accessibility | data_quality_history | systems_integration | use_case_specificity | implementation_capability | adoption_conditions | leadership_sponsorship",
      "quality": "DOCUMENTED | INFERRED",
      "extractedText": "short faithful excerpt from the document",
      "agentInterpretation": "what this means for AI readiness"
    }
  ]
}`;

  try {
    const result = await invokeJson(llm, prompt, EvidenceExtractionOutput);
    
    const recordsToSave = result.records.map((r) => ({
      ...r,
      source: 'DOCUMENT' as const,
      documentName,
    }));

    const dbRecords = recordsToSave.map(r => ({
      session_id: sessionId,
      dimension: r.dimension,
      quality: r.quality,
      extracted_text: r.extractedText,
      agent_interpretation: r.agentInterpretation,
      source: r.source,
      document_name: r.documentName,
    }));
    await supabase.from('evidence_records').insert(dbRecords);

    return recordsToSave;
  } catch (error) {
    console.error('Evidence extraction failed:', error);
    throw error;
  }
}
