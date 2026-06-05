import { z } from 'zod';
import { supabase } from '../db/supabaseClient';
import { generateSequenceId } from '../lib/ids';
import { normalizePhoneNumber } from '../lib/phone';
import { fail, ok } from '../lib/result';
import { ScreeningAnswersSchema, type ScreeningAnswers, type ToolResult } from '../types';

const ScreeningParams = z.object({
  clientId: z.string().uuid().nullable(),
  visitorName: z.string().optional(),
  visitorContact: z.string().optional(),
  serviceCategory: z.string().min(1),
  answers: ScreeningAnswersSchema,
});

function flaggedQuestions(answers: ScreeningAnswers): string[] {
  const flagged: string[] = [];
  if (answers.q1Pregnant) flagged.push('q1Pregnant');
  if (answers.q2BloodThinners) flagged.push('q2BloodThinners');
  if (answers.q3Allergies) flagged.push('q3Allergies');
  if (answers.q5ActiveInfection) flagged.push('q5ActiveInfection');
  if (answers.q6Autoimmune) flagged.push('q6Autoimmune');
  return flagged;
}

export async function submitScreening(params: {
  clientId: string | null;
  visitorName?: string;
  visitorContact?: string;
  serviceCategory: string;
  answers: ScreeningAnswers;
}): Promise<ToolResult<{ screeningId: string; flaggedQuestions: string[] }>> {
  const parsed = ScreeningParams.safeParse(params);
  if (!parsed.success) {
    return fail('invalid_screening_params');
  }

  try {
    const screeningId = generateSequenceId('SCR', new Date().getUTCFullYear().toString(), Math.floor(Math.random() * 10000), 4);
    const flagged = flaggedQuestions(params.answers);

    if (supabase) {
      const { error } = await supabase.from('medical_screenings').insert({
        id: screeningId,
        client_id: params.clientId,
        visitor_name: params.visitorName,
        visitor_contact: normalizePhoneNumber(params.visitorContact),
        service_category: params.serviceCategory,
        answers: params.answers,
        flagged_questions: flagged,
        status: 'PENDING',
      });

      if (error) {
        console.error('submitScreening insert failed', error);
        return fail('screening_submit_failed');
      }
    }

    return ok({ screeningId, flaggedQuestions: flagged });
  } catch (error) {
    console.error('submitScreening failed', error);
    return fail('screening_submit_failed');
  }
}
