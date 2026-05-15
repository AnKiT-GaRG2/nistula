# Nistula Guest Message Handler

A production-grade Node.js/Express backend that receives inbound guest messages from multiple channels, normalises them into a unified schema, drafts AI-powered replies via the Claude API, and returns a confidence-scored, action-routed response.

---

## Architecture overview

```
Inbound webhook
      │
      ▼
[Security headers] → [Request ID] → [Structured logger] → [Body parser] → [Rate limiter]
      │
      ▼
POST /webhook/message
      │
  validatePayload()        — strict schema + source allowlist + timestamp check
      │
  normalizeMessage()       — unified schema + UUID generation
      │
  classifyQuery()          — priority-ordered regex classifier → query_type
      │
  draftReply()             — Claude API (3 retries, exponential backoff) or fallback
      │
  calculateConfidence()    — multi-dimensional score [0.00–1.00]
      │
  deriveAction()           — auto_send | agent_review | escalate
      │
      ▼
JSON response + X-Request-Id header
```

### Directory structure

```
src/
  app.js                     Express app factory (routes + middleware wiring)
  config.js                  Environment config with startup warning
  server.js                  Process entry point + graceful shutdown
  constants/
    propertyContext.js        Static property data injected into the Claude prompt
  errors/
    AppError.js               Custom error classes (AppError, ValidationError)
  middleware/
    errorHandler.js           Centralised error handler + 404 handler
    rateLimiter.js            In-memory sliding-window IP rate limiter
    requestId.js              X-Request-Id generation and propagation
    requestLogger.js          Structured JSON request logs
    securityHeaders.js        Security response headers (CSP, X-Frame, etc.)
  services/
    classifier.js             Query-type classifier
    claudeClient.js           Anthropic API client with retry logic
    confidence.js             Confidence scoring and action routing
    fallbackReply.js          Deterministic templates used when Claude is unavailable
  utils/
    retry.js                  Exponential backoff with jitter
scripts/
  schema.sql                  Part 2 — PostgreSQL schema
  test-webhook.js             End-to-end test script (no external dependencies)
```

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and add ANTHROPIC_API_KEY

# 3. Start the server
npm start

# 4. Run tests
npm test
```

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
  "query_type": "pre_sales_availability",
  "drafted_reply": "Hi Rahul! Great news — Villa B1 is available April 20–24. The rate is INR 18,000/night for up to 4 guests, so your 2-adult stay would be INR 72,000 for 4 nights. Shall I hold a provisional booking for you?",
  "confidence_score": 0.95,
  "action": "auto_send"
}
```

**Response fields**

| Field | Type | Description |
|---|---|---|
| `message_id` | string | UUID generated for this message |
| `query_type` | string | Classified intent (see below) |
| `drafted_reply` | string | AI-drafted reply text |
| `confidence_score` | number | 0.00–1.00 |
| `action` | string | `auto_send` \| `agent_review` \| `escalate` |

**Error responses**

| Status | Code | Cause |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Missing/invalid field, bad source, invalid timestamp |
| `400` | `INVALID_JSON` | Malformed request body |
| `413` | `PAYLOAD_TOO_LARGE` | Body exceeds 64 KB |
| `429` | `RATE_LIMIT_EXCEEDED` | More than 60 requests/min from same IP |
| `500` | `INTERNAL_ERROR` | Unexpected server error |

All error responses include a `requestId` field matching the `X-Request-Id` response header, enabling trivial log correlation.

---

### `GET /health`

Returns server liveness. No auth required — intended for load balancer health checks.

```json
{
  "status": "ok",
  "timestamp": "2026-05-05T10:30:00.000Z",
  "uptimeSeconds": 3600
}
```

---

## Query classification

The classifier applies priority-ordered regex rules. Each message is assigned exactly one type; the first matching rule wins. Priority order matters — a complaint that also mentions pricing is still classified as `complaint` so it is always escalated to a human.

| Priority | Type | Example |
|---|---|---|
| 1 | `complaint` | "The AC is not working, I am not happy" |
| 2 | `special_request` | "Can you arrange an airport pickup?" |
| 3 | `post_sales_checkin` | "What time can we check in? WiFi password?" |
| 4 | `pre_sales_availability` | "Is the villa free April 20–24?" |
| 5 | `pre_sales_pricing` | "What is the nightly rate for 4 guests?" |
| 6 | `general_enquiry` | "Do you allow pets?" (default) |

---

## Confidence scoring

The confidence score represents **how certain we are that the AI-drafted reply is accurate and complete enough to send without human review**.

```
score = type_baseline + source_delta + quality_delta + length_delta
```

**Type baseline** — factual queries with deterministic answers score highest:

| Query type | Baseline | Rationale |
|---|---|---|
| `post_sales_checkin` | 0.90 | Fixed facts: check-in time, WiFi password |
| `pre_sales_availability` | 0.87 | Direct answer from property data |
| `pre_sales_pricing` | 0.85 | Deterministic calculation |
| `special_request` | 0.72 | Needs a human to actually arrange it |
| `general_enquiry` | 0.70 | Wide range of possible sub-questions |
| `complaint` | 0.40 | Requires empathy and human follow-up |

**Source delta** — established booking platforms carry richer booking context:

| Source | Delta |
|---|---|
| `direct` | +0.03 |
| `booking_com` | +0.02 |
| `airbnb` | +0.02 |
| `whatsapp` | +0.01 |
| `instagram` | 0.00 |

**Quality delta** — Claude adapts to context; a template is generic:

| Reply origin | Delta |
|---|---|
| Claude API | +0.05 |
| Fallback template | −0.10 |

**Length delta** — a very short reply is likely incomplete:

| Reply length | Delta |
|---|---|
| > 100 chars | +0.03 |
| 40–100 chars | +0.01 |
| < 40 chars | −0.05 |

### Action routing

| Score | Action | Meaning |
|---|---|---|
| > 0.85 | `auto_send` | Send immediately without review |
| 0.60–0.85 | `agent_review` | Queue for human approval |
| < 0.60 | `escalate` | Route to senior agent |
| `complaint` (any score) | `escalate` | Always, regardless of score |

---

## Reliability features

- **Retry with exponential backoff** — the Claude API client retries up to 3 times on transient errors (429, 500, 502, 503, 529). Jitter (±10%) prevents thundering-herd reconnects after an outage.
- **Fallback replies** — if all Claude retries fail, a deterministic template is returned. The server never returns a 500 for a structurally valid payload.
- **Graceful shutdown** — `SIGTERM`/`SIGINT` drains active connections before exiting (10-second hard timeout, then force exit).
- **Rate limiting** — 60 requests/minute per IP, sliding window, in-memory. For multi-process deployments, swap the `Map` in `rateLimiter.js` for a shared Redis store.
- **Structured JSON logging** — all request logs and errors are emitted as JSON objects with `requestId`, `durationMs`, and `timestamp` so they are ready for any log aggregator (Datadog, Loki, CloudWatch).
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, and `Referrer-Policy` are set on every response; `X-Powered-By` is suppressed.

---

## Part 2 — PostgreSQL Schema

See [`scripts/schema.sql`](scripts/schema.sql) for full `CREATE TABLE` statements, indexes, constraints, and design rationale.

### Tables

| Table | Purpose |
|---|---|
| `guests` | One canonical row per guest across all channels |
| `properties` | Lettable units with rate rules and JSONB amenities |
| `staff` | Internal agents and managers who review AI drafts |
| `reservations` | Bookings linking guests to properties |
| `conversations` | Thread grouping messages by guest + channel |
| `messages` | Every inbound and outbound message, with AI draft and dispatch tracking fields |

### Hardest design decision — guest identity across channels

A guest who messages on WhatsApp (`+91-9876-543210`) may be the same person who has an Airbnb booking under "Rahul S." — there is no guaranteed shared identifier across channels.

Three options were considered:

1. **Require email as canonical key** — fails for WhatsApp-only guests who never share an email address.
2. **Fuzzy-match on name + contact** — fragile; false positives create merged records that are difficult to undo and can corrupt booking history.
3. **Late-binding / explicit merge** — create one row per channel contact, allow staff (or an async identity-resolution job) to merge rows explicitly once identity is confirmed.

**Choice: option 3**, implemented as nullable `UNIQUE` columns on the `guests` table (`phone_whatsapp`, `airbnb_id`, `booking_com_id`, etc.). A first-contact guest starts as a new row. Once a staff member (or resolver job) confirms two records belong to the same person, they set both identifiers on one row and remove the duplicate. This avoids irreversible premature merges while maintaining a clean single-record model after resolution.
