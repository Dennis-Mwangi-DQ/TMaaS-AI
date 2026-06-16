import { Router } from 'express';
import { fetchEvidenceContext } from '../agent/agent-session';
import { getOrCreateSession } from '../memory/sessionManager';
import { supabase } from '../db/supabaseClient';
import { fetchAssessmentResult, hydrateAssessmentResult } from '../output/assessmentResultStore';
import { buildReport } from '../report/reportBuilder';

const reportRouter = Router();

reportRouter.get('/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = await getOrCreateSession(sessionId);

    const { data } = await supabase
      .from('assessment_results')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    const stored = await fetchAssessmentResult(sessionId);
    const result = stored
      ?? (data
        ? hydrateAssessmentResult({
            readiness_level: data.readiness_level,
            narrative: data.narrative,
            blockers: data.blockers,
            use_cases: data.use_cases,
            first_action: data.first_action,
            extended_report: data.extended_report,
          })
        : undefined);

    if (!result) {
      res.status(404).json({ error: 'Report not found or assessment not completed' });
      return;
    }

    const evidence = await fetchEvidenceContext(sessionId);
    const pdfBuffer = await buildReport(result as any, session, evidence);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tmaas_advisory_${sessionId}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: String(error) });
  }
});

export { reportRouter };
