CREATE TABLE IF NOT EXISTS assessment_sessions (
    id UUID PRIMARY KEY,
    organisation TEXT,
    sector TEXT,
    respondent_role TEXT,
    documents_uploaded JSONB DEFAULT '[]'::JSONB,
    conversation_history JSONB DEFAULT '[]'::JSONB,
    topics_completed JSONB DEFAULT '[]'::JSONB,
    dimension_scores JSONB,
    evidence_quality JSONB,
    status TEXT DEFAULT 'active',
    readiness_level TEXT,
    pdf_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    dimension TEXT NOT NULL,
    quality TEXT NOT NULL,
    extracted_text TEXT NOT NULL,
    agent_interpretation TEXT NOT NULL,
    source TEXT NOT NULL,
    document_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessment_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    readiness_level TEXT NOT NULL,
    narrative TEXT NOT NULL,
    blockers JSONB NOT NULL,
    use_cases JSONB NOT NULL,
    first_action TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
