import { Router } from "express";
import { runAgent } from "../agent/agent";
import { generateSessionId } from "../lib/ids";
import { getOrCreateSession } from "../memory/sessionManager";
import { fetchAssessmentResult } from "../output/assessmentResultStore";
import { ChatRequest } from "../types";

const chatRouter = Router();

function isExistingReportRequest(message: string): boolean {
  return /\b(download|pdf|full report|advisory report|report panel|right panel|show result|show report)\b/i.test(message);
}

chatRouter.post("/", async (req, res) => {
  try {
    const parsed = ChatRequest.parse(req.body);
    let sessionId = parsed.sessionId ?? generateSessionId();
    if (parsed.sessionId) {
      const existingSession = await getOrCreateSession(parsed.sessionId);
      if (
        existingSession.status === "completed" &&
        !isExistingReportRequest(parsed.message)
      ) {
        sessionId = generateSessionId();
      }
    }

    let { response, assessmentComplete, generatingReport, result } = await runAgent(
      parsed.message,
      sessionId,
    );
    const session = await getOrCreateSession(sessionId);

    if (!result) {
      result = await fetchAssessmentResult(session.sessionId);
      if (result) {
        assessmentComplete = true;
      }
    }

    res.json({
      response,
      assessmentComplete,
      generatingReport: generatingReport ?? (assessmentComplete && !result),
      result,
      sessionId: session.sessionId,
      session: {
        respondentName: session.respondentName,
        organisation: session.organisation,
        organisationSize: session.organisationSize,
        sector: session.sector,
        respondentRole: session.respondentRole,
        primaryUseCase: session.primaryUseCase,
        documentsUploaded: session.documentsUploaded,
        topicsCompleted: session.topicsCompleted,
        status: session.status,
        readinessLevel: session.readinessLevel,
        dimensionScores: session.dimensionScores ?? {},
        conversationTurns: session.conversationHistory.length,
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(400).json({ error: String(error) });
  }
});

export { chatRouter };
