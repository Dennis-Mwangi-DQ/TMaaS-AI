# Browz Concierge Agent

TypeScript/Express backend for the Browz Booking Concierge AI Agent.

## Architecture

Production chat uses a single LangChain agent (`runAgent` in `src/agent/agent.ts`):

1. `createAgentLlm()` creates a DeepSeek chat client from `DEEPSEEK_*` environment variables
2. Tools are bound with Zod schemas (`src/agent/tools.ts`)
3. A ReAct loop invokes tools and returns `ToolMessage` results until the model produces a final answer
4. Session context (`lastService`, `lastBranch`, `lastBookingRef`) is persisted on the session

```
POST /api/chat  →  runAgent  →  bindTools  →  tool loop  →  JSON response
```

## What is included

- Express server with `/health`, `/api/chat`, `/api/upload`, and `/api/report`
- LangChain agent with native tool calling, gate checks, and persisted session context
- DeepSeek-only chat configuration
- FAQ lookup with text matching fallback
- Tool layer for availability, bookings, consultations, screenings, clearances, notes, payments, and FAQs
- Supabase-backed catalog, availability, and FAQ tools
- Slot generator scripts for Supabase maintenance
- Vitest tests for `runAgent` and tools

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env
```

3. Configure DeepSeek:

```text
DEEPSEEK_API_KEY=your_deepseek_key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

4. Build and start:

```bash
npm run build
npm run dev
```

Open `http://localhost:3000` for the local dev chat UI (`public/`). Railway runs API-only in production — the `public/` folder is removed at deploy time and not served when `NODE_ENV=production`.

## LLM configuration

The app is configured for DeepSeek only:

```text
DEEPSEEK_API_KEY=your_deepseek_key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

## Health check

`GET /health` returns the active DeepSeek configuration:

```json
{
  "status": "ok",
  "service": "TMaaS AI Readiness Agent",
  "llm": {
    "provider": "deepseek",
    "model": "deepseek-v4-flash",
    "baseUrl": "https://api.deepseek.com",
    "enabled": true
  },
  "embeddings": { "provider": "none", "model": null }
}
```

Returns HTTP 503 when `DEEPSEEK_API_KEY` is not configured.

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API index (production) or dev chat UI (local) |
| `/health` | GET | Service and LLM health |
| `/chat` | POST | Web chat — `{ message, sessionId?, authToken? }` |
| `/whatsapp` | POST | Twilio webhook |

## Notes

- All runtime data (services, branches, slots, FAQs, bookings) comes from Supabase — there is no in-code demo fallback.
- FAQ vector search is disabled in the DeepSeek-only setup; FAQ lookup falls back to text matching.
- Session `agentContext` (service/branch/booking focus) persists to Supabase when configured.
- For production, run [supabase/schema.sql](supabase/schema.sql), load your data into Supabase, then run `npm run seed:generate-slots` / `npm run seed:generate-embeddings` as needed.
- Historical design notes live in [browz-agent-backend-plan.md](browz-agent-backend-plan.md); the live agent is `runAgent`, not the removed pipeline.
