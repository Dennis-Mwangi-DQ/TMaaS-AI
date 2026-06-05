import { z } from 'zod';
import { supabase } from '../db/supabaseClient';
import { fail, ok } from '../lib/result';
import type { ToolResult } from '../types';

const NotesParams = z.object({
  bookingRef: z.string().min(1),
  notes: z.string().min(1),
});

export async function addNotes(params: {
  bookingRef: string;
  notes: string;
}): Promise<ToolResult<void>> {
  const parsed = NotesParams.safeParse(params);
  if (!parsed.success) {
    return fail('invalid_notes_params');
  }

  try {
    if (supabase) {
      const { data } = await supabase.from('bookings').select('notes').eq('id', params.bookingRef).maybeSingle();
      const existingNotes = data?.notes ? String(data.notes) : '';
      const combined = existingNotes ? `${existingNotes}\n${params.notes}` : params.notes;

      const { error } = await supabase
        .from('bookings')
        .update({ notes: combined, updated_at: new Date().toISOString() })
        .eq('id', params.bookingRef);

      if (error) {
        console.error('addNotes update failed', error);
        return fail('notes_update_failed');
      }
    }

    return ok(undefined);
  } catch (error) {
    console.error('addNotes failed', error);
    return fail('notes_update_failed');
  }
}
