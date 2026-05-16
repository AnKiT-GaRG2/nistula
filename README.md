# Nistula Guest Message Handler

A production-grade Node.js/Express webhook that receives inbound guest messages from multiple booking channels, classifies intent, drafts AI-powered replies through a three-tier provider chain, and returns a confidence-scored, action-routed response.

---

## Architecture

```
Inbound webhook
      │
      ▼
[Security headers] → [Request ID] → [Structured JSON logger] → [Body parser] → [Rate limiter]
      │
      ▼
POST /webhook/message
      │
  validatePayload()         — strict field validation, source allowlist, ISO 8601 timestamp check
      │
  normalizeMessage()        — unified schema, UUID generation, all matched query types
      │
  classifyAllQueryTypes()   — priority-ordered regex classifier → query_type + query_types[]
      │
  getConversationHistory()  — last 2 messages from DB injected as context (feature: threading)
      │
  draftReply()              — multi-provider AI chain with per-type token budgets
      │     ┌─────────────────────────────────────────────────────────┐
      │     │  Tier 1: Claude (Anthropic) — primary, highest quality  │
      │     │  Tier 2: Groq (Llama 70B)  — fast, cost-effective       │
      │     │  Tier 3: Gemini Flash      — tertiary fallback           │
      │     │  Tier 4: Text templates    — always succeeds             │
      │     └─────────────────────────────────────────────────────────┘
      │
  calculateConfidence()     — multi-dimensional score [0.00–1.00]
      │
  deriveAction()            — auto_send | agent_review | escalate
      │
  persistMessage()          — async DB write (non-blocking, won't fail the response)
      │
      ▼
JSON response + X-Request-Id header
```

### Directory structure

```
src/
  app.js                          Express app factory (routes + middleware)
  config.js                       Environment config, validated at startup
  server.js                       Process entry point + graceful shutdown
  constants/
    propertyContext.js            Static villa data injected into every AI prompt
  errors/
    AppError.js                   Custom error classes (AppError, ValidationError)
  middleware/
    errorHandler.js               Centralised error handler + 404
    rateLimiter.js                In-memory sliding-window IP rate limiter
    requestId.js                  X-Request-Id generation and propagation
    requestLogger.js              Structured JSON request logs
    securityHeaders.js            Security response headers
  services/
    classifier.js                 Priority-ordered regex query classifier
    claudeClient.js               Multi-provider routing engine (Claude → Groq → Gemini)
    confidence.js                 Confidence scoring and action routing
    fallbackReply.js              Tone-aware deterministic templates
    messageStore.js               Conversation history fetch + message persistence
    db.js                         PostgreSQL connection pool (Neon)
    clients/
      baseClient.js               Shared prompt builders, callClaude(), response parser
      groqClient.js               Groq API client (OpenAI-compatible)
      geminiClient.js             Gemini API client
      availabilityClient.js       Type prompt: pre_sales_availability
      pricingClient.js            Type prompt: pre_sales_pricing
      checkinClient.js            Type prompt: post_sales_checkin
      specialRequestClient.js     Type prompt: special_request
      complaintClient.js          Type prompt: complaint
      generalEnquiryClient.js     Type prompt: general_enquiry
  utils/
    retry.js                      Exponential backoff with jitter, retries network errors
scripts/
  seed.js                         Sample data seed script
  test-webhook.js                 End-to-end test (no external test runner needed)
schema.sql                        Part 2 — full PostgreSQL schema
thinking.md                       Part 3 — written design answers
.env.example                      Environment variable template (no real keys)
```

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Add at minimum one AI key (ANTHROPIC_API_KEY or GROQ_API_KEY) and DATABASE_URL

# 3. Apply the database schema
psql "$DATABASE_URL" -f schema.sql

# 4. (Optional) Seed sample data
node scripts/seed.js

# 5. Start the server
npm run dev

# 6. Run the end-to-end test suite
npm test
```

**Minimum viable setup**: the server works without a database (message persistence is skipped) and without any AI key (text fallback replies are used). For a full run you need at least one AI key and a PostgreSQL connection string.

---

## API reference

### `POST /webhook/message`

Accepts an inbound guest message, classifies it, drafts a reply, and returns a confidence-scored response.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `source` | string | ✓ | `whatsapp` \| `booking_com` \| `airbnb` \| `instagram` \| `direct` |
| `guest_name` | string | ✓ | Full name of the guest |
| `message` | string | ✓ | Raw message text |
| `timestamp` | string | ✓ | ISO 8601 timestamp |
| `booking_ref` | string | ✓ | Reservation reference (e.g. `NIS-2024-0891`) |
| `property_id` | string | ✓ | Property identifier (e.g. `villa-b1`) |

**Example request**

```json
{
  "source": "whatsapp",
  "guest_name": "Rahul Sharma",
  "message": "Is the villa available from April 20 to 24? What is the rate for 2 adults?",
  "timestamp": "2026-05-05T10:30:00Z",
  "booking_ref": "NIS-2024-0891",
  "property_id": "villa-b1"
}
```

**Example response**

```json
{
  "message_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "query_type": "pre_sales_pricing",
  "drafted_reply": "Hi Rahul! The rate for Villa B1 is INR 18,000/night for up to 4 guests, so a 4-night stay (Apr 20–24) comes to INR 72,000 for 2 adults. Want me to check availability and hold a provisional booking? ✨",
  "confidence_score": 0.88,
  "action": "auto_send",
  "reply_source": "groq"
}
```

**Response fields**

| Field | Type | Description |
|---|---|---|
| `message_id` | string | UUID for this message |
| `query_type` | string | Classified intent (see below) |
| `drafted_reply` | string | AI-drafted reply text |
| `confidence_score` | number | 0.00–1.00 (see scoring section) |
| `action` | string | `auto_send` \| `agent_review` \| `escalate` |
| `reply_source` | string | `claude` \| `groq` \| `gemini` \| `fallback` |

**Error responses**

| Status | Code | Cause |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Missing/invalid field, bad source, invalid timestamp |
| `400` | `INVALID_JSON` | Malformed request body |
| `413` | `PAYLOAD_TOO_LARGE` | Body exceeds 64 KB |
| `429` | `RATE_LIMIT_EXCEEDED` | More than 60 requests/min from same IP |
| `500` | `INTERNAL_ERROR` | Unexpected server error |

All error responses include a `requestId` field matching the `X-Request-Id` response header for log correlation.

---

### `GET /health`

Returns server liveness. No auth required.

```json
{ "status": "ok", "timestamp": "2026-05-05T10:30:00.000Z", "uptimeSeconds": 3600 }
```

---

## Query classification

The classifier applies priority-ordered regex rules. Each message is assigned one primary type (and all matched types for multi-topic messages). Priority order prevents misclassification — a complaint that also mentions a price is still classified as `complaint` and always escalated.

| Priority | Type | Trigger | Example |
|---|---|---|---|
| 1 | `complaint` | Anger, damage, malfunction keywords | "The AC is not working, I am not happy" |
| 2 | `special_request` | Transport, chef, early/late check-in, celebration | "Can you arrange an airport pickup?" |
| 3 | `post_sales_checkin` | Check-in time, WiFi, door code | "What time can we check in? WiFi password?" |
| 4 | `pre_sales_pricing` | Rate, cost, per night, how much | "What is the nightly rate for 4 guests?" |
| 5 | `general_enquiry` | Pets, parking, pool, smoking policy | "Do you allow pets?" |
| 6 | `pre_sales_availability` | Dates, availability, can we book | "Is the villa free April 20–24?" (default) |

Multi-topic messages (e.g. "available April 20? Also, what's the WiFi?") are detected by the classifier and sent to the AI with a combined system prompt that addresses all matched topics in one reply.

---

## Confidence scoring

The confidence score represents **how certain we are that the drafted reply is accurate and complete enough to send without human review**.

### Formula

```
heuristic = type_baseline + source_delta + quality_delta + length_delta

final_score = claudeConfidence × 0.65 + heuristic × 0.35   (when AI returns its own score)
            = heuristic                                       (when fallback is used)
```

When the AI returns a self-reported confidence value (embedded in its JSON output), it carries **65% weight** — the model has read the actual message and knows how well its reply covers the question. The heuristic captures structural signals the model cannot see (channel trust, fallback penalty, reply completeness).

### Type baseline

Factual queries with deterministic answers score highest. Complaint is hardcoded low because a human should always review it, regardless of how well-written the AI reply is.

| Query type | Baseline | Rationale |
|---|---|---|
| `post_sales_checkin` | 0.90 | Fixed facts: check-in time, WiFi password — verifiable |
| `pre_sales_availability` | 0.87 | Direct answer from property availability window |
| `pre_sales_pricing` | 0.85 | Deterministic arithmetic, clear formula |
| `special_request` | 0.72 | Reply gathers info, but a human must actually arrange it |
| `general_enquiry` | 0.70 | Wide range of possible sub-questions |
| `complaint` | 0.40 | Requires human empathy and follow-up — never auto-send |

### Source delta

| Source | Delta | Rationale |
|---|---|---|
| `direct` | +0.03 | Direct booking — richest context |
| `booking_com` | +0.02 | Reservation confirmed, structured data |
| `airbnb` | +0.02 | Reservation confirmed |
| `whatsapp` | +0.01 | Common channel, often informal |
| `instagram` | 0.00 | Can be anyone; least context |

### Quality delta

| Origin | Delta |
|---|---|
| AI reply (Claude/Groq/Gemini) | +0.05 |
| Text fallback template | −0.10 |

### Length delta

| Reply length | Delta |
|---|---|
| > 100 characters | +0.03 |
| 40–100 characters | +0.01 |
| < 40 characters | −0.05 (likely incomplete) |

### Action routing

| Score | Action | Meaning |
|---|---|---|
| > 0.85 | `auto_send` | Send immediately without review |
| 0.60–0.85 | `agent_review` | Queue for human approval |
| < 0.60 | `escalate` | Route to senior agent |
| `complaint` (any score) | `escalate` | Hardcoded — always bypasses auto-send |

Multi-type messages use the **lowest** baseline across all matched types (most conservative wins).

---

## Multi-provider AI chain

The server tries three AI providers in sequence before falling back to text templates. Each provider has a per-type token budget — output tokens are sized to the actual reply length needed, avoiding over-spending.

| Provider | Role | Model |
|---|---|---|
| Claude (Anthropic) | Primary | `claude-sonnet-4-20250514` |
| Groq | Secondary | `llama-3.3-70b-versatile` |
| Gemini | Tertiary | `gemini-2.0-flash` |
| Text templates | Always succeeds | — |

**Per-type token budgets** (max output tokens):

| Query type | Max tokens | Rationale |
|---|---|---|
| `post_sales_checkin` | 150 | Factual, brief answers |
| `pre_sales_availability` | 180 | Date check + rate quote |
| `general_enquiry` | 180 | Direct factual answer |
| `pre_sales_pricing` | 200 | Math shown + brief reply |
| `special_request` | 220 | Acknowledge + gather details |
| `complaint` | 250 | Empathy + action steps |

All AI calls include a 15-second `AbortController` timeout. Network errors (`fetch failed`) are retried once with exponential backoff before moving to the next provider.

---

## Reliability features

- **Three-tier AI fallback** — Claude → Groq → Gemini → text templates. The server never returns a 500 for a structurally valid payload.
- **Retry with exponential backoff + jitter** — retries on transient HTTP errors (429, 500, 502, 503, 529) and network-level failures. Jitter (±10%) prevents thundering-herd reconnects.
- **15-second per-request timeout** — every AI call is wrapped in `AbortController`. Slow responses fail fast and fall through to the next provider.
- **Graceful shutdown** — `SIGTERM`/`SIGINT` drains active connections (10-second hard timeout, then force exit).
- **Rate limiting** — 60 requests/minute per IP, sliding window, in-memory. Swap the `Map` in `rateLimiter.js` for Redis when running multiple processes.
- **Structured JSON logging** — every request, error, and AI provider attempt is emitted as a JSON object with `requestId`, `durationMs`, `reply_source`, and `timestamp`. Ready for any log aggregator.
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy` on every response; `X-Powered-By` suppressed.
- **Non-blocking DB writes** — message persistence is fire-and-forget with `.catch()` error logging. A DB failure never delays or breaks the API response.

---

## Part 2 — PostgreSQL Schema

See [`schema.sql`](schema.sql) for full `CREATE TABLE` statements, indexes, constraints, and inline design rationale.

| Table | Purpose |
|---|---|
| `guests` | One canonical row per guest across all channels |
| `properties` | Lettable units with rate rules and JSONB amenities |
| `staff` | Internal agents and managers who review AI drafts |
| `reservations` | Bookings linking guests to properties |
| `conversations` | Thread grouping messages by guest + channel |
| `messages` | Every inbound/outbound message with AI draft and dispatch tracking |

---

## Part 3 — Written answers

See [`thinking.md`](thinking.md).
