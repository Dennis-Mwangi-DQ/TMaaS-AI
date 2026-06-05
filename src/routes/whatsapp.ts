import { type Request, Router } from 'express';
import twilio from 'twilio';
import { runAgent } from '../agent/agent';
import { getEnv } from '../lib/env';
import { generateSessionId } from '../lib/ids';
import { WhatsAppWebhookBody } from '../types';

export const whatsappRouter = Router();

function isTwilioRequestValid(req: Request, body: Record<string, string>): boolean {
  const authToken = getEnv('TWILIO_AUTH_TOKEN');
  const signature = req.get('x-twilio-signature');

  if (!authToken || !signature) {
    return true;
  }

  const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  return twilio.validateRequest(authToken, signature, fullUrl, body);
}

whatsappRouter.post('/', async (req, res) => {
  const parsed = WhatsAppWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).send('Invalid Twilio webhook payload');
  }

  if (!isTwilioRequestValid(req, req.body as Record<string, string>)) {
    return res.status(403).send('Invalid signature');
  }

  try {
    const sessionId = generateSessionId(parsed.data.From);
    const result = await runAgent({
      message: parsed.data.Body,
      sessionId,
      channel: 'whatsapp',
      whatsappNumber: parsed.data.From,
    });

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(result.response);

    return res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error('POST /whatsapp failed', error);
    return res.status(500).send('Internal server error');
  }
});
