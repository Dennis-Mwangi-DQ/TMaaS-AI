import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../lib/env';

let client: SupabaseClient | null = null;

function getSupabaseKey(): string | undefined {
  return (
    getEnv('SUPABASE_SERVICE_ROLE_KEY') ??
    getEnv('SUPABASE_KEY') ??
    getEnv('SUPABASE_PUBLISHABLE_KEY') ??
    getEnv('SUPABASE_ANON_KEY')
  );
}

export const hasSupabaseConfig = Boolean(getEnv('SUPABASE_URL') && getSupabaseKey());

export function getSupabaseClient(): SupabaseClient | null {
  if (!hasSupabaseConfig) {
    return null;
  }

  if (!client) {
    client = createClient(getEnv('SUPABASE_URL')!, getSupabaseKey()!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return client;
}

export const supabase = getSupabaseClient();
