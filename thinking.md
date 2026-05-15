# Thinking — Nistula Technical Assessment

---

## Part 1 — Webhook & AI Integration

### How I approached the confidence scoring

The core question is: *how certain are we that this AI draft is good enough to send without a human reading it first?*

I broke the score into four independent dimensions, each additive:

**1. Query type baseline**
This is the biggest driver. Queries with deterministic answers (check-in time, WiFi password) should score high because the AI has a narrow, verifiable answer space. Complaints should score low — not because the AI writes bad empathy, but because a human should *always* see a complaint before it goes out. I hardcoded complaint to `escalate` regardless of score as a separate guard.

**2. Source channel delta**
Booking.com and Airbnb guests arrive with a reservation already attached — there's richer context, lower ambiguity. Instagram DMs can come from anyone. Small adjustments (+0.00 to +0.03) rather than a big swing, because channel alone isn't a strong signal.

**3. AI vs fallback delta**
A Claude-generated reply is context-aware and addresses the actual message. A template reply is generic. Fallback gets −0.10 as a meaningful penalty — you'd want an agent to check it rather than let a boilerplate go out.

**4. Reply length**
A reply under 40 characters is almost certainly incomplete or malformed — that shouldn't auto-send. Over 100 characters usually means the AI actually answered something. Small adjustments (±0.03/0.05).

**Final clamping** to `[0.00, 1.00]` and rounding to 2 decimal places so the number is meaningful and auditable.

### Routing thresholds

- `> 0.85` → `auto_send`: High confidence, factual query, Claude replied. Safe to send.
- `0.60–0.85` → `agent_review`: Plausible reply, but needs a quick human scan.
- `< 0.60` → `escalate`: Low confidence or wide-open question. Route to senior agent.
- `complaint` → always `escalate`, regardless of score.

These thresholds are intentionally conservative. It's safer to over-route to `agent_review` than to auto-send a reply that damages trust.

### What I would change with more time

- **Feedback loop**: track which auto-sent replies guests responded positively to and feed that back into the baseline weights. Right now the weights are heuristic.
- **Per-property context injection**: the system prompt uses a single static property string. With a real DB, I'd pull the actual `properties` row and inject live rates, availability, and amenities.
- **Structured tool use**: instead of asking Claude to return JSON via a system prompt, use the Anthropic tool-use API. Forces a schema, eliminates the JSON-extraction fallback.
- **Streaming**: for a staff review UI, streaming the draft reply as it's generated reduces perceived latency significantly.

---

## Part 2 — PostgreSQL Schema

### Hardest decision: guest identity across channels

The same real person might contact via WhatsApp one day and Airbnb the next. They have no shared identifier we can reliably query.

Three options I considered:

| Option | Problem |
|---|---|
| Email as canonical key | WhatsApp-only guests never give an email |
| Fuzzy-match on name + phone | False positives create merged records that corrupt booking history and are hard to undo |
| Late-binding / explicit merge | Creates duplicate rows, but merging is explicit and reversible |

I went with **late-binding**: one row per channel contact, nullable `UNIQUE` columns (`phone_whatsapp`, `airbnb_id`, `booking_com_id`, `instagram_id`). A staff member or async job merges rows once identity is confirmed — sets both identifiers on one row and deletes the duplicate. This keeps data clean without risking an irreversible false merge.

### Why AI draft fields live on `messages` not a separate table

A separate `message_drafts` table adds a JOIN on every message read and complicates the review queue query. The draft fields are nullable, so outbound and human-typed messages are unaffected. If draft revision history becomes a requirement later, adding `message_drafts` is a non-breaking addition.

### Why `raw_payload JSONB`

Storing the original webhook body means:
1. Any message can be re-processed after a classifier or prompt bug fix without asking the source channel to re-send.
2. Full audit trail for compliance without a separate event-log table.
3. Channel-specific fields that don't fit the normalised schema (e.g. Airbnb's `listing_id`) are preserved without requiring a schema migration.

### Why `conversations` is a first-class table

Without it, "show all messages in this thread" requires a self-join or a denormalised `thread_id` on messages. Making conversation a real entity also lets us track escalation state at the thread level, not just the message level — a conversation is `escalated`, not just a message.

### Indexes chosen and why

- `idx_guests_full_name`: GIN full-text index for the staff search UI ("find a guest named Rahul").
- `idx_reservations_guest/property`: FK lookups and property calendar queries.
- `idx_reservations_status` (partial, excludes `checked_out`/`cancelled`): the active-booking list never needs old statuses.
- `idx_conversations_open` (partial, `status = 'open'`): the review queue only ever looks at open conversations.
- `idx_messages_pending_review` (partial, inbound + null dispatch): the agent inbox query — find unreviewed inbound messages sorted by confidence score.

---

## Part 3 — Written Answers

### Q1: If you had to scale this to 10,000 messages/day, what would you change?

**Current bottleneck**: the in-memory rate limiter is per-process. Behind a load balancer with multiple Node processes, each process has its own counter — rate limiting breaks. Replace the `Map` in `rateLimiter.js` with a Redis `INCR` + `EXPIRE` operation.

**Database**: 10,000 messages/day is ~7 writes/minute — Neon handles that easily. The real concern is read scaling for the staff review UI. Add a read replica and route the inbox query there.

**Claude API latency**: at 10k/day the p99 latency of the Anthropic call (typically 1–3s) becomes visible. Options:
1. Accept async processing — webhook returns 202 immediately, persists the raw message, a worker drafts the reply and updates the row. Staff review UI polls or uses a websocket.
2. Keep synchronous but add aggressive circuit-breaking so a slow Claude response doesn't queue requests.

**Queue**: at higher volumes I'd introduce a job queue (BullMQ / Postgres-backed) between webhook ingestion and Claude drafting. Decouples the HTTP response time from AI latency entirely.

### Q2: How would you handle a channel (e.g. WhatsApp) going down for 30 minutes?

The fallback reply mechanism already handles the AI side — if Claude is down, deterministic templates are returned. The channel going down is different: *we* can't send replies out.

Short answer: persist the drafted reply with `dispatch_status = NULL` (pending) as we do today, and add a `retry_after` timestamp. A worker retries delivery on a backoff schedule. Once the channel recovers, it sweeps pending messages and delivers them in order.

This is exactly why `dispatched_at` and `dispatch_status` are separate fields — `dispatch_status = NULL` means "drafted but not yet sent", which is the correct state during a channel outage.

### Q3: What would you add to make the confidence score more trustworthy?

1. **Historical calibration**: track `auto_sent` messages where the guest replied negatively (sentiment-detected follow-up within 10 minutes). Use that to recalibrate the type baselines quarterly.
2. **Semantic similarity score**: compare the drafted reply against a golden-answer library using embeddings. High cosine similarity → small positive delta.
3. **Hallucination detection**: if the reply contains a price, date, or time that doesn't appear in the property context, apply a large negative penalty. The model occasionally invents numbers.
4. **A/B routing experiments**: at low traffic, route a fraction of `auto_send` messages through `agent_review` anyway and track whether agents edited them. If edit rate is low, confidence thresholds can be relaxed.
