import { supabase } from '../db/supabaseClient';
import { generateSessionId } from '../lib/ids';
import type { AssessmentSession, ConversationTurn, DimensionScores, EvidenceQualityMap, ReadinessLevel } from '../types';

const sessionStore = new Map<string, AssessmentSession>();

function nowIso(): string {
  return new Date().toISOString();
}

function toAssessmentSession(row: Record<string, unknown>): AssessmentSession {
  return {
    sessionId: String(row.id),
    organisation: row.organisation ? String(row.organisation) : undefined,
    sector: row.sector ? String(row.sector) : undefined,
    respondentRole: row.respondent_role ? String(row.respondent_role) : undefined,
    documentsUploaded: Array.isArray(row.documents_uploaded) ? (row.documents_uploaded as string[]) : [],
    conversationHistory: Array.isArray(row.conversation_history) ? (row.conversation_history as ConversationTurn[]) : [],
    topicsCompleted: Array.isArray(row.topics_completed) ? (row.topics_completed as string[]) : [],
    dimensionScores: (row.dimension_scores as DimensionScores | undefined) ?? undefined,
    evidenceQuality: (row.evidence_quality as EvidenceQualityMap | undefined) ?? undefined,
    status: (row.status as AssessmentSession['status']) ?? 'active',
    readinessLevel: (row.readiness_level as ReadinessLevel | undefined) ?? undefined,
    pdfUrl: row.pdf_url ? String(row.pdf_url) : undefined,
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  };
}

function toDbSession(session: AssessmentSession): Record<string, unknown> {
  return {
    id: session.sessionId,
    organisation: session.organisation ?? null,
    sector: session.sector ?? null,
    respondent_role: session.respondentRole ?? null,
    documents_uploaded: session.documentsUploaded,
    conversation_history: session.conversationHistory,
    topics_completed: session.topicsCompleted,
    dimension_scores: session.dimensionScores ?? null,
    evidence_quality: session.evidenceQuality ?? null,
    status: session.status,
    readiness_level: session.readinessLevel ?? null,
    pdf_url: session.pdfUrl ?? null,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  };
}

function createSession(sessionId?: string): AssessmentSession {
  const timestamp = nowIso();

  return {
    sessionId: sessionId ?? generateSessionId(),
    documentsUploaded: [],
    conversationHistory: [],
    topicsCompleted: [],
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function getOrCreateSession(
  sessionId: string | undefined
): Promise<AssessmentSession> {
  const resolvedId = sessionId ?? generateSessionId();
  const existing = sessionStore.get(resolvedId);
  if (existing) {
    return existing;
  }

  if (supabase) {
    const { data, error } = await supabase.from('assessment_sessions').select('*').eq('id', resolvedId).maybeSingle();
    if (!error && data) {
      const session = toAssessmentSession(data);
      sessionStore.set(session.sessionId, session);
      return session;
    }
  }

  const session = createSession(resolvedId);
  sessionStore.set(session.sessionId, session);

  if (supabase) {
    void supabase.from('assessment_sessions').upsert(toDbSession(session));
  }

  return session;
}

export async function updateSession(sessionId: string, updates: Partial<AssessmentSession>): Promise<AssessmentSession | null> {
  const existing = sessionStore.get(sessionId);
  if (!existing) {
    return null;
  }

  const next: AssessmentSession = {
    ...existing,
    ...updates,
    updatedAt: nowIso(),
  };

  sessionStore.set(sessionId, next);

  if (supabase) {
    void supabase.from('assessment_sessions').upsert(toDbSession(next));
  }

  return next;
}

export async function appendTurn(sessionId: string, turn: ConversationTurn): Promise<void> {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return;
  }

  await updateSession(sessionId, {
    conversationHistory: [...session.conversationHistory, turn],
  });
}
