import { createChatCompletion, MODEL, hasOpenAIConfig } from '../lib/qwenClient';
import { getBranchById, getServiceById } from '../lib/catalog';
import type { IntentId, SessionContext, ToolResult } from '../types';

const SYSTEM_PROMPT = `You are a warm, professional booking concierge for Browz — a beauty and brow salon in the UAE.
Generate a concise, brand-aligned response based on the tool result provided.
Rules:
- Maximum 4 sentences. Plain text only. No markdown.
- If confirming a booking, always include: service name, branch, date, time, and booking reference.
- If presenting availability, format as a short list of times preceded by a bullet "•".
- If explaining a gate requirement, be warm and clear — always offer the next step.
- If confirming a payment link, always include the amount and "valid for 24 hours".
- Do not invent data. Only use what is in the tool result.
- For hard frequency blocks, explain the medical reason and give the earliest eligible date.`;

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      if (typeof item === 'object' && item && 'text' in item) {
        return String(item.text);
      }
      return '';
    })
    .join('');
}

async function deterministicResponse(intent: IntentId, toolResult: ToolResult): Promise<string> {
  if (!toolResult.success) {
    return "I'm sorry, I couldn't complete that just now. Let me connect you with our team.";
  }

  switch (intent) {
    case 'check_availability': {
      const slots = (toolResult.data as { startTime: string }[]) ?? [];
      if (slots.length === 0) {
        return "I couldn't find any available times for that request just now. If you'd like, I can help check another day or branch.";
      }
      const formatted = slots
        .map((slot) => `• ${new Date(slot.startTime).toISOString().slice(11, 16)}`)
        .join('\n');
      return `Here are the available times I found:\n${formatted}`;
    }
    case 'create_booking': {
      const data = toolResult.data as { bookingId: string; summary?: { serviceId?: string; branchId?: string; slotStart?: string } };
      const service = data.summary?.serviceId ? await getServiceById(data.summary.serviceId) : null;
      const branch = data.summary?.branchId ? await getBranchById(data.summary.branchId) : null;
      const date = data.summary?.slotStart ? data.summary.slotStart.slice(0, 10) : 'your selected date';
      const time = data.summary?.slotStart ? new Date(data.summary.slotStart).toISOString().slice(11, 16) : 'your selected time';
      return `Your booking is confirmed for ${service?.name ?? 'your service'} at ${branch?.name ?? 'Browz'} on ${date} at ${time}. Your booking reference is ${data.bookingId}.`;
    }
    case 'modify_booking':
      return `Your booking ${String((toolResult.data as { bookingId: string }).bookingId)} has been updated with the new time.`;
    case 'cancel_booking':
      return `Your booking ${String((toolResult.data as { bookingId: string }).bookingId)} has been cancelled successfully.`;
    case 'book_consultation':
      return `Your consultation request is booked. Your consultation reference is ${String((toolResult.data as { consultationId: string }).consultationId)}.`;
    case 'initiate_payment': {
      const paymentLink = String((toolResult.data as { paymentLink: string }).paymentLink);
      return `Your payment link is ready: ${paymentLink}. It is valid for 24 hours.`;
    }
    case 'check_clearance_status': {
      const data = toolResult.data as { status: string; validUntil?: string };
      return data.validUntil
        ? `Your clearance status is ${data.status}, and it is valid until ${data.validUntil.slice(0, 10)}.`
        : `Your clearance status is ${data.status}.`;
    }
    case 'check_frequency': {
      const data = toolResult.data as { tooSoon: boolean; earliestDate?: string };
      return data.tooSoon
        ? `It is a little early to rebook that service. The earliest recommended date is ${data.earliestDate}.`
        : `You're within the recommended interval for that service.`;
    }
    case 'faq_general':
      return String((toolResult.data as { answer: string }).answer);
    case 'add_notes':
      return 'Your notes have been added to the booking.';
    default:
      return 'How can I help you with your Browz booking today?';
  }
}

export async function generateResponse(params: {
  intent: IntentId;
  toolResult: ToolResult;
  sessionContext: SessionContext;
  channel: 'web' | 'whatsapp';
}): Promise<string> {
  if (!hasOpenAIConfig) {
    return deterministicResponse(params.intent, params.toolResult);
  }

  try {
    const systemMessage = SYSTEM_PROMPT;
    const userMessage = JSON.stringify(params);
    const text = await createChatCompletion([
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ]);

    if (text.trim()) {
      return text.trim();
    }
  } catch (error) {
    console.error('generateResponse failed, using deterministic fallback', error);
  }

  return deterministicResponse(params.intent, params.toolResult);
}
