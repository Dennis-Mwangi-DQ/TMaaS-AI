import { Router } from "express";
import { runAgent } from "../agent/agent";
import { generateSessionId } from "../lib/ids";
import { getOrCreateSession } from "../memory/sessionManager";
import { fetchAssessmentResult } from "../output/assessmentResultStore";
import { ChatRequest } from "../types";

const chatRouter = Router();

chatRouter.post("/", async (req, res) => {
  try {
    const parsed = ChatRequest.parse(req.body);
    const sessionId = parsed.sessionId ?? generateSessionId();
    let { response, assessmentComplete, result } = await runAgent(
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
      result,
      sessionId: session.sessionId,
      session: {
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
