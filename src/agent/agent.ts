import { checkPreBookingRequirements, checkTreatmentFrequency } from './gateChecker';
import { createBooking, modifyBooking, cancelBooking } from '../tools/bookings';
import { queryAvailability } from '../tools/availability';
import { createConsultation } from '../tools/consultations';
import { getClearanceStatus } from '../tools/clearances';
import { addNotes } from '../tools/notes';
import { generatePaymentLink } from '../tools/payment';
import { lookupFaq } from '../tools/faq';
import { submitScreening } from '../tools/screenings';
import { findBranchByName, findServiceByName, getDefaultBranch } from '../lib/catalog';
import { toIsoDate } from '../lib/dates';
import { createChatCompletion, hasLlmConfig } from '../lib/qwenClient';
import { appendTurn, getOrCreateSession, resolveUserIdentity, updateSession } from '../memory/sessionManager';
import type { SessionContext } from '../types';

const TOOL_DEFINITIONS = [
  {
    name: 'search_availability',
    description:
      'Find available appointment slots by service, branch, date, and optional time.',
  },
  {
    name: 'create_booking',
    description:
      'Create a new booking for a service, branch, date, and time. If payment is required, return the payment details as part of the result.',
  },
  {
    name: 'modify_booking',
    description: 'Move an existing booking to a new available slot.',
  },
  {
    name: 'cancel_booking',
    description: 'Cancel a booking using a booking reference.',
  },
  {
    name: 'add_notes',
    description: 'Add notes, preferences, or health details to an existing booking.',
  },
  {
    name: 'initiate_payment',
    description:
      'Generate a Stripe payment link for an existing booking reference.',
  },
  {
    name: 'lookup_faq',
    description:
      'Answer general questions about services, pricing, location, or salon policy.',
  },
  {
    name: 'book_consultation',
    description:
      'Book a consultation slot for a service that requires consultation or patch testing.',
  },
  {
    name: 'check_clearance_status',
    description:
      'Check a client clearance or medical screening status for a given service.',
  },
  {
    name: 'check_frequency',
    description:
      'Check whether a client can rebook a service based on frequency rules.',
  },
  {
    name: 'submit_screening',
    description:
      'Submit a medical screening questionnaire for T3 services and return whether questions were flagged.',
  },
  {
    name: 'check_pre_booking_requirements',
    description:
      'Verify whether a client is cleared to book a service or whether consultation/screening is required.',
  },
];

const TOOL_NAMES = new Set(TOOL_DEFINITIONS.map((tool) => tool.name));

const SYSTEM_PROMPT = `You are a Browz booking concierge assistant for a beauty salon in the UAE.
You must use the available tools to answer user requests. Do not invent booking data.

If the user needs a real booking or availability result, call the appropriate tool.
If the user asks for help, answer concisely and use tool results when available.
If you do not have enough information, ask a follow-up question.

TOOLS:
${TOOL_DEFINITIONS.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n')}

Your response MUST be a single JSON object with one of these shapes:

1) Tool invocation:
{
  "action": "tool",
  "tool_name": "<tool_name>",
  "tool_args": { ... }
}

2) Final answer:
{
  "action": "final_response",
  "response": "<human readable answer>"
}

Do not add any extra text outside the JSON object.
`;

interface AgentToolCall {
  action: 'tool';
  tool_name: string;
  tool_args: Record<string, unknown>;
}

interface AgentFinalResponse {
  action: 'final_response';
  response: string;
}

function isLikelyProviderEnvelope(raw: string): boolean {
  const parsed = parseJsonObject(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.action === 'string' || typeof record.tool_name === 'string') {
    return false;
  }

  const hasOllamaShape =
    typeof record.model === 'string' &&
    ('message' in record || 'response' in record || 'done' in record || 'created_at' in record);

  const hasOpenAIShape =
    Array.isArray(record.choices) &&
    ('id' in record || 'model' in record || 'created' in record);

  return hasOllamaShape || hasOpenAIShape;
}

function summarizeToolResult(toolName: string, toolResult: Record<string, unknown>): string | null {
  const success = toolResult.success !== false;
  const data = (toolResult.data as Record<string, unknown> | undefined) ?? undefined;
  const error = typeof toolResult.error === 'string' ? toolResult.error : null;
  console.log(toolResult);

  if (!success) {
    if (error === 'no_faq_match') {
      return "I couldn't find a matching FAQ for that just now. Please ask a more specific question about pricing, policy, aftercare, or a treatment.";
    }
    if (error === 'service_not_found') {
      return "I couldn't match that service yet. If you tell me the treatment name, I can help more precisely.";
    }
    return "I couldn't complete that request just now. Please try again with a little more detail.";
  }

  switch (toolName) {
    case 'lookup_faq':
      return typeof data?.answer === 'string' ? data.answer : 'I found the relevant service information for you.';
    case 'search_availability': {
      const slots = Array.isArray(data) ? data : Array.isArray(data?.slots) ? data.slots : toolResult.data;
      if (!Array.isArray(slots) || slots.length === 0) {
        return "I couldn't find any available times for that request just now.";
      }
      const formatted = slots
        .slice(0, 6)
        .map((slot) => {
          const value = slot as { startTime?: string };
          return value.startTime ? new Date(value.startTime).toISOString().slice(11, 16) : null;
        })
        .filter(Boolean)
        .join(', ');
      return formatted
        ? `Here are the available times I found: ${formatted}.`
        : 'I found available slots for that request.';
    }
    case 'create_booking':
      if (typeof data?.bookingId === 'string') {
        return `Your booking has been created successfully. Your booking reference is ${data.bookingId}.`;
      }
      return 'Your booking has been created successfully.';
    case 'book_consultation':
      if (typeof data?.consultationId === 'string') {
        return `Your consultation has been booked. Your consultation reference is ${data.consultationId}.`;
      }
      return 'Your consultation has been booked successfully.';
    case 'initiate_payment':
      if (typeof data?.paymentLink === 'string') {
        return `Your payment link is ready: ${data.paymentLink}`;
      }
      return 'Your payment link is ready.';
    case 'check_clearance_status':
      if (typeof data?.status === 'string') {
        return typeof data.validUntil === 'string'
          ? `Your clearance status is ${data.status}, valid until ${String(data.validUntil).slice(0, 10)}.`
          : `Your clearance status is ${data.status}.`;
      }
      return 'I checked your clearance status.';
    case 'check_frequency':
      if (data?.tooSoon === true && typeof data.earliestDate === 'string') {
        return `It is a little early to rebook that treatment. The earliest recommended date is ${data.earliestDate}.`;
      }
      if (data?.tooSoon === false) {
        return "You're within the recommended interval for that service.";
      }
      return 'I checked the rebooking frequency for that service.';
    case 'add_notes':
      return 'Your notes have been added to the booking.';
    case 'modify_booking':
      return typeof data?.bookingId === 'string'
        ? `Your booking ${data.bookingId} has been updated successfully.`
        : 'Your booking has been updated successfully.';
    case 'cancel_booking':
      return typeof data?.bookingId === 'string'
        ? `Your booking ${data.bookingId} has been cancelled successfully.`
        : 'Your booking has been cancelled successfully.';
    case 'submit_screening':
      return 'Your screening has been submitted successfully and will be reviewed by the team.';
    case 'check_pre_booking_requirements':
      return success
        ? 'You are cleared to proceed with booking.'
        : "There is a pre-booking requirement that needs to be completed before we can confirm this treatment.";
    default:
      return null;
  }
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      try {
        return JSON.parse(line);
      } catch {
        // Keep looking for a parseable JSON line or embedded object.
      }
    }

    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseAgentOutput(raw: string): AgentToolCall | AgentFinalResponse {
  const cleanedRaw = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = parseJsonObject(cleanedRaw);
  if (parsed && typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    const action = typeof obj.action === 'string' ? obj.action : null;
    const explicitToolName = typeof obj.tool_name === 'string' ? obj.tool_name : null;
    const inferredToolName =
      explicitToolName ??
      (action && TOOL_NAMES.has(action) ? action : null);

    if (
      inferredToolName &&
      action !== 'final_response'
    ) {
      return {
        action: 'tool',
        tool_name: inferredToolName,
        tool_args: (obj.tool_args as Record<string, unknown>) ?? {},
      };
    }
    if (obj.action === 'final_response' && typeof obj.response === 'string') {
      const response = obj.response.trim();
      return {
        action: 'final_response',
        response: response || cleanedRaw,
      };
    }
  }

  return {
    action: 'final_response',
    response: cleanedRaw,
  };
}

function resolveServiceName(service?: string) {
  if (!service) {
    return null;
  }
  return findServiceByName(service);
}

function resolveBranchName(branch?: string) {
  if (!branch) {
    return getDefaultBranch();
  }
  return findBranchByName(branch);
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  session: SessionContext,
): Promise<Record<string, unknown>> {
  const safeArgs = { ...args };

  switch (name) {
    case 'search_availability': {
      const service = await resolveServiceName(String(safeArgs.service ?? ''));
      const branch = await resolveBranchName(String(safeArgs.branch ?? ''));
      if (!service) {
        return { success: false, error: 'service_not_found' };
      }
      if (!branch) {
        return { success: false, error: 'branch_not_found' };
      }
      const date = String(safeArgs.date ?? toIsoDate(new Date(Date.now() + 86400000)));
      const availability = await queryAvailability({
        serviceId: service.id,
        branchId: branch.id,
        date,
        artistId: undefined,
      });
      return {
        success: availability.success,
        data: availability.data,
        error: availability.error,
      };
    }
    case 'create_booking': {
      const service = await resolveServiceName(String(safeArgs.service ?? ''));
      const branch = await resolveBranchName(String(safeArgs.branch ?? ''));
      if (!service) {
        return { success: false, error: 'service_not_found' };
      }
      const gate = await checkPreBookingRequirements(service.id, session.clientId);
      if (!gate.gateCleared) {
        return { success: false, error: 'gate_blocked', reason: gate.reason };
      }
      const date = String(safeArgs.date ?? toIsoDate(new Date(Date.now() + 86400000)));
      if (!branch) {
        return { success: false, error: 'branch_not_found' };
      }
      const availability = await queryAvailability({
        serviceId: service.id,
        branchId: branch.id,
        date,
      });
      if (!availability.success || !availability.data?.length) {
        return { success: false, error: 'no_slots_available' };
      }
      const matchingSlot = availability.data.find((slot) => {
        const timeArg = safeArgs.time;
        if (!timeArg) {
          return true;
        }
        return slot.startTime.slice(11, 16) === String(timeArg);
      }) ?? availability.data[0];
      if (!matchingSlot) {
        return { success: false, error: 'no_slots_available' };
      }

      const booking = await createBooking({
        clientId: session.clientId,
        visitorContact: session.whatsappNumber ?? undefined,
        serviceId: service.id,
        branchId: branch.id,
        slotId: matchingSlot.id,
        notes: String(safeArgs.notes ?? ''),
        channel: session.channel,
        bookingType: String(safeArgs.bookingType ?? 'single') as 'single' | 'consultation' | 'package_first_session',
      });

      if (!booking.success || !booking.data) {
        return { success: false, error: booking.error ?? 'booking_failed' };
      }

      return {
        success: true,
        data: {
          bookingId: booking.data.bookingId,
          paymentRule: booking.data.paymentRule,
          service: service.name,
          branch: branch.name,
          slotStart: matchingSlot.startTime,
        },
      };
    }
    case 'modify_booking': {
      const bookingRef = String(safeArgs.bookingReference ?? '');
      const service = await resolveServiceName(String(safeArgs.service ?? ''));
      if (!bookingRef) {
        return { success: false, error: 'booking_reference_required' };
      }
      if (!session.clientId) {
        return { success: false, error: 'client_required' };
      }
      if (!service) {
        return { success: false, error: 'service_not_found' };
      }
      const branch = await resolveBranchName(String(safeArgs.branch ?? ''));
      if (!branch) {
        return { success: false, error: 'branch_not_found' };
      }
      const date = String(safeArgs.date ?? toIsoDate(new Date(Date.now() + 86400000)));
      const availability = await queryAvailability({
        serviceId: service.id,
        branchId: branch.id,
        date,
      });
      if (!availability.success || !availability.data?.length) {
        return { success: false, error: 'no_slots_available' };
      }
      const matchingSlot = availability.data.find((slot) => {
        const timeArg = safeArgs.time;
        if (!timeArg) {
          return true;
        }
        return slot.startTime.slice(11, 16) === String(timeArg);
      }) ?? availability.data[0];
      if (!matchingSlot) {
        return { success: false, error: 'no_slots_available' };
      }

      const result = await modifyBooking({
        bookingRef,
        newSlotId: matchingSlot.id,
        clientId: session.clientId,
      });
      return { success: result.success, data: result.data, error: result.error };
    }
    case 'cancel_booking': {
      const bookingRef = String(safeArgs.bookingReference ?? '');
      if (!bookingRef) {
        return { success: false, error: 'booking_reference_required' };
      }
      if (!session.clientId) {
        return { success: false, error: 'client_required' };
      }
      const result = await cancelBooking({ bookingRef, clientId: session.clientId });
      return { success: result.success, data: result.data, error: result.error };
    }
    case 'add_notes': {
      const bookingRef = String(safeArgs.bookingReference ?? '');
      const notes = String(safeArgs.notes ?? '');
      if (!bookingRef || !notes) {
        return { success: false, error: 'booking_reference_or_notes_missing' };
      }
      const result = await addNotes({ bookingRef, notes });
      return { success: result.success, error: result.error };
    }
    case 'initiate_payment': {
      const bookingRef = String(safeArgs.bookingReference ?? '');
      if (!bookingRef) {
        return { success: false, error: 'booking_reference_required' };
      }
      const result = await generatePaymentLink({
        bookingRef,
        amountAed: Number(safeArgs.amountAed ?? 0),
        paymentType: String(safeArgs.paymentType ?? 'deposit') as 'full_upfront' | 'deposit' | 'package',
        description: String(safeArgs.description ?? `Booking ${bookingRef}`),
      });
      return { success: result.success, data: result.data, error: result.error };
    }
    case 'lookup_faq': {
      const query = String(safeArgs.query ?? safeArgs.question ?? '');
      if (!query) {
        return { success: false, error: 'query_required' };
      }
      const result = await lookupFaq({ query });
      return { success: result.success, data: result.data, error: result.error };
    }
    case 'book_consultation': {
      const service = await resolveServiceName(String(safeArgs.service ?? ''));
      const branch = await resolveBranchName(String(safeArgs.branch ?? ''));
      if (!service) {
        return { success: false, error: 'service_not_found' };
      }
      if (!branch) {
        return { success: false, error: 'branch_not_found' };
      }
      const date = String(safeArgs.date ?? toIsoDate(new Date(Date.now() + 86400000)));
      const availability = await queryAvailability({
        serviceId: service.id,
        branchId: branch.id,
        date,
      });
      if (!availability.success || !availability.data?.length) {
        return { success: false, error: 'no_slots_available' };
      }
      const slot = availability.data[0];
      if (!slot) {
        return { success: false, error: 'no_slots_available' };
      }
      const result = await createConsultation({
        clientId: session.clientId,
        visitorContact: session.whatsappNumber ?? undefined,
        serviceId: service.id,
        serviceCategory: service.gateCategory,
        branchId: branch.id,
        slotId: slot.id,
      });
      return { success: result.success, data: result.data, error: result.error };
    }
    case 'check_clearance_status': {
      const service = await resolveServiceName(String(safeArgs.service ?? ''));
      if (!service) {
        return { success: false, error: 'service_not_found' };
      }
      if (!session.clientId) {
        return { success: false, error: 'client_required' };
      }
      const result = await getClearanceStatus({
        clientId: session.clientId,
        serviceId: service.id,
        serviceTier: service.serviceTier as 'T2' | 'T3',
      });
      return { success: result.success, data: result.data, error: result.error };
    }
    case 'check_frequency': {
      const service = await resolveServiceName(String(safeArgs.service ?? ''));
      if (!service) {
        return { success: false, error: 'service_not_found' };
      }
      if (!session.clientId) {
        return { success: false, error: 'client_required' };
      }
      const result = await checkTreatmentFrequency(session.clientId, service.id);
      return { success: true, data: result };
    }
    case 'submit_screening': {
      const service = await resolveServiceName(String(safeArgs.service ?? ''));
      if (!service) {
        return { success: false, error: 'service_not_found' };
      }
      const answers = safeArgs.answers as Record<string, unknown> | undefined;
      if (!answers) {
        return { success: false, error: 'answers_required' };
      }
      const result = await submitScreening({
        clientId: session.clientId,
        visitorContact: session.whatsappNumber ?? undefined,
        serviceCategory: service.gateCategory,
        answers: answers as any,
      });
      return { success: result.success, data: result.data, error: result.error };
    }
    case 'check_pre_booking_requirements': {
      const service = await resolveServiceName(String(safeArgs.service ?? ''));
      if (!service) {
        return { success: false, error: 'service_not_found' };
      }
      const result = await checkPreBookingRequirements(service.id, session.clientId);
      return { success: result.gateCleared, data: result, error: result.gateCleared ? undefined : result.reason };
    }
    default:
      return { success: false, error: `unknown_tool:${name}` };
  }
}

async function buildConversationMessages(
  session: SessionContext,
  userMessage: string,
): Promise<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  for (const turn of session.conversationHistory.slice(-8)) {
    messages.push({
      role: turn.role === 'agent' ? 'assistant' : 'user',
      content: turn.content,
    });
  }

  messages.push({ role: 'user', content: userMessage });
  return messages;
}

export async function runAgent(params: {
  message: string;
  sessionId?: string;
  channel: 'web' | 'whatsapp';
  authToken?: string;
  whatsappNumber?: string;
}): Promise<{ response: string; sessionId: string; toolCalls: { name: string; args: Record<string, unknown> }[] }> {
  if (!hasLlmConfig) {
    return {
      response:
        'LLM is not configured. Please set OPENAI_API_KEY, OPENROUTER_API_KEY, or configure a local Ollama instance and try again.',
      sessionId: params.sessionId ?? 'unknown',
      toolCalls: [],
    };
  }

  const identity = await resolveUserIdentity(params.authToken, params.whatsappNumber);
  const session = await getOrCreateSession(params.sessionId, params.channel, identity.clientId, params.whatsappNumber ?? null);
  const enrichedSession = await updateSession(session.sessionId, {
    clientId: identity.clientId,
    userTier: identity.userTier,
    whatsappNumber: params.whatsappNumber ?? session.whatsappNumber,
  });

  const activeSession = enrichedSession ?? session;
  const messages = await buildConversationMessages(activeSession, params.message);
  const executedToolCalls: { name: string; args: Record<string, unknown> }[] = [];
  let lastToolName: string | null = null;
  let lastToolResult: Record<string, unknown> | null = null;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const raw = await createChatCompletion(messages);
    if (!raw.trim()) {
      const emptyProviderFallback =
        lastToolName && lastToolResult
          ? (summarizeToolResult(lastToolName, lastToolResult) ??
            'I completed the booking checks, but the model returned an empty message.')
          : 'I did not receive any text back from the model. Please try again, or ask in a more specific way like "check Brow Threading availability tomorrow".';

      await appendTurn(activeSession.sessionId, {
        role: 'user',
        content: params.message,
        timestamp: new Date().toISOString(),
      });
      await appendTurn(activeSession.sessionId, {
        role: 'agent',
        content: emptyProviderFallback,
        timestamp: new Date().toISOString(),
      });

      return {
        response: emptyProviderFallback,
        sessionId: activeSession.sessionId,
        toolCalls: executedToolCalls,
      };
    }

    const decoded = parseAgentOutput(raw);

    if (decoded.action === 'final_response') {
      const responseText =
        decoded.response.trim() ||
        (isLikelyProviderEnvelope(raw) && lastToolName && lastToolResult
          ? summarizeToolResult(lastToolName, lastToolResult) ?? ''
          : raw.trim());
      await appendTurn(activeSession.sessionId, {
        role: 'user',
        content: params.message,
        timestamp: new Date().toISOString(),
      });
      await appendTurn(activeSession.sessionId, {
        role: 'agent',
        content: responseText,
        timestamp: new Date().toISOString(),
      });
      await updateSession(activeSession.sessionId, {
        lastIntent: null,
      });
      return { response: responseText, sessionId: activeSession.sessionId, toolCalls: executedToolCalls };
    }

    const toolName = decoded.tool_name;
    const toolArgs = decoded.tool_args ?? {};
    executedToolCalls.push({ name: toolName, args: toolArgs });

    const toolResult = await executeTool(toolName, toolArgs, activeSession);
    lastToolName = toolName;
    lastToolResult = toolResult;
    messages.push({
      role: 'assistant',
      content: JSON.stringify({ tool_name: toolName, tool_args: toolArgs, tool_result: toolResult }),
    });
  }

  const fallback = 'I reached the maximum number of tool calls while trying to answer. Please ask in a more specific way.';
  await appendTurn(activeSession.sessionId, {
    role: 'user',
    content: params.message,
    timestamp: new Date().toISOString(),
  });
  await appendTurn(activeSession.sessionId, {
    role: 'agent',
    content: fallback,
    timestamp: new Date().toISOString(),
  });

  return { response: fallback, sessionId: activeSession.sessionId, toolCalls: executedToolCalls };
}
