import { z } from 'zod';
import { supabase } from '../db/supabaseClient';
import { getServiceById } from '../lib/catalog';
import { fail, ok } from '../lib/result';
import type { ToolResult } from '../types';

const ClearanceParams = z.object({
  clientId: z.string().uuid(),
  serviceId: z.string().min(1),
  serviceTier: z.enum(['T2', 'T3']),
});

export async function getClearanceStatus(params: {
  clientId: string;
  serviceId: string;
  serviceTier: 'T2' | 'T3';
}): Promise<ToolResult<{ status: string; validUntil?: string }>> {
  const parsed = ClearanceParams.safeParse(params);
  if (!parsed.success) {
    return fail('invalid_clearance_params');
  }

  try {
    const service = await getServiceById(params.serviceId);
    if (!service || !supabase) {
      return fail('clearance_not_found');
    }

    if (params.serviceTier === 'T2') {
      const { data } = await supabase
        .from('spmu_clearances')
        .select('*')
        .eq('client_id', params.clientId)
        .eq('service_category', service.gateCategory)
        .order('valid_until', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) {
        return fail('clearance_not_found');
      }

      return ok({
        status: data.patch_test_cleared ? 'APPROVED' : 'PENDING',
        validUntil: data.valid_until ? String(data.valid_until) : undefined,
      });
    }

    const { data } = await supabase
      .from('medical_screenings')
      .select('*')
      .eq('client_id', params.clientId)
      .eq('service_category', service.gateCategory)
      .order('approved_until', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) {
      return fail('clearance_not_found');
    }

    return ok({
      status: String(data.status),
      validUntil: data.approved_until ? String(data.approved_until) : undefined,
    });
  } catch (error) {
    console.error('getClearanceStatus failed', error);
    return fail('clearance_lookup_failed');
  }
}
