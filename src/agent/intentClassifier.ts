import { DEMO_BRANCHES, DEMO_SERVICES } from '../lib/demoData';
import { addDays, toIsoDate } from '../lib/dates';
import { createChatCompletion, MODEL, hasOpenAIConfig } from '../lib/qwenClient';
import { ClassificationResult, type ConversationTurn, type ClassificationResult as ClassificationResultType, type IntentId } from '../types';

const SYSTEM_PROMPT = `You are a booking concierge assistant for Browz — a beauty and brow salon in the UAE.
Your task is to classify the user's intent and extract relevant entities.
Return ONLY valid JSON. No preamble, no markdown, no explanation.

Intents:
- check_availability: user wants to know available slots
- create_booking: user wants to make a new booking
- modify_booking: user wants to change an existing booking
- cancel_booking: user wants to cancel an existing booking
- add_notes: user wants to add notes or preferences to a booking
- initiate_payment: user wants a payment link
- faq_general: user is asking about services, pricing, location, or policy
- escalate_human: user wants to speak to a person
- greeting_smalltalk: greeting or off-topic
- book_consultation: user wants to book a free consultation
- check_clearance_status: user asking about their clearance or patch test status
- check_frequency: user asking if they can rebook a service

Entities to extract (return null if not present):
- service: treatment name as mentioned by user
- branch: location mentioned by user
- date: absolute or relative date (convert to ISO format YYYY-MM-DD if possible)
- time: time as mentioned (convert to HH:MM 24h if possible)
- artistName: if a specific artist is named
- bookingReference: any booking or reference code mentioned
- notes: any preferences, health notes, or special requests mentioned
- paymentRequested: true if user is asking about payment

Response format:
{
  "intent": "<intent_id>",
  "entities": { ... },
  "confidence": <0.0–1.0>
}`;

function fallbackClassification(): ClassificationResultType {
  return { intent: 'greeting_smalltalk', entities: {}, confidence: 0 };
}

function extractService(message: string): string | undefined {
  const normalized = message.toLowerCase();
  return DEMO_SERVICES.find((service) => normalized.includes(service.name.toLowerCase()))?.name;
}

function extractBranch(message: string): string | undefined {
  const normalized = message.toLowerCase();
  return DEMO_BRANCHES.find(
    (branch) => normalized.includes(branch.name.toLowerCase()) || normalized.includes(branch.city.toLowerCase()),
  )?.name;
}

function extractDate(message: string): string | undefined {
  const normalized = message.toLowerCase();
  const explicit = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (explicit?.[1]) {
    return explicit[1];
  }

  if (normalized.includes('today')) {
    return toIsoDate(new Date());
  }

  if (normalized.includes('tomorrow')) {
    return toIsoDate(addDays(new Date(), 1));
  }

  if (normalized.includes('next week')) {
    return toIsoDate(addDays(new Date(), 7));
  }

  return undefined;
}

function extractTime(message: string): string | undefined {
  const match = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) {
    return undefined;
  }

  let hour = Number(match[1]);
  const minute = match[2] ?? '00';
  const meridian = match[3]?.toLowerCase();

  if (meridian === 'pm' && hour < 12) {
    hour += 12;
  }
  if (meridian === 'am' && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function extractBookingReference(message: string): string | undefined {
  return message.match(/\b(?:BRZ|CON|SCR)-[A-Z0-9-]+\b/i)?.[0];
}

function heuristicIntent(message: string): { intent: IntentId; confidence: number } {
  const normalized = message.toLowerCase();

  if (/(human|someone|person|reception|help me|call me)/.test(normalized)) {
    return { intent: 'escalate_human', confidence: 0.95 };
  }
  if (/(clearance|patch test|approved|screening status)/.test(normalized)) {
    return { intent: 'check_clearance_status', confidence: 0.8 };
  }
  if (/(too soon|rebook|how soon|again after)/.test(normalized)) {
    return { intent: 'check_frequency', confidence: 0.78 };
  }
  if (/(consultation)/.test(normalized)) {
    return { intent: 'book_consultation', confidence: 0.82 };
  }
  if (/(cancel)/.test(normalized)) {
    return { intent: 'cancel_booking', confidence: 0.9 };
  }
  if (/(move|change|reschedule|modify)/.test(normalized)) {
    return { intent: 'modify_booking', confidence: 0.87 };
  }
  if (/(note|preference|allergy|sensitive|special request)/.test(normalized)) {
    return { intent: 'add_notes', confidence: 0.75 };
  }
  if (/(pay|payment|deposit|payment link)/.test(normalized)) {
    return { intent: 'initiate_payment', confidence: 0.88 };
  }
  if (/(available|availability|slot|time do you have|what times)/.test(normalized)) {
    return { intent: 'check_availability', confidence: 0.84 };
  }
  if (/(book|reserve|schedule|appointment)/.test(normalized)) {
    return { intent: 'create_booking', confidence: 0.83 };
  }
  if (/(price|location|where|policy|service|hours|open)/.test(normalized)) {
    return { intent: 'faq_general', confidence: 0.7 };
  }
  if (/(hi|hello|hey)/.test(normalized)) {
    return { intent: 'greeting_smalltalk', confidence: 0.92 };
  }

  return { intent: 'greeting_smalltalk', confidence: 0.35 };
}

function heuristicClassify(message: string): ClassificationResultType {
  const intent = heuristicIntent(message);
  const entities = {
    service: extractService(message),
    branch: extractBranch(message),
    date: extractDate(message),
    time: extractTime(message),
    artistName: undefined,
    bookingReference: extractBookingReference(message),
    notes: /note|preference|allergy|sensitive/i.test(message) ? message : undefined,
    paymentRequested: /payment|deposit|pay/i.test(message) ? true : undefined,
  };

  return {
    intent: intent.intent,
    entities,
    confidence: intent.confidence,
  };
}

function parseJsonOutput(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function classifyIntent(message: string, conversationHistory: ConversationTurn[]): Promise<ClassificationResultType> {
  const lastTurns = conversationHistory.slice(-6);
  const fallback = heuristicClassify(message);

  if (!hasOpenAIConfig) {
    return fallback;
  }

  try {
    const systemMessage = SYSTEM_PROMPT;
    const userMessage = JSON.stringify({
      message,
      conversationHistory: lastTurns,
    });

    const text = await createChatCompletion([
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ]);

    const content = parseJsonOutput(text);
    if (content) {
      const parsed = ClassificationResult.safeParse(content);
      if (parsed.success) {
        return parsed.data;
      }
    }

    console.warn('classifyIntent received unparsable model output:', text);
  } catch (error) {
    console.error('classifyIntent failed, using heuristic fallback', error);
  }

  return fallback ?? fallbackClassification();
}
