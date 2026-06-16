-- Run on existing Supabase databases after pulling latest schema changes.
ALTER TABLE assessment_results
  ADD COLUMN IF NOT EXISTS extended_report JSONB;

-- Optional but recommended for idempotent result saves:
-- CREATE UNIQUE INDEX IF NOT EXISTS assessment_results_session_id_key ON assessment_results (session_id);
