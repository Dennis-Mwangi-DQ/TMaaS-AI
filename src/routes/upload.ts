import { Router } from "express";
import multer from "multer";
import { loadDocument } from "../ingestion/documentLoader";
import { extractEvidence } from "../ingestion/evidenceExtractor";
import {
  extractOrganisationFromDocument,
  organisationsMismatch,
} from "../ingestion/orgDetector";
import { generateSessionId } from "../lib/ids";
import { getOrCreateSession, updateSession } from "../memory/sessionManager";

const uploadRouter = Router();
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

uploadRouter.post("/", upload.single("document"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No document uploaded" });
      return;
    }

    let sessionId = req.body.sessionId || generateSessionId();
    let session = await getOrCreateSession(sessionId);

    const rawText = await loadDocument(
      file.buffer,
      file.mimetype,
      file.originalname,
    );

    const documentOrganisation = extractOrganisationFromDocument(rawText);
    const shouldReset =
      session.status === "completed" ||
      organisationsMismatch(session.organisation, documentOrganisation);

    let resetReason: string | undefined;
    if (shouldReset) {
      resetReason =
        session.status === "completed"
          ? "completed_session"
          : "organisation_mismatch";
      sessionId = generateSessionId();
      session = await getOrCreateSession(sessionId);
    }

    console.log(
      `Document ${file.originalname} loaded with ${rawText.length} characters for session ${sessionId}`,
    );

    // Extract evidence in the background or await it
    // For prototype, we await it to immediately show evidence
    const evidence = await extractEvidence(
      rawText,
      sessionId,
      file.originalname,
    );

    const documentsUploaded = [...session.documentsUploaded, file.originalname];
    await updateSession(sessionId, { documentsUploaded });

    res.json({
      sessionId,
      fileName: file.originalname,
      evidenceCount: evidence.length,
      evidenceSummary: `${evidence.length} evidence records extracted`,
      documentsUploaded,
      resetReason,
      documentOrganisation,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: String(error) });
  }
});

export { uploadRouter };
