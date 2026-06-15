import { Router } from 'express';
import { getOrCreateSession } from '../memory/sessionManager';
import { supabase } from '../db/supabaseClient';
import { buildReport } from '../report/reportBuilder';

const reportRouter = Router();

reportRouter.get('/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = await getOrCreateSession(sessionId);

    // Fetch assessment result from db
    let result = undefined;
    if (supabase) {
      const { data } = await supabase.from('assessment_results').select('*').eq('session_id', sessionId).maybeSingle();
      if (data) {
        result = {
          readinessLevel: data.readiness_level,
          narrative: data.narrative,
          blockers: data.blockers,
          useCases: data.use_cases,
          firstAction: data.first_action,
        };
      }
    }

    if (!result) {
      res.status(404).json({ error: 'Report not found or assessment not completed' });
      return;
    }

    const pdfBuffer = await buildReport(result as any, session);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tmaas_advisory_${sessionId}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: String(error) });
  }
});

export { reportRouter };
