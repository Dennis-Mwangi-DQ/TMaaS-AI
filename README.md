# TMaaS AI Readiness Agent

TypeScript/Express backend for the TMaaS Agent A AI readiness assessment prototype.

## Architecture

Production chat uses a LangChain tool-calling agent in `src/agent/agent.ts`:

1. `createAgentLlm()` creates a DeepSeek chat client from `DEEPSEEK_*` environment variables.
2. TMaaS assessment tools are bound from `src/agent/tools.ts`.
3. The agent records dimension signals, checks topic coverage, reads uploaded evidence, and completes the assessment.
4. Session state is persisted to `assessment_sessions` when Supabase is configured, with in-memory state used as a local fallback.

```text
POST /api/chat -> runAgent -> bindTools -> tool loop -> JSON response
```

## What Is Included

- Express server with `/health`, `/api/chat`, `/api/upload`, and `/api/report`.
- Document ingestion for PDF, DOCX, and PPTX uploads.
- Evidence extraction prompts and assessment prompts under `prompts/`.
- Deterministic readiness scoring in `src/scoring/scoringEngine.ts`.
- Use-case matching from `data/use_cases.json`.
- HTML-to-PDF advisory report generation through `src/report/reportBuilder.ts`.
- Vitest coverage for scoring and use-case matching.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env
```

3. Configure DeepSeek and, optionally, Supabase:

```text
DEEPSEEK_API_KEY=your_deepseek_key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

4. Run the TMaaS schema if using Supabase:

```bash
psql "$DATABASE_URL" -f src/db/schema.sql
```

5. Build and start:

```bash
npm run build
npm run dev
```

Open `http://localhost:3000` for the local assessment UI.

## API

| Endpoint | Method | Description |
| --- | --- | --- |
| `/health` | GET | Service and LLM health |
| `/api/chat` | POST | Assessment chat: `{ "message": "...", "sessionId": "uuid" }`. Returns `response` as **Markdown** (render on the client), plus `session`, `assessmentComplete`, and `result` when done. |
| `/api/session/:sessionId` | GET | Session snapshot: documents, topics completed, status, scores |
| `/api/upload` | POST | Multipart document upload with field `document` |
| `/api/report/:sessionId` | GET | PDF advisory report for a completed assessment |

## Verification

```bash
npm test
npm run build
```

The sample evidence pack in `sample_uploads/` can be used to exercise the upload and assessment flow locally.
