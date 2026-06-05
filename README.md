# Browz Concierge Agent

TypeScript/Express backend scaffold for the Browz Booking Concierge AI Agent, based on the implementation plan in [browz-agent-backend-plan.md](/c:/Users/Dennis/DQ/Browz-Concierge-AI/browz-agent-backend-plan.md).

## What is included

- Strict TypeScript project bootstrap
- Express server with `/health`, `/chat`, and `/whatsapp`
- Shared Zod schemas and domain types
- Session manager with in-memory state and best-effort Supabase sync
- Agent pipeline with classification, gate checks, tool routing, escalation, and screening flow
- Tool scaffolds for availability, bookings, consultations, screenings, clearances, notes, payments, and FAQs
- Supabase schema and seed scripts
- Vitest starter tests

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template and fill in the secrets you have.

```bash
cp .env.example .env
```

3. Set your OpenAI-compatible key in `.env`.

For OpenAI:

```text
OPENAI_API_KEY=sk-...
```

For OpenRouter:

```text
OPENROUTER_API_KEY=or-...
OPENROUTER_BASE_URL=https://openrouter.ai
```

4. Build the project:

```bash
npm run build
```

4. Start the server in development:

```bash
npm run dev
```

## Notes

- The code is designed to boot even when third-party credentials are missing. In that case it falls back to deterministic local behavior where possible, which makes the scaffold easier to develop before Supabase and provider setup is complete.
- To reach production-grade behavior, you still need to run [supabase/schema.sql](/c:/Users/Dennis/DQ/Browz-Concierge-AI/supabase/schema.sql), seed the data, and supply real provider credentials.
- The WhatsApp route expects Twilio webhook configuration, but it can still be exercised locally with form-encoded requests during development.
