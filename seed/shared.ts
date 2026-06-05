import 'dotenv/config';
import { getSupabaseClient } from '../src/db/supabaseClient';

export function requireSeedClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and one of SUPABASE_SERVICE_ROLE_KEY, SUPABASE_KEY, SUPABASE_PUBLISHABLE_KEY, or SUPABASE_ANON_KEY before running seed scripts.',
    );
  }
  return client;
}
