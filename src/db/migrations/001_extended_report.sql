-- Run on existing Supabase databases after pulling latest schema changes.
ALTER TABLE assessment_results
  ADD COLUMN IF NOT EXISTS extended_report JSONB;

ALTER TABLE assessment_sessions
  ADD COLUMN IF NOT EXISTS respondent_name TEXT,
  ADD COLUMN IF NOT EXISTS organisation_size TEXT,
  ADD COLUMN IF NOT EXISTS primary_use_case TEXT;

-- Optional but recommended for idempotent result saves:
-- CREATE UNIQUE INDEX IF NOT EXISTS assessment_results_session_id_key ON assessment_results (session_id);
