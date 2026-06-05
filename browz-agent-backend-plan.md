# Browz Booking Concierge — TypeScript Backend Implementation Plan

> **For AI IDE Use (Cursor / Windsurf / Copilot)**
> This document is a step-by-step implementation plan for the Browz Booking Concierge AI Agent backend, translated from the original Python/FastAPI/LangChain spec into a TypeScript/Express/Vercel AI SDK stack. Follow each phase in order. Do not skip ahead.

---

## Stack Decision Summary

| Layer | Original Spec | This Implementation |
|---|---|---|
| Language | Python | TypeScript (strict mode) |
| Backend framework | FastAPI | Express.js |
| Agent orchestration | LangChain (Python) | Vercel AI SDK (`ai` package) |
| LLM | Claude Sonnet / GPT-4o | `@anthropic-ai/sdk` (Claude Sonnet — swappable) |
| Schema validation | Pydantic | Zod |
| Database client | supabase-py | `@supabase/supabase-js` |
| Payment | stripe (Python) | `stripe` (Node) |
| WhatsApp | Twilio (Python) | `twilio` (Node) |
| Deployment | Railway | Railway (Node build) |
| Testing | pytest | Vitest |

---

## Repository Structure

Create the following folder structure before writing any code:

```
browz-concierge-agent/
├── src/
│   ├── server.ts                  # Express entry point
│   ├── routes/
│   │   ├── chat.ts                # POST /chat — web chat handler
│   │   └── whatsapp.ts            # POST /whatsapp — Twilio webhook handler
│   ├── agent/
│   │   ├── pipeline.ts            # Main agent orchestration pipeline
│   │   ├── intentClassifier.ts    # LLM intent classification + entity extraction
│   │   ├── gateChecker.ts         # Pre-booking gate logic (T1/T2/T3)
│   │   ├── frequencyChecker.ts    # Treatment frequency interval logic
│   │   ├── paymentRules.ts        # Payment type resolution (full / deposit / package)
│   │   └── responseGenerator.ts   # LLM branded response builder
│   ├── tools/
│   │   ├── availability.ts        # check_availability tool
│   │   ├── bookings.ts            # create / modify / cancel booking tools
│   │   ├── consultations.ts       # book_consultation tool
│   │   ├── screenings.ts          # submit_screening tool
│   │   ├── clearances.ts          # check_clearance_status tool
│   │   ├── notes.ts               # add_notes tool
│   │   ├── payment.ts             # initiate_payment tool (Stripe test)
│   │   └── faq.ts                 # faq_general tool (pgvector lookup)
│   ├── memory/
│   │   └── sessionManager.ts      # In-memory store + Supabase sessions table sync
│   ├── escalation/
│   │   └── escalationHandler.ts   # Human handoff — mock webhook POST
│   ├── db/
│   │   └── supabaseClient.ts      # Supabase singleton client
│   ├── lib/
│   │   ├── anthropicClient.ts     # Anthropic SDK singleton
│   │   ├── stripeClient.ts        # Stripe SDK singleton
│   │   └── twilioClient.ts        # Twilio SDK singleton
│   ├── types/
│   │   └── index.ts               # All shared TypeScript types + Zod schemas
│   └── logger.ts                  # Supabase agent_logs writer
├── supabase/
│   └── schema.sql                 # Full Supabase schema (provided in spec — copy verbatim)
├── seed/
│   ├── services.ts                # Seed: services with correct tier, frequency, price
│   ├── branches.ts                # Seed: branch records
│   ├── slots.ts                   # Seed: pre-seeded time slots
│   ├── faqs.ts                    # Seed: FAQ records (run embeddings after insert)
│   └── demoClient.ts              # Seed: demo client with appointment history + clearances
├── tests/
│   ├── intent.test.ts             # Intent classification accuracy tests
│   ├── tools.test.ts              # Tool function unit tests
│   └── scenarios.test.ts          # End-to-end scenario runner (25 scenarios)
├── .env                           # API keys — never commit
├── .env.example                   # Template for .env
├── package.json
├── tsconfig.json
└── README.md
```

---

## Phase 1 — Project Bootstrap

### 1.1 Initialise the project

```bash
mkdir browz-concierge-agent && cd browz-concierge-agent
npm init -y
npm install typescript ts-node @types/node --save-dev
npx tsc --init
```

Set `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  }
}
```

### 1.2 Install all dependencies

```bash
npm install express @anthropic-ai/sdk @supabase/supabase-js stripe twilio zod ai dotenv cors
npm install --save-dev @types/express @types/cors vitest tsx nodemon
```

### 1.3 Environment variables

Create `.env` with the following keys (never commit this file):

```
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=                      # Use the service role key (bypasses RLS)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=            # Format: whatsapp:+14155238886
STRIPE_SECRET_KEY=                 # Use sk_test_... for prototype
STRIPE_TEST_MODE=true
SESSION_SECRET=                    # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ESCALATION_WEBHOOK_URL=http://localhost:3001/escalation  # Mock — logs to console
DEFAULT_BRANCH_ID=                 # Fill after seeding Supabase
PORT=3000
```

---

## Phase 2 — Types & Schemas (`src/types/index.ts`)

Define all shared types with Zod. This is the single source of truth for data shapes across the whole codebase.

### Key types to define:

```typescript
import { z } from 'zod';

// --- Enums ---
export const ServiceTier = z.enum(['T1', 'T2', 'T3']);
export const UserTier = z.enum(['visitor', 'client']);
export const Channel = z.enum(['web', 'whatsapp']);
export const BookingStatus = z.enum(['confirmed', 'modified', 'cancelled', 'pending_payment']);
export const PaymentType = z.enum(['full_upfront', 'deposit', 'package', 'free']);
export const ScreeningStatus = z.enum(['PENDING', 'APPROVED', 'FLAGGED', 'EXPIRED']);

// --- Intent ---
export const IntentId = z.enum([
  'check_availability',
  'create_booking',
  'modify_booking',
  'cancel_booking',
  'add_notes',
  'initiate_payment',
  'faq_general',
  'escalate_human',
  'greeting_smalltalk',
  'book_consultation',
  'check_clearance_status',
  'check_frequency',
]);
export type IntentId = z.infer<typeof IntentId>;

// --- Classification result from LLM ---
export const ClassificationResult = z.object({
  intent: IntentId,
  entities: z.object({
    service: z.string().optional(),
    branch: z.string().optional(),
    date: z.string().optional(),        // ISO date string
    time: z.string().optional(),        // HH:MM
    artistName: z.string().optional(),
    bookingReference: z.string().optional(),
    notes: z.string().optional(),
    paymentRequested: z.boolean().optional(),
  }),
  confidence: z.number().min(0).max(1),
});
export type ClassificationResult = z.infer<typeof ClassificationResult>;

// --- Session context ---
export const ConversationTurn = z.object({
  role: z.enum(['user', 'agent']),
  content: z.string(),
  intent: IntentId.optional(),
  confidence: z.number().optional(),
  timestamp: z.string(),
});

export const SessionContext = z.object({
  sessionId: z.string().uuid(),
  channel: Channel,
  userTier: UserTier,
  clientId: z.string().uuid().nullable(),
  whatsappNumber: z.string().nullable(),
  conversationHistory: z.array(ConversationTurn),
  lastIntent: IntentId.nullable(),
  lastBookingRef: z.string().nullable(),
  status: z.enum(['active', 'escalated', 'closed']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SessionContext = z.infer<typeof SessionContext>;

// --- Gate check result ---
export const GateCheckResult = z.discriminatedUnion('gateCleared', [
  z.object({ gateCleared: z.literal(true) }),
  z.object({
    gateCleared: z.literal(false),
    reason: z.enum([
      'consultation_and_patch_test_required',
      'screening_under_review',
      'medical_screening_required',
    ]),
  }),
]);
export type GateCheckResult = z.infer<typeof GateCheckResult>;

// --- Frequency check result ---
export const FrequencyCheckResult = z.discriminatedUnion('tooSoon', [
  z.object({ tooSoon: z.literal(false) }),
  z.object({
    tooSoon: z.literal(true),
    hardBlock: z.boolean(),
    earliestDate: z.string(),           // ISO date
    weeksRemaining: z.number(),
  }),
]);
export type FrequencyCheckResult = z.infer<typeof FrequencyCheckResult>;

// --- Tool results (generic) ---
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Service record (from Supabase) ---
export interface Service {
  id: string;
  name: string;
  category: string;
  serviceTier: 'T1' | 'T2' | 'T3';
  durationMinutes: number;
  priceAed: number;
  requiresConsultation: boolean;
  requiresPatchTest: boolean;
  requiresScreening: boolean;
  isMedical: boolean;
  minFrequencyWeeks: number | null;
  frequencyHardBlock: boolean;
  consentTemplateId: string | null;
  description: string;
}

// --- Payment rule resolution ---
export interface PaymentRule {
  paymentType: 'full_upfront' | 'deposit' | 'package' | 'free';
  depositAmountAed: number;
  balanceDueAed: number;
}

// --- Inbound request shapes ---
export const ChatRequest = z.object({
  message: z.string().min(1),
  sessionId: z.string().uuid().optional(),
  authToken: z.string().optional(),    // JWT for authenticated clients
});

export const WhatsAppWebhookBody = z.object({
  Body: z.string(),
  From: z.string(),                    // whatsapp:+971XXXXXXXXX
  To: z.string(),
  MessageSid: z.string(),
});
```

---

## Phase 3 — Infrastructure Singletons

### 3.1 `src/db/supabaseClient.ts`
```typescript
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
```

### 3.2 `src/lib/anthropicClient.ts`
```typescript
import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = 'claude-sonnet-4-5'; // swap here if needed
```

### 3.3 `src/lib/stripeClient.ts`
```typescript
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
});
```

### 3.4 `src/lib/twilioClient.ts`
```typescript
import twilio from 'twilio';

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
```

---

## Phase 4 — Session Manager (`src/memory/sessionManager.ts`)

The session manager maintains conversation context across turns. For the prototype, it is a hybrid: an in-memory Map for speed and Supabase `sessions` table for persistence.

### Responsibilities:
- `getOrCreateSession(sessionId, channel, clientId?, whatsappNumber?)` → `SessionContext`
- `updateSession(sessionId, updates: Partial<SessionContext>)` → writes to both in-memory and Supabase
- `appendTurn(sessionId, turn: ConversationTurn)` → appends to `conversationHistory`
- `resolveUserTier(authToken?, whatsappNumber?)` → queries `clients` table; returns `'client'` or `'visitor'`

### Implementation notes:
- Use a `Map<string, SessionContext>` as the in-memory store.
- On `getOrCreateSession`, check the Map first, then fall back to Supabase `sessions` table.
- On `updateSession`, write to Map immediately and to Supabase asynchronously (fire-and-forget with error logging).
- `resolveUserTier`: if `authToken` is present, verify JWT and look up `client_id`. If `whatsappNumber` is present, query `clients` table for a matching phone number. Otherwise return `'visitor'`.

---

## Phase 5 — Intent Classifier (`src/agent/intentClassifier.ts`)

Calls the LLM with a structured prompt and returns a validated `ClassificationResult`.

### System prompt (use verbatim in the implementation):

```
You are a booking concierge assistant for Browz — a beauty and brow salon in the UAE.
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
}
```

### Function signature:
```typescript
async function classifyIntent(
  message: string,
  conversationHistory: ConversationTurn[]
): Promise<ClassificationResult>
```

### Implementation notes:
- Pass the last 6 turns of conversation history for context (keep prompts short for latency).
- Parse the JSON response and validate with `ClassificationResult.safeParse(...)`.
- If parsing fails, return `{ intent: 'greeting_smalltalk', entities: {}, confidence: 0.0 }` and log the failure.
- If `confidence < 0.60`, the caller (pipeline) will handle the clarification flow — the classifier does not ask for clarification itself.

---

## Phase 6 — Gate Checker (`src/agent/gateChecker.ts`)

Implements the pre-booking gate logic for T1/T2/T3 service tiers. This is the most critical business logic in the agent.

### Function signatures:
```typescript
async function checkPreBookingRequirements(
  serviceId: string,
  clientId: string | null
): Promise<GateCheckResult>

async function checkTreatmentFrequency(
  clientId: string,
  serviceId: string
): Promise<FrequencyCheckResult>
```

### `checkPreBookingRequirements` logic:

1. Fetch the service record from Supabase to get `service_tier`, `min_frequency_weeks`, `frequency_hard_block`.
2. **T1:** Return `{ gateCleared: true }` immediately.
3. **T2 (SPMU):**
   - If `clientId` is null (visitor): return `{ gateCleared: false, reason: 'consultation_and_patch_test_required' }`.
   - If `clientId` is present: query `spmu_clearances` for this client and service category.
   - If a valid clearance exists (`patch_test_done = true`, `patch_test_cleared = true`, `valid_until >= now()`): return `{ gateCleared: true }`.
   - Otherwise: return `{ gateCleared: false, reason: 'consultation_and_patch_test_required' }`.
4. **T3 (Medical):**
   - Query `medical_screenings` for this client and service category.
   - If approved and `approved_until >= today`: return `{ gateCleared: true }`.
   - If status is `'PENDING'`: return `{ gateCleared: false, reason: 'screening_under_review' }`.
   - Otherwise: return `{ gateCleared: false, reason: 'medical_screening_required' }`.

### `checkTreatmentFrequency` logic:

1. Fetch the service record for `min_frequency_weeks` and `frequency_hard_block`.
2. If `min_frequency_weeks` is null: return `{ tooSoon: false }`.
3. Query `bookings` for the client's most recent completed appointment in the same service category.
4. If no prior appointment: return `{ tooSoon: false }`.
5. Calculate `weeksSince = (now - lastAppointment.date) / 7`.
6. If `weeksSince < min_frequency_weeks`: return `{ tooSoon: true, hardBlock: ..., earliestDate: ..., weeksRemaining: ... }`.
7. Otherwise: return `{ tooSoon: false }`.

---

## Phase 7 — Tools Layer (`src/tools/`)

Each tool is a standalone async function. Tools are called by the pipeline after the gate check passes. All tools must:
- Accept typed inputs validated against a Zod schema.
- Return `ToolResult<T>` — never throw to the caller.
- Log errors internally before returning `{ success: false, error: '...' }`.

### 7.1 `availability.ts`

```typescript
export async function queryAvailability(params: {
  serviceId: string;
  branchId: string;
  date: string;           // ISO date
  artistId?: string;
}): Promise<ToolResult<TimeSlot[]>>
```
- Queries `time_slots` where `status = 'available'`, `service_id = serviceId`, `branch_id = branchId`, `DATE(start_time) = date`.
- If `artistId` is specified, filter by `artist_id`.
- Returns up to 6 slots, ordered by `start_time`.

### 7.2 `bookings.ts`

```typescript
export async function createBooking(params: {
  clientId: string | null;
  visitorName?: string;
  visitorContact?: string;
  serviceId: string;
  branchId: string;
  slotId: string;
  artistId?: string;
  notes?: string;
  screeningRef?: string;
  clearanceRef?: string;
  channel: 'web' | 'whatsapp';
  bookingType?: 'single' | 'consultation' | 'package_first_session';
}): Promise<ToolResult<{ bookingId: string; paymentRule: PaymentRule }>>

export async function modifyBooking(params: {
  bookingRef: string;
  newSlotId: string;
  clientId: string;       // Only authenticated clients can modify
}): Promise<ToolResult<{ bookingId: string; newSlot: TimeSlot }>>

export async function cancelBooking(params: {
  bookingRef: string;
  clientId: string;
}): Promise<ToolResult<{ bookingId: string }>>
```

**`createBooking` implementation notes:**
- Generate a booking ID in the format `BRZ-YYYY-NNNNN` (year + 5-digit sequence).
- Resolve the payment rule using `resolvePaymentRule(service, bookingType)` (see Phase 8).
- Set `consent_status = 'pending'` for T3 services.
- Mark the slot as `status = 'booked'` in `time_slots` in the same transaction (use Supabase RPC or sequential updates).

**`modifyBooking` implementation notes:**
- Verify the booking belongs to the authenticated client before updating.
- Free the old slot (`status = 'available'`) and mark the new slot as `status = 'booked'`.

### 7.3 `consultations.ts`

```typescript
export async function createConsultation(params: {
  clientId: string | null;
  visitorName?: string;
  visitorContact?: string;
  serviceId: string;
  servicCategory: string;
  branchId: string;
  slotId: string;
}): Promise<ToolResult<{ consultationId: string }>>
```
- Inserts into `consultation_requests` table.
- Generates ID in format `CON-YYYYMMDD-XXXX`.
- `booking_type` on the `bookings` record should be set to `'consultation'`, `payment_type` to `'free'`.

### 7.4 `screenings.ts`

```typescript
export interface ScreeningAnswers {
  q1Pregnant: boolean;
  q2BloodThinners: boolean;
  q3Allergies: boolean;
  q4PriorProcedures: boolean;
  q4Detail?: string;
  q5ActiveInfection: boolean;
  q6Autoimmune: boolean;
}

export async function submitScreening(params: {
  clientId: string | null;
  visitorName?: string;
  visitorContact?: string;
  serviceCategory: string;
  answers: ScreeningAnswers;
}): Promise<ToolResult<{ screeningId: string; flaggedQuestions: string[] }>>
```
- Evaluates which questions are flagged (any `true` answer except `q4PriorProcedures`).
- Inserts into `medical_screenings` with `status = 'PENDING'`.
- Generates ID in format `SCR-YYYY-NNNN`.

### 7.5 `clearances.ts`

```typescript
export async function getClearanceStatus(params: {
  clientId: string;
  serviceId: string;
  serviceTier: 'T2' | 'T3';
}): Promise<ToolResult<{ status: string; validUntil?: string }>>
```
- For T2: queries `spmu_clearances`.
- For T3: queries `medical_screenings` for `status = 'APPROVED'`.

### 7.6 `notes.ts`

```typescript
export async function addNotes(params: {
  bookingRef: string;
  notes: string;
}): Promise<ToolResult<void>>
```
- Appends to the `notes` field on the booking record (concatenate, not replace).

### 7.7 `payment.ts`

```typescript
export async function generatePaymentLink(params: {
  bookingRef: string;
  amountAed: number;
  paymentType: 'full_upfront' | 'deposit' | 'package';
  description: string;
}): Promise<ToolResult<{ paymentLink: string }>>
```
- Calls Stripe Payment Links API in test mode.
- Converts AED to fils (×100) for Stripe.
- Updates the booking record with `payment_link`, `payment_status = 'link_sent'`.

### 7.8 `faq.ts`

```typescript
export async function lookupFaq(params: {
  query: string;
}): Promise<ToolResult<{ answer: string; category: string }>>
```
- Generates an embedding for the query using the Anthropic embeddings API (or OpenAI — match whichever model was used to seed FAQs).
- Queries `faqs` table using Supabase's `pgvector` `<->` operator.
- Returns the top match above a similarity threshold of `0.75`.
- If no match: return `{ success: false, error: 'no_faq_match' }` — the pipeline will escalate.

---

## Phase 8 — Payment Rules (`src/agent/paymentRules.ts`)

```typescript
export function resolvePaymentRule(
  service: Service,
  bookingType: 'single' | 'consultation' | 'package_first_session'
): PaymentRule {
  if (bookingType === 'consultation') {
    return { paymentType: 'free', depositAmountAed: 0, balanceDueAed: 0 };
  }

  if (bookingType === 'package_first_session') {
    return {
      paymentType: 'package',
      depositAmountAed: service.priceAed,   // Full upfront
      balanceDueAed: 0,
    };
  }

  // Single service
  if (service.priceAed <= 1000) {
    return { paymentType: 'full_upfront', depositAmountAed: service.priceAed, balanceDueAed: 0 };
  } else {
    const deposit = Math.ceil(service.priceAed * 0.20);
    return { paymentType: 'deposit', depositAmountAed: deposit, balanceDueAed: service.priceAed - deposit };
  }
}
```

---

## Phase 9 — Response Generator (`src/agent/responseGenerator.ts`)

Calls the LLM a second time to produce a branded, conversational response from the structured tool result.

### System prompt:
```
You are a warm, professional booking concierge for Browz — a beauty and brow salon in the UAE.
Generate a concise, brand-aligned response based on the tool result provided.
Rules:
- Maximum 4 sentences. Plain text only. No markdown.
- If confirming a booking, always include: service name, branch, date, time, and booking reference.
- If presenting availability, format as a short list of times preceded by a bullet "•".
- If explaining a gate requirement, be warm and clear — always offer the next step.
- If confirming a payment link, always include the amount and "valid for 24 hours".
- Do not invent data. Only use what is in the tool result.
- For hard frequency blocks, explain the medical reason and give the earliest eligible date.
```

### Function signature:
```typescript
async function generateResponse(params: {
  intent: IntentId;
  toolResult: ToolResult;
  sessionContext: SessionContext;
  channel: 'web' | 'whatsapp';
}): Promise<string>
```

---

## Phase 10 — Main Agent Pipeline (`src/agent/pipeline.ts`)

This is the orchestrator. It runs on every inbound message and calls all other modules in sequence.

### Pipeline steps (implement in this exact order):

```typescript
export async function runAgentPipeline(params: {
  message: string;
  sessionId: string;
  channel: 'web' | 'whatsapp';
  authToken?: string;
  whatsappNumber?: string;
}): Promise<{ response: string; sessionId: string }>
```

**Step 1 — Session setup**
- Call `sessionManager.getOrCreateSession(...)`.
- Call `sessionManager.resolveUserTier(authToken, whatsappNumber)`.
- Load conversation history from session.

**Step 2 — Intent classification**
- Call `classifyIntent(message, conversationHistory)`.
- If `confidence < 0.60`: return a clarification prompt ("Could you tell me a bit more about what you're looking for?") — do not proceed to tools. Log and return.
- If `intent === 'escalate_human'`: skip to Step 6.

**Step 3 — Gate check (for `check_availability` and `create_booking` only)**
- If intent is `check_availability` or `create_booking`:
  - Resolve `serviceId` from entities (look up service by name in Supabase).
  - Call `checkPreBookingRequirements(serviceId, clientId)`.
  - If `gateCleared === false`:
    - If reason is `'consultation_and_patch_test_required'`: route to `book_consultation` flow.
    - If reason is `'screening_under_review'`: generate response informing client of 24hr review window.
    - If reason is `'medical_screening_required'`: initiate conversational screening flow (see Section 10.1 below).
    - Return early — do not proceed to availability/booking tools.
  - If `gateCleared === true` and client is authenticated: also run `checkTreatmentFrequency(clientId, serviceId)`.
    - If `tooSoon === true` and `hardBlock === true`: return hard block message with earliest date. Do not proceed.
    - If `tooSoon === true` and `hardBlock === false`: generate soft warning but allow pipeline to continue.

**Step 4 — Tool execution**

Route to the appropriate tool based on classified intent:

| Intent | Tool function | Notes |
|---|---|---|
| `check_availability` | `queryAvailability(...)` | Pass service, branch, date, optional artistId |
| `create_booking` | `createBooking(...)` | Then call `generatePaymentLink(...)` if paymentType ≠ 'free' |
| `modify_booking` | `modifyBooking(...)` | Client only — check userTier first |
| `cancel_booking` | `cancelBooking(...)` | Client only |
| `add_notes` | `addNotes(...)` | |
| `initiate_payment` | `generatePaymentLink(...)` | Client only |
| `faq_general` | `lookupFaq(...)` | On no match: escalate |
| `book_consultation` | `createConsultation(...)` | |
| `check_clearance_status` | `getClearanceStatus(...)` | Client only |
| `check_frequency` | Inline via `checkTreatmentFrequency(...)` | |

**Tool retry logic:** If the tool returns `success: false`, retry once. If it fails again, escalate.

**Client-only intent enforcement:**
- If intent is `modify_booking`, `cancel_booking`, `initiate_payment`, or `check_clearance_status` and `userTier === 'visitor'`: return a response prompting the user to log in or contact reception. Do not call the tool.

**Step 5 — Response generation**
- Call `generateResponse({ intent, toolResult, sessionContext, channel })`.
- For web channel: optionally append quick-reply button suggestions after the text response as a separate JSON field (do not mix into the LLM response text).

**Step 6 — Escalation**
- Call `escalationHandler.escalate(sessionId, reason)`.
- Send a fixed handoff message: "Let me connect you with our team — they'll be with you shortly."
- Mark session as `escalated` in Supabase.

**Step 7 — Logging & session update**
- Call `logger.logTurn(...)` to write to `agent_logs`.
- Call `sessionManager.appendTurn(...)` with user message and agent response.
- Call `sessionManager.updateSession(...)` with `lastIntent`, `lastBookingRef`.

### 10.1 Conversational Screening Flow (T3 gate)

The medical screening involves 6 questions asked one at a time. The agent must maintain state across turns to know which question it is on.

**Implementation approach:**
- Store a `screeningState` object in the session context under a custom field:
  ```typescript
  interface ScreeningState {
    active: boolean;
    serviceCategory: string;
    currentQuestion: number;        // 0–5
    answers: Partial<ScreeningAnswers>;
  }
  ```
- On each turn where `screeningState.active === true`:
  - Skip intent classification and gate check.
  - Ask the next question.
  - Parse the user's yes/no answer, store it in `answers`.
  - When all 6 questions are answered, call `submitScreening(...)`.
  - Clear `screeningState.active`.

**Questions to ask in order (use exactly these phrasings):**
1. "Are you currently pregnant or breastfeeding?"
2. "Are you taking any blood thinners or anticoagulants?"
3. "Do you have any known allergies to anaesthetics, lidocaine, or hyaluronic acid?"
4. "Have you had any facial surgery or aesthetic procedures in the last 6 months? If yes, please give a brief detail."
5. "Do you have any active skin infections, cold sores, or open wounds on the treatment area?"
6. "Do you have any autoimmune conditions, or are you taking immunosuppressant medication?"

---

## Phase 11 — Routes

### 11.1 `src/routes/chat.ts` — Web Chat Endpoint

```
POST /chat
Content-Type: application/json
Body: { message: string, sessionId?: string, authToken?: string }
Response: { response: string, sessionId: string, quickReplies?: string[] }
```

- Validate the request body against `ChatRequest` schema.
- Call `runAgentPipeline(...)`.
- Return the response and `sessionId` (so the client can persist it for subsequent turns).

### 11.2 `src/routes/whatsapp.ts` — Twilio Webhook

```
POST /whatsapp
Content-Type: application/x-www-form-urlencoded (Twilio format)
```

- Parse `Body`, `From`, `MessageSid` from the Twilio webhook payload.
- Validate the Twilio request signature using `twilio.validateRequest(...)`.
- Derive `sessionId` from the `From` number (e.g. hash the phone number to a UUID).
- Call `runAgentPipeline(...)` with `channel: 'whatsapp'` and `whatsappNumber: From`.
- Respond using Twilio's TwiML `MessagingResponse` to send the reply.

### 11.3 `src/server.ts` — Express entry point

```typescript
import express from 'express';
import cors from 'cors';
import { chatRouter } from './routes/chat';
import { whatsappRouter } from './routes/whatsapp';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Required for Twilio webhooks

app.use('/chat', chatRouter);
app.use('/whatsapp', whatsappRouter);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.listen(process.env.PORT ?? 3000, () => {
  console.log(`Browz agent backend running on port ${process.env.PORT ?? 3000}`);
});
```

---

## Phase 12 — Logger (`src/logger.ts`)

```typescript
interface AgentLogEntry {
  sessionId: string;
  turn: number;
  channel: string;
  userMessage: string;
  intent: string;
  confidence: number;
  entitiesExtracted: Record<string, unknown>;
  toolCalled: string;
  toolResult: Record<string, unknown>;
  agentResponse: string;
  latencyMs: number;
  escalated: boolean;
}

export async function logTurn(entry: AgentLogEntry): Promise<void>
```

- Inserts into `agent_logs` table. Fire-and-forget — do not block the response.
- Also writes to `console.log` as a fallback for local debugging.
- Measure `latencyMs` from the start of the pipeline to the end of response generation.

---

## Phase 13 — Escalation Handler (`src/escalation/escalationHandler.ts`)

```typescript
export async function escalate(params: {
  sessionId: string;
  reason: 'low_confidence' | 'user_requested' | 'tool_failure' | 'out_of_scope' | 'payment_failure';
  channel: 'web' | 'whatsapp';
  lastMessage: string;
}): Promise<void>
```

- POSTs to `ESCALATION_WEBHOOK_URL` with the session details.
- For the prototype, this endpoint is a mock that logs to console — that is expected.
- Updates the session `status = 'escalated'` in Supabase.

**Escalation triggers (check in pipeline):**
- Intent confidence < 0.60 after one clarification attempt.
- User says "speak to someone", "call me", "I need help" (intent = `escalate_human`).
- Tool fails twice in one turn.
- Intent not in the defined 12 intents.
- Payment link generation fails.

---

## Phase 14 — Supabase Schema

Run the following in the Supabase SQL editor. This is taken verbatim from the spec with the addition of the `artists` table which is referenced by `time_slots`:

```sql
-- Artists (referenced by time_slots and bookings)
CREATE TABLE artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  branch_id uuid,
  specialties text[],
  active boolean DEFAULT true
);

-- Services catalogue
CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  service_tier text NOT NULL DEFAULT 'T1',
  duration_minutes integer,
  price_aed numeric(8,2),
  requires_consultation boolean DEFAULT false,
  requires_patch_test boolean DEFAULT false,
  requires_screening boolean DEFAULT false,
  is_medical boolean DEFAULT false,
  min_frequency_weeks integer DEFAULT null,
  frequency_hard_block boolean DEFAULT false,
  consent_template_id uuid DEFAULT null,
  description text
);

-- Branches
CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  address text,
  phone text,
  hours jsonb
);

-- Time slots
CREATE TABLE time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id),
  service_id uuid REFERENCES services(id),
  artist_id uuid REFERENCES artists(id),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text DEFAULT 'available'
);

-- Clients (prototype: used for tier resolution)
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text,
  phone text,
  auth_user_id uuid UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Bookings
CREATE TABLE bookings (
  id text PRIMARY KEY,
  client_id uuid REFERENCES clients(id) NULL,
  visitor_name text,
  visitor_contact text,
  service_id uuid REFERENCES services(id),
  branch_id uuid REFERENCES branches(id),
  slot_id uuid REFERENCES time_slots(id),
  artist_id uuid REFERENCES artists(id) NULL,
  status text DEFAULT 'confirmed',
  notes text,
  booking_type text DEFAULT 'single',
  payment_type text DEFAULT 'full_upfront',
  deposit_amount_aed numeric(8,2) DEFAULT 0,
  balance_due_aed numeric(8,2) DEFAULT 0,
  payment_status text DEFAULT 'unpaid',
  payment_link text,
  screening_ref text NULL,
  clearance_ref text NULL,
  consent_status text DEFAULT 'not_required',
  channel text,
  booking_source text DEFAULT 'ai_concierge',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- SPMU clearances
CREATE TABLE spmu_clearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NULL,
  visitor_contact text NULL,
  service_category text NOT NULL,
  consultation_booking_id text REFERENCES bookings(id),
  patch_test_done boolean DEFAULT false,
  patch_test_cleared boolean DEFAULT false,
  cleared_at timestamptz NULL,
  valid_until timestamptz NULL,
  created_at timestamptz DEFAULT now()
);

-- Medical screenings
CREATE TABLE medical_screenings (
  id text PRIMARY KEY,
  client_id uuid NULL,
  visitor_name text,
  visitor_contact text,
  service_category text NOT NULL,
  answers jsonb NOT NULL,
  flagged_questions text[] DEFAULT '{}',
  status text DEFAULT 'PENDING',
  reviewed_by text NULL,
  reviewed_at timestamptz NULL,
  approved_until timestamptz NULL,
  created_at timestamptz DEFAULT now()
);

-- Consultation requests
CREATE TABLE consultation_requests (
  id text PRIMARY KEY,
  client_id uuid NULL,
  visitor_name text,
  visitor_contact text,
  service_id uuid REFERENCES services(id),
  service_category text,
  branch_id uuid REFERENCES branches(id),
  slot_id uuid REFERENCES time_slots(id),
  status text DEFAULT 'booked',
  patch_test_done boolean DEFAULT false,
  patch_test_cleared boolean DEFAULT false,
  clearance_valid_until timestamptz NULL,
  created_at timestamptz DEFAULT now()
);

-- Sessions
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text,
  user_tier text,
  client_id uuid NULL,
  whatsapp_number text NULL,
  conversation_history jsonb DEFAULT '[]',
  last_intent text,
  last_booking_ref text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Agent logs
CREATE TABLE agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id),
  turn integer,
  channel text,
  user_message text,
  intent text,
  confidence numeric(4,3),
  entities_extracted jsonb,
  tool_called text,
  tool_result jsonb,
  agent_response text,
  latency_ms integer,
  escalated boolean DEFAULT false,
  timestamp timestamptz DEFAULT now()
);

-- FAQs with pgvector
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text,
  answer text,
  category text,
  embedding vector(1536)
);
CREATE INDEX ON faqs USING ivfflat (embedding vector_cosine_ops);
```

---

## Phase 15 — Seed Data (`seed/`)

Run seed scripts after schema creation. Seed data must be complete before testing.

### 15.1 `seed/services.ts` — Critical field values

Every service MUST have correct `service_tier`, `min_frequency_weeks`, and `frequency_hard_block`. Key records:

| Service | Tier | min_frequency_weeks | frequency_hard_block | price_aed |
|---|---|---|---|---|
| Brow Threading | T1 | null | false | 80 |
| Brow Lamination | T1 | 6 | false | 180 |
| Brow Tint | T1 | null | false | 60 |
| Lash Tint | T1 | null | false | 70 |
| Brow SPMU | T2 | 42 | false | 1200 |
| Lip Blush | T2 | 42 | false | 1400 |
| Nano Brows | T2 | 42 | false | 1100 |
| Anti-Wrinkle Injections | T3 | 12 | true | 1500 |
| Lip Filler | T3 | 12 | true | 1800 |
| Chemical Peel | T3 | 4 | false | 600 |
| HydraFacial | T3 | 4 | false | 500 |

### 15.2 `seed/demoClient.ts` — Required for demo scenarios

Insert the following demo records before the stakeholder demo:
- One demo client with a completed Brow Lamination appointment 3 weeks ago (for SC-20 frequency soft warn).
- One demo client with a completed Anti-Wrinkle Injections appointment 6 weeks ago (for SC-21 frequency hard block).
- One SPMU clearance on file for the demo client (for SC-13 gate bypass).
- One approved medical clearance (`status = 'APPROVED'`, `approved_until` in the future) for the demo client (for SC-16 T3 gate bypass).

### 15.3 `seed/faqs.ts` — FAQ records + embeddings

After inserting FAQ text records, generate embeddings and update the `embedding` column. Use the same embedding model (e.g. `text-embedding-3-small`) that the FAQ lookup tool will use at runtime.

---

## Phase 16 — Error Handling Conventions

Apply these patterns consistently across all tools and the pipeline:

| Scenario | Behaviour |
|---|---|
| Supabase query fails | Log error, retry ×1. If fails again: return `ToolResult { success: false }` and trigger escalation. |
| LLM call fails | Log error, retry ×1 with a shorter prompt. If fails again: return a static apology message. |
| Requested slot now taken | Return `{ success: false, error: 'slot_unavailable' }` — pipeline offers next 3 available slots. |
| Service name unresolvable | Return clarification prompt asking user to specify the treatment. |
| Booking reference not found | Return user-friendly message: "I couldn't find that booking. Could you double-check the reference?" |
| Client not found by token/phone | Treat as visitor for the session. Log the tier mismatch. |
| Hard frequency block override attempt | Do not proceed. Explain medically. Offer earliest date. Do not escalate unless user explicitly requests human. |

---

## Phase 17 — Testing (`tests/`)

### 17.1 Tool unit tests (`tools.test.ts`)
Use Vitest. Mock Supabase with `vi.mock(...)`. Test each tool's success and error paths independently.

### 17.2 Intent classification tests (`intent.test.ts`)
Run the 25 scenario inputs through the classifier. Assert:
- Intent is correctly classified.
- Key entities are extracted.
- Confidence is ≥ 0.60 for all in-scope scenarios.
- Target: ≥75% of scenarios pass. (70–85% is acceptable.)

### 17.3 End-to-end scenario tests (`scenarios.test.ts`)
Run all 25 scenarios from Section 5.3 of the spec through the full pipeline against a seeded Supabase sandbox. Assert the final response includes required data (booking ref, service, branch, date, time). Assert escalation is triggered for SC-24.

---

## Phase 18 — Deployment (Railway)

1. Create a `Procfile` or `railway.json` pointing to `dist/server.js`.
2. Add a build command: `npm run build` (`tsc`).
3. Add a start command: `node dist/server.js`.
4. Set all `.env` variables in Railway's environment variable panel.
5. Expose port `3000` (or use `PORT` env var).
6. Confirm the `/health` endpoint returns `{ status: 'ok' }` after deploy.
7. Update `ESCALATION_WEBHOOK_URL` to the Railway public URL if needed.

---

## Implementation Order Checklist

Follow this order strictly. Each phase depends on the previous.

- [ ] Phase 1 — Bootstrap: project init, deps, .env
- [ ] Phase 2 — Types: all Zod schemas and TypeScript interfaces in `types/index.ts`
- [ ] Phase 3 — Singletons: Supabase, Anthropic, Stripe, Twilio clients
- [ ] Phase 14 — Schema: run `schema.sql` in Supabase
- [ ] Phase 15 — Seed: insert seed data + demo client records
- [ ] Phase 4 — Session Manager
- [ ] Phase 5 — Intent Classifier
- [ ] Phase 6 — Gate Checker
- [ ] Phase 7 — All tools (availability, bookings, consultations, screenings, clearances, notes, payment, faq)
- [ ] Phase 8 — Payment Rules
- [ ] Phase 9 — Response Generator
- [ ] Phase 10 — Agent Pipeline
- [ ] Phase 12 — Logger
- [ ] Phase 13 — Escalation Handler
- [ ] Phase 11 — Routes (chat + whatsapp) + server.ts
- [ ] Phase 16 — Error handling review pass (apply conventions to all files)
- [ ] Phase 17 — Tests
- [ ] Phase 18 — Railway deployment
- [ ] Demo checklist from Appendix B of the spec
