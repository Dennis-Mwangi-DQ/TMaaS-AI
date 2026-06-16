import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "../lib/env";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_PUBLISHABLE_KEY"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  return client;
}

export const supabase = getSupabaseClient();
