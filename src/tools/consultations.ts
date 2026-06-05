import { z } from 'zod';
import { supabase } from '../db/supabaseClient';
import { generateSequenceId } from '../lib/ids';
import { normalizePhoneNumber } from '../lib/phone';
import { fail, ok } from '../lib/result';
import type { ToolResult } from '../types';

const ConsultationParams = z.object({
  clientId: z.string().uuid().nullable(),
  visitorName: z.string().optional(),
  visitorContact: z.string().optional(),
  serviceId: z.string().min(1),
  serviceCategory: z.string().min(1),
  branchId: z.string().min(1),
  slotId: z.string().min(1),
});

export async function createConsultation(params: {
  clientId: string | null;
  visitorName?: string;
  visitorContact?: string;
  serviceId: string;
  serviceCategory: string;
  branchId: string;
  slotId: string;
}): Promise<ToolResult<{ consultationId: string }>> {
  const parsed = ConsultationParams.safeParse(params);
  if (!parsed.success) {
    return fail('invalid_consultation_params');
  }

  try {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const consultationId = generateSequenceId('CON', datePart, Math.floor(Math.random() * 10000), 4);

    if (supabase) {
      const { error } = await supabase.from('consultation_requests').insert({
        id: consultationId,
        client_id: params.clientId,
        visitor_name: params.visitorName,
        visitor_contact: normalizePhoneNumber(params.visitorContact),
        service_id: params.serviceId,
        service_category: params.serviceCategory,
        branch_id: params.branchId,
        slot_id: params.slotId,
        status: 'booked',
      });

      if (error) {
        console.error('createConsultation insert failed', error);
        return fail('consultation_create_failed');
      }
    }

    return ok({ consultationId });
  } catch (error) {
    console.error('createConsultation failed', error);
    return fail('consultation_create_failed');
  }
}
