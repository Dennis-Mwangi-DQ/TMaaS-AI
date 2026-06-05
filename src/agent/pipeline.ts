import { checkPreBookingRequirements, checkTreatmentFrequency } from './gateChecker';
import { classifyIntent } from './intentClassifier';
import { generateResponse } from './responseGenerator';
import { findBranchByName, findServiceByName, getServiceById, getDefaultBranch } from '../lib/catalog';
import { parseYesNo, toIsoDate } from '../lib/dates';
import { ok } from '../lib/result';
import { escalate } from '../escalation/escalationHandler';
import { logTurn } from '../logger';
import { appendTurn, getOrCreateSession, resolveUserIdentity, updateSession } from '../memory/sessionManager';
import { queryAvailability } from '../tools/availability';
import { createBooking, modifyBooking, cancelBooking } from '../tools/bookings';
import { getClearanceStatus } from '../tools/clearances';
import { createConsultation } from '../tools/consultations';
import { lookupFaq } from '../tools/faq';
import { addNotes } from '../tools/notes';
import { generatePaymentLink } from '../tools/payment';
import { submitScreening } from '../tools/screenings';
import { supabase } from '../db/supabaseClient';
import type { AgentPipelineResult, IntentId, ScreeningAnswers, SessionContext, ToolResult } from '../types';

const SCREENING_QUESTIONS = [
  'Are you currently pregnant or breastfeeding?',
  'Are you taking any blood thinners or anticoagulants?',
  'Do you have any known allergies to anaesthetics, lidocaine, or hyaluronic acid?',
  'Have you had any facial surgery or aesthetic procedures in the last 6 months? If yes, please give a brief detail.',
  'Do you have any active skin infections, cold sores, or open wounds on the treatment area?',
  'Do you have any autoimmune conditions, or are you taking immunosuppressant medication?',
] as const;

const CLIENT_ONLY_INTENTS = new Set<IntentId>([
  'modify_booking',
  'cancel_booking',
  'initiate_payment',
  'check_clearance_status',
]);

function screeningField(index: number): keyof ScreeningAnswers {
  return [
    'q1Pregnant',
    'q2BloodThinners',
    'q3Allergies',
    'q4PriorProcedures',
    'q5ActiveInfection',
    'q6Autoimmune',
  ][index] as keyof ScreeningAnswers;
}

function getQuickReplies(intent: IntentId): string[] | undefined {
  switch (intent) {
    case 'check_availability':
      return ['Book this slot', 'Check another day', 'Ask about pricing'];
    case 'create_booking':
      return ['Send payment link', 'Add notes', 'Talk to reception'];
    case 'faq_general':
      return ['Check availability', 'Book a consultation', 'Talk to reception'];
    default:
      return undefined;
  }
}

async function finalizeTurn(params: {
  session: SessionContext;
  userMessage: string;
  response: string;
  intent: IntentId;
  confidence: number;
  entities: Record<string, unknown>;
  toolCalled: string;
  toolResult: unknown;
  startedAt: number;
  escalated?: boolean;
  lastBookingRef?: string | null;
  quickReplies?: string[];
}): Promise<AgentPipelineResult> {
  const toolResult =
    typeof params.toolResult === 'object' && params.toolResult !== null
      ? (params.toolResult as Record<string, unknown>)
      : { value: params.toolResult };

  await appendTurn(params.session.sessionId, {
    role: 'user',
    content: params.userMessage,
    intent: params.intent,
    confidence: params.confidence,
    timestamp: new Date().toISOString(),
  });

  await appendTurn(params.session.sessionId, {
    role: 'agent',
    content: params.response,
    intent: params.intent,
    confidence: params.confidence,
    timestamp: new Date().toISOString(),
  });

  await updateSession(params.session.sessionId, {
    lastIntent: params.intent,
    lastBookingRef: params.lastBookingRef ?? params.session.lastBookingRef,
    status: params.escalated ? 'escalated' : params.session.status,
  });

  await logTurn({
    sessionId: params.session.sessionId,
    turn: params.session.conversationHistory.length + 1,
    channel: params.session.channel,
    userMessage: params.userMessage,
    intent: params.intent,
    confidence: params.confidence,
    entitiesExtracted: params.entities,
    toolCalled: params.toolCalled,
    toolResult,
    agentResponse: params.response,
    latencyMs: Date.now() - params.startedAt,
    escalated: Boolean(params.escalated),
  });

  return {
    response: params.response,
    sessionId: params.session.sessionId,
    quickReplies: params.quickReplies,
  };
}

async function handleEscalation(session: SessionContext, message: string, reason: Parameters<typeof escalate>[0]['reason'], startedAt: number, intent: IntentId, confidence: number, entities: Record<string, unknown>): Promise<AgentPipelineResult> {
  await escalate({
    sessionId: session.sessionId,
    reason,
    channel: session.channel,
    lastMessage: message,
  });

  return finalizeTurn({
    session,
    userMessage: message,
    response: "Let me connect you with our team - they'll be with you shortly.",
    intent,
    confidence,
    entities,
    toolCalled: 'escalationHandler.escalate',
    toolResult: { reason },
    startedAt,
    escalated: true,
  });
}

async function retryTool<T>(name: string, action: () => Promise<ToolResult<T>>): Promise<{ toolName: string; result: ToolResult<T> }> {
  const firstAttempt = await action();
  if (firstAttempt.success) {
    return { toolName: name, result: firstAttempt };
  }

  const secondAttempt = await action();
  return { toolName: name, result: secondAttempt };
}

async function resolveRequestedSlot(serviceId: string, branchId: string, date: string, preferredTime?: string) {
  const availability = await queryAvailability({ serviceId, branchId, date });
  if (!availability.success || !availability.data || availability.data.length === 0) {
    return { slot: null, availability };
  }

  const exact = preferredTime
    ? availability.data.find((slot) => new Date(slot.startTime).toISOString().slice(11, 16) === preferredTime)
    : undefined;

  return { slot: exact ?? availability.data[0], availability };
}

async function handleScreeningTurn(session: SessionContext, message: string, startedAt: number): Promise<AgentPipelineResult> {
  const screeningState = session.screeningState;
  if (!screeningState) {
    return finalizeTurn({
      session,
      userMessage: message,
      response: "I couldn't continue the screening just now. Let me connect you with our team.",
      intent: 'greeting_smalltalk',
      confidence: 0,
      entities: {},
      toolCalled: 'screeningState',
      toolResult: { error: 'missing_screening_state' },
      startedAt,
      escalated: true,
    });
  }

  const answer = parseYesNo(message);
  const field = screeningField(screeningState.currentQuestion);

  if (answer == null && screeningState.currentQuestion !== 3) {
    return finalizeTurn({
      session,
      userMessage: message,
      response: `Please reply with yes or no. ${SCREENING_QUESTIONS[screeningState.currentQuestion]}`,
      intent: 'create_booking',
      confidence: 1,
      entities: { screening: true },
      toolCalled: 'screeningState',
      toolResult: { currentQuestion: screeningState.currentQuestion },
      startedAt,
    });
  }

  const updatedAnswers = {
    ...screeningState.answers,
    [field]: answer ?? /yes/i.test(message),
  } as Partial<ScreeningAnswers>;

  if (screeningState.currentQuestion === 3 && /yes/i.test(message)) {
    updatedAnswers.q4Detail = message;
  }

  if (screeningState.currentQuestion < SCREENING_QUESTIONS.length - 1) {
    await updateSession(session.sessionId, {
      screeningState: {
        ...screeningState,
        currentQuestion: screeningState.currentQuestion + 1,
        answers: updatedAnswers,
      },
    });

    return finalizeTurn({
      session: {
        ...session,
        screeningState: {
          ...screeningState,
          currentQuestion: screeningState.currentQuestion + 1,
          answers: updatedAnswers,
        },
      },
      userMessage: message,
      response: SCREENING_QUESTIONS[screeningState.currentQuestion + 1] ?? SCREENING_QUESTIONS[0],
      intent: 'create_booking',
      confidence: 1,
      entities: { screening: true },
      toolCalled: 'screeningState',
      toolResult: { currentQuestion: screeningState.currentQuestion + 1 },
      startedAt,
    });
  }

  const screeningResult = await submitScreening({
    clientId: session.clientId,
    visitorContact: session.whatsappNumber ?? undefined,
    serviceCategory: screeningState.serviceCategory,
    answers: updatedAnswers as ScreeningAnswers,
  });

  await updateSession(session.sessionId, {
    screeningState: undefined,
  });

  const response = screeningResult.success
    ? 'Thank you. Your medical screening has been submitted for review, and our team will update you within 24 hours.'
    : "I couldn't submit your screening just now, so I'll connect you with our team to help.";

  return finalizeTurn({
    session: {
      ...session,
      screeningState: undefined,
    },
    userMessage: message,
    response,
    intent: 'create_booking',
    confidence: 1,
    entities: { screening: true },
    toolCalled: 'submitScreening',
    toolResult: screeningResult,
    startedAt,
    escalated: !screeningResult.success,
  });
}

async function fetchBookingPaymentContext(bookingRef: string) {
  if (!supabase) {
    return { amountAed: 100, description: `Booking ${bookingRef}` };
  }

  const { data } = await supabase
    .from('bookings')
    .select('id, deposit_amount_aed, payment_type, service_id')
    .eq('id', bookingRef)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const service = data.service_id ? await getServiceById(String(data.service_id)) : null;
  return {
    amountAed: Number(data.deposit_amount_aed ?? 100),
    paymentType: String(data.payment_type ?? 'deposit') as 'full_upfront' | 'deposit' | 'package',
    description: service ? `${service.name} payment` : `Booking ${bookingRef}`,
  };
}

export async function runAgentPipeline(params: {
  message: string;
  sessionId: string;
  channel: 'web' | 'whatsapp';
  authToken?: string;
  whatsappNumber?: string;
}): Promise<AgentPipelineResult> {
  const startedAt = Date.now();
  const identity = await resolveUserIdentity(params.authToken, params.whatsappNumber);
  const session = await getOrCreateSession(params.sessionId, params.channel, identity.clientId, params.whatsappNumber ?? null);
  const mergedSession = (await updateSession(session.sessionId, {
    userTier: identity.userTier,
    clientId: identity.clientId,
    whatsappNumber: params.whatsappNumber ?? session.whatsappNumber,
  })) ?? session;

  if (mergedSession.screeningState?.active) {
    return handleScreeningTurn(mergedSession, params.message, startedAt);
  }

  const classification = await classifyIntent(params.message, mergedSession.conversationHistory);
  const entities = classification.entities ?? {};

  if (classification.confidence < 0.6) {
    if (mergedSession.clarificationCount >= 1) {
      return handleEscalation(mergedSession, params.message, 'low_confidence', startedAt, classification.intent, classification.confidence, entities);
    }

    await updateSession(mergedSession.sessionId, {
      clarificationCount: mergedSession.clarificationCount + 1,
    });

    return finalizeTurn({
      session: {
        ...mergedSession,
        clarificationCount: mergedSession.clarificationCount + 1,
      },
      userMessage: params.message,
      response: "Could you tell me a bit more about what you're looking for?",
      intent: classification.intent,
      confidence: classification.confidence,
      entities,
      toolCalled: 'clarification',
      toolResult: { reason: 'low_confidence' },
      startedAt,
    });
  }

  if (classification.intent === 'escalate_human') {
    return handleEscalation(mergedSession, params.message, 'user_requested', startedAt, classification.intent, classification.confidence, entities);
  }

  if (CLIENT_ONLY_INTENTS.has(classification.intent) && mergedSession.userTier === 'visitor') {
    return finalizeTurn({
      session: mergedSession,
      userMessage: params.message,
      response: 'This request needs a logged-in client profile. Please log in or contact reception and we will help right away.',
      intent: classification.intent,
      confidence: classification.confidence,
      entities,
      toolCalled: 'clientOnlyGuard',
      toolResult: { blocked: true },
      startedAt,
    });
  }

  let frequencyWarning: string | null = null;
  let resolvedService = await findServiceByName(entities.service);
  const resolvedBranch = (await findBranchByName(entities.branch)) ?? getDefaultBranch();

  if ((classification.intent === 'check_availability' || classification.intent === 'create_booking') && resolvedService) {
    const gateResult = await checkPreBookingRequirements(resolvedService.id, mergedSession.clientId);
    if (!gateResult.gateCleared) {
      if (gateResult.reason === 'consultation_and_patch_test_required') {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: 'This treatment needs a consultation and patch test before we can confirm a booking. I can help you book that consultation next.',
          intent: 'book_consultation',
          confidence: classification.confidence,
          entities,
          toolCalled: 'checkPreBookingRequirements',
          toolResult: gateResult,
          startedAt,
          quickReplies: ['Book consultation', 'Ask about branches', 'Talk to reception'],
        });
      }

      if (gateResult.reason === 'screening_under_review') {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: 'Your medical screening is currently under review. Our team usually updates clients within 24 hours.',
          intent: classification.intent,
          confidence: classification.confidence,
          entities,
          toolCalled: 'checkPreBookingRequirements',
          toolResult: gateResult,
          startedAt,
        });
      }

      await updateSession(mergedSession.sessionId, {
        screeningState: {
          active: true,
          serviceCategory: resolvedService.gateCategory,
          currentQuestion: 0,
          answers: {},
        },
      });

      return finalizeTurn({
        session: {
          ...mergedSession,
          screeningState: {
            active: true,
            serviceCategory: resolvedService.gateCategory,
            currentQuestion: 0,
            answers: {},
          },
        },
        userMessage: params.message,
        response: SCREENING_QUESTIONS[0],
        intent: classification.intent,
        confidence: classification.confidence,
        entities,
        toolCalled: 'screeningState',
        toolResult: { started: true },
        startedAt,
      });
    }

    if (mergedSession.clientId) {
      const frequency = await checkTreatmentFrequency(mergedSession.clientId, resolvedService.id);
      if (frequency.tooSoon && frequency.hardBlock) {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: `For medical safety, we can't rebook that treatment yet. The earliest eligible date is ${frequency.earliestDate}.`,
          intent: 'check_frequency',
          confidence: classification.confidence,
          entities,
          toolCalled: 'checkTreatmentFrequency',
          toolResult: frequency,
          startedAt,
        });
      }

      if (frequency.tooSoon) {
        frequencyWarning = `A quick note: this service is usually recommended from ${frequency.earliestDate}, but I can still help with the next steps.`;
      }
    }
  }

  let toolName = 'none';
  let toolResult: ToolResult = ok({});
  let lastBookingRef: string | null = mergedSession.lastBookingRef;

  switch (classification.intent) {
    case 'check_availability': {
      if (!resolvedService) {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: 'Which treatment would you like me to check availability for?',
          intent: classification.intent,
          confidence: classification.confidence,
          entities,
          toolCalled: 'serviceResolution',
          toolResult: { error: 'service_not_found' },
          startedAt,
        });
      }
      const service = resolvedService;

      const availability = await retryTool('queryAvailability', () =>
        queryAvailability({
          serviceId: service.id,
          branchId: resolvedBranch.id,
          date: entities.date ?? toIsoDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
        }),
      );
      toolName = availability.toolName;
      toolResult = availability.result;
      break;
    }
    case 'create_booking': {
      if (!resolvedService) {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: 'Which treatment would you like to book?',
          intent: classification.intent,
          confidence: classification.confidence,
          entities,
          toolCalled: 'serviceResolution',
          toolResult: { error: 'service_not_found' },
          startedAt,
        });
      }

      const desiredDate = entities.date ?? toIsoDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
      const resolvedSlot = await resolveRequestedSlot(resolvedService.id, resolvedBranch.id, desiredDate, entities.time);

      if (!resolvedSlot.slot) {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: "I couldn't find an open slot for that request just now. If you'd like, I can check another day.",
          intent: classification.intent,
          confidence: classification.confidence,
          entities,
          toolCalled: 'queryAvailability',
          toolResult: resolvedSlot.availability,
          startedAt,
        });
      }
      const service = resolvedService;
      const slot = resolvedSlot.slot;

      const booking = await retryTool('createBooking', () =>
        createBooking({
          clientId: mergedSession.clientId,
          visitorContact: mergedSession.whatsappNumber ?? undefined,
          serviceId: service.id,
          branchId: resolvedBranch.id,
          slotId: slot.id,
          notes: entities.notes,
          channel: mergedSession.channel,
        }),
      );
      toolName = booking.toolName;
      toolResult = booking.result;

      if (toolResult.success && toolResult.data) {
        const bookingData = toolResult.data as { bookingId: string; paymentRule: { paymentType: string; depositAmountAed: number } };
        lastBookingRef = bookingData.bookingId;
        toolResult = {
          ...toolResult,
          data: {
            ...bookingData,
            summary: {
              serviceId: service.id,
              branchId: resolvedBranch.id,
              slotStart: slot.startTime,
            },
          },
        };

        if (bookingData.paymentRule.paymentType !== 'free') {
          const payment = await generatePaymentLink({
            bookingRef: bookingData.bookingId,
            amountAed: bookingData.paymentRule.depositAmountAed,
            paymentType: bookingData.paymentRule.paymentType as 'full_upfront' | 'deposit' | 'package',
            description: `${service.name} booking payment`,
          });

          if (!payment.success) {
            return handleEscalation(mergedSession, params.message, 'payment_failure', startedAt, classification.intent, classification.confidence, entities);
          }

          toolResult = {
            ...toolResult,
            data: {
              ...(toolResult.data as Record<string, unknown>),
              paymentLink: payment.data?.paymentLink,
            },
          };
        }
      }
      break;
    }
    case 'modify_booking': {
      const bookingRef = entities.bookingReference ?? mergedSession.lastBookingRef ?? '';
      if (!bookingRef || !resolvedService) {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: 'Please share your booking reference and the service you would like to move.',
          intent: classification.intent,
          confidence: classification.confidence,
          entities,
          toolCalled: 'bookingReferenceGuard',
          toolResult: { error: 'booking_reference_required' },
          startedAt,
        });
      }

      const slot = await resolveRequestedSlot(
        resolvedService.id,
        resolvedBranch.id,
        entities.date ?? toIsoDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
        entities.time,
      );
      if (!slot.slot || !mergedSession.clientId) {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: "I couldn't find a new slot to move that booking to just now.",
          intent: classification.intent,
          confidence: classification.confidence,
          entities,
          toolCalled: 'queryAvailability',
          toolResult: slot.availability,
          startedAt,
        });
      }
      const clientId = mergedSession.clientId;
      const nextSlot = slot.slot;

      const result = await retryTool('modifyBooking', () =>
        modifyBooking({
          bookingRef,
          newSlotId: nextSlot.id,
          clientId,
        }),
      );
      toolName = result.toolName;
      toolResult = result.result;
      lastBookingRef = bookingRef;
      break;
    }
    case 'cancel_booking': {
      const bookingRef = entities.bookingReference ?? mergedSession.lastBookingRef ?? '';
      if (!bookingRef || !mergedSession.clientId) {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: 'Please share the booking reference you would like to cancel.',
          intent: classification.intent,
          confidence: classification.confidence,
          entities,
          toolCalled: 'bookingReferenceGuard',
          toolResult: { error: 'booking_reference_required' },
          startedAt,
        });
      }

      const result = await retryTool('cancelBooking', () =>
        cancelBooking({
          bookingRef,
          clientId: mergedSession.clientId!,
        }),
      );
      toolName = result.toolName;
      toolResult = result.result;
      lastBookingRef = bookingRef;
      break;
    }
    case 'add_notes': {
      const bookingRef = entities.bookingReference ?? mergedSession.lastBookingRef ?? '';
      if (!bookingRef || !entities.notes) {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: 'Please share the booking reference and the note you would like me to add.',
          intent: classification.intent,
          confidence: classification.confidence,
          entities,
          toolCalled: 'notesGuard',
          toolResult: { error: 'notes_or_reference_missing' },
          startedAt,
        });
      }

      const result = await retryTool('addNotes', () => addNotes({ bookingRef, notes: entities.notes! }));
      toolName = result.toolName;
      toolResult = result.result;
      lastBookingRef = bookingRef;
      break;
    }
    case 'initiate_payment': {
      const bookingRef = entities.bookingReference ?? mergedSession.lastBookingRef ?? '';
      if (!bookingRef) {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: 'Please share the booking reference for the payment link you need.',
          intent: classification.intent,
          confidence: classification.confidence,
          entities,
          toolCalled: 'paymentGuard',
          toolResult: { error: 'booking_reference_required' },
          startedAt,
        });
      }

      const paymentContext = await fetchBookingPaymentContext(bookingRef);
      if (!paymentContext) {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: "I couldn't find that booking. Could you double-check the reference?",
          intent: classification.intent,
          confidence: classification.confidence,
          entities,
          toolCalled: 'fetchBookingPaymentContext',
          toolResult: { error: 'booking_not_found' },
          startedAt,
        });
      }

      const result = await retryTool('generatePaymentLink', () =>
        generatePaymentLink({
          bookingRef,
          amountAed: paymentContext.amountAed,
          paymentType: paymentContext.paymentType ?? 'deposit',
          description: paymentContext.description,
        }),
      );
      toolName = result.toolName;
      toolResult = result.result;
      lastBookingRef = bookingRef;
      break;
    }
    case 'faq_general': {
      const result = await retryTool('lookupFaq', () => lookupFaq({ query: params.message }));
      if (!result.result.success) {
        return handleEscalation(mergedSession, params.message, 'out_of_scope', startedAt, classification.intent, classification.confidence, entities);
      }
      toolName = result.toolName;
      toolResult = result.result;
      break;
    }
    case 'book_consultation': {
      if (!resolvedService) {
        resolvedService = await findServiceByName('Brow SPMU');
      }
      if (!resolvedService) {
        return handleEscalation(mergedSession, params.message, 'out_of_scope', startedAt, classification.intent, classification.confidence, entities);
      }

      const desiredDate = entities.date ?? toIsoDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
      const service = resolvedService;
      const slot = await resolveRequestedSlot(service.id, resolvedBranch.id, desiredDate, entities.time);
      if (!slot.slot) {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: "I couldn't find a consultation slot for that request just now.",
          intent: classification.intent,
          confidence: classification.confidence,
          entities,
          toolCalled: 'queryAvailability',
          toolResult: slot.availability,
          startedAt,
        });
      }
      const consultationSlot = slot.slot;

      const result = await retryTool('createConsultation', () =>
        createConsultation({
          clientId: mergedSession.clientId,
          visitorContact: mergedSession.whatsappNumber ?? undefined,
          serviceId: service.id,
          serviceCategory: service.gateCategory,
          branchId: resolvedBranch.id,
          slotId: consultationSlot.id,
        }),
      );
      toolName = result.toolName;
      toolResult = result.result;
      break;
    }
    case 'check_clearance_status': {
      if (!resolvedService || !mergedSession.clientId || resolvedService.serviceTier === 'T1') {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: 'Please tell me which treatment you are checking clearance for.',
          intent: classification.intent,
          confidence: classification.confidence,
          entities,
          toolCalled: 'serviceResolution',
          toolResult: { error: 'service_not_found' },
          startedAt,
        });
      }
      const clientId = mergedSession.clientId;
      const service = resolvedService;

      const result = await retryTool('getClearanceStatus', () =>
        getClearanceStatus({
          clientId,
          serviceId: service.id,
          serviceTier: service.serviceTier as 'T2' | 'T3',
        }),
      );
      toolName = result.toolName;
      toolResult = result.result;
      break;
    }
    case 'check_frequency': {
      if (!resolvedService || !mergedSession.clientId) {
        return finalizeTurn({
          session: mergedSession,
          userMessage: params.message,
          response: 'Please tell me which treatment you would like me to check.',
          intent: classification.intent,
          confidence: classification.confidence,
          entities,
          toolCalled: 'serviceResolution',
          toolResult: { error: 'service_not_found' },
          startedAt,
        });
      }

      toolName = 'checkTreatmentFrequency';
      toolResult = ok(await checkTreatmentFrequency(mergedSession.clientId, resolvedService.id));
      break;
    }
    case 'greeting_smalltalk':
    default:
      return finalizeTurn({
        session: mergedSession,
        userMessage: params.message,
        response: 'Welcome to Browz. I can help with availability, bookings, consultations, payments, and treatment questions.',
        intent: classification.intent,
        confidence: classification.confidence,
        entities,
        toolCalled: 'smalltalk',
        toolResult: {},
        startedAt,
        quickReplies: ['Check availability', 'Book a treatment', 'Ask a question'],
      });
  }

  if (!toolResult.success) {
    return handleEscalation(mergedSession, params.message, 'tool_failure', startedAt, classification.intent, classification.confidence, entities);
  }

  const baseResponse = await generateResponse({
    intent: classification.intent,
    toolResult,
    sessionContext: mergedSession,
    channel: mergedSession.channel,
  });

  const response = frequencyWarning ? `${frequencyWarning} ${baseResponse}` : baseResponse;
  return finalizeTurn({
    session: mergedSession,
    userMessage: params.message,
    response,
    intent: classification.intent,
    confidence: classification.confidence,
    entities,
    toolCalled: toolName,
    toolResult,
    startedAt,
    lastBookingRef,
    quickReplies: mergedSession.channel === 'web' ? getQuickReplies(classification.intent) : undefined,
  });
}
