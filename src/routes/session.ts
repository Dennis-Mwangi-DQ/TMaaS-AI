import { Router } from "express";
import { getOrCreateSession } from "../memory/sessionManager";
import { generateSessionId } from "../lib/ids";
import { fetchAssessmentResult } from "../output/assessmentResultStore";
import {
  isAssessmentReadyForCompletion,
  runCompleteAssessment,
} from "../assessment/completeAssessment";

const sessionRouter = Router();

sessionRouter.post("/", async (req, res) => {
  try {
    const session = await getOrCreateSession(generateSessionId());
    res.json({
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
    console.error("Session creation error:", error);
    res.status(500).json({ error: String(error) });
  }
});

sessionRouter.get("/:sessionId", async (req, res) => {
  try {
    const session = await getOrCreateSession(req.params.sessionId);
    const result = await fetchAssessmentResult(session.sessionId);

    res.json({
      sessionId: session.sessionId,
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
      result: result ?? null,
      canComplete: isAssessmentReadyForCompletion(session),
    });
  } catch (error) {
    console.error("Session fetch error:", error);
    res.status(500).json({ error: String(error) });
  }
});

sessionRouter.get("/:sessionId/result", async (req, res) => {
  try {
    const result = await fetchAssessmentResult(req.params.sessionId);
    if (!result) {
      res.status(404).json({ error: "Assessment result not found" });
      return;
    }
    res.json({ result });
  } catch (error) {
    console.error("Assessment result fetch error:", error);
    res.status(500).json({ error: String(error) });
  }
});

sessionRouter.post("/:sessionId/complete", async (req, res) => {
  try {
    const session = await getOrCreateSession(req.params.sessionId);
    if (!isAssessmentReadyForCompletion(session)) {
      res.status(400).json({
        error: "Assessment is not ready to complete. Cover all five topics and record dimension signals first.",
      });
      return;
    }

    const result = await runCompleteAssessment(session.sessionId);
    const updatedSession = await getOrCreateSession(session.sessionId);

    res.json({
      result,
      session: {
        respondentName: updatedSession.respondentName,
        organisation: updatedSession.organisation,
        organisationSize: updatedSession.organisationSize,
        sector: updatedSession.sector,
        respondentRole: updatedSession.respondentRole,
        primaryUseCase: updatedSession.primaryUseCase,
        documentsUploaded: updatedSession.documentsUploaded,
        topicsCompleted: updatedSession.topicsCompleted,
        status: updatedSession.status,
        readinessLevel: updatedSession.readinessLevel,
        dimensionScores: updatedSession.dimensionScores ?? {},
        conversationTurns: updatedSession.conversationHistory.length,
      },
    });
  } catch (error) {
    console.error("Manual assessment completion error:", error);
    res.status(500).json({ error: String(error) });
  }
});

export { sessionRouter };
