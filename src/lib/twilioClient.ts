import twilio from 'twilio';
import { getEnv, isConfigured } from './env';

export const hasTwilioConfig = isConfigured('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN');

let twilioSingleton: ReturnType<typeof twilio> | null = null;

export function getTwilioClient(): ReturnType<typeof twilio> | null {
  if (!hasTwilioConfig) {
    return null;
  }

  if (!twilioSingleton) {
    twilioSingleton = twilio(getEnv('TWILIO_ACCOUNT_SID'), getEnv('TWILIO_AUTH_TOKEN'));
  }

  return twilioSingleton;
}

export const twilioClient = getTwilioClient();
