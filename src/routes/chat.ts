import { Router } from 'express';
import { runAgent } from '../agent/agent';
import { ChatRequest } from '../types';

const chatRouter = Router();

chatRouter.post('/', async (req, res) => {
  try {
    const parsed = ChatRequest.parse(req.body);
    const { response, assessmentComplete, result } = await runAgent(
      parsed.message,
      parsed.sessionId || 'default-session-id'
    );
    res.json({ response, assessmentComplete, result });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(400).json({ error: String(error) });
  }
});

export { chatRouter };
