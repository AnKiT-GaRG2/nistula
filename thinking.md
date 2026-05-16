# Thinking — Nistula Technical Assessment

---

## Part 1 — Webhook & AI Integration

### How I approached the confidence scoring

The core question is: *how certain are we that this AI draft is accurate and complete enough to send without a human reading it first?*

I broke the score into four independent heuristic dimensions, then blended in the AI's own self-assessment when available.

**1. Query type baseline — the dominant signal**

The biggest driver of score is the type of question. Queries with deterministic, verifiable answers (check-in time, WiFi password, a nightly rate calculation) should score high because the answer space is narrow and the AI has the correct answer in its context window. Complaints score low by design — not because the AI writes poor empathy, but because a human should *always* review a complaint before it goes out. Complaint also has a hardcoded rule that forces `escalate` regardless of the score, as a separate safety net.

**2. Source channel delta — small but meaningful**

A guest on Booking.com has an attached reservation with structured data. An Instagram DM can come from anyone. Small adjustments (0.00–0.03) rather than large swings, because channel alone isn't a strong signal — it tilts the scale without dominating it.

**3. AI vs. fallback delta**

A Claude/Groq/Gemini reply is context-aware: it reads the actual message, addresses the specific question, and follows the persona prompt. A template reply is generic. Fallback gets −0.10 as a meaningful penalty, ensuring template responses queue for human review rather than auto-sending.

**4. Reply length delta**

A reply under 40 characters is almost certainly malformed, truncated, or off-topic — it should never auto-send. Over 100 characters generally means the AI answered something substantial. Small adjustments (±0.03/0.05), not a primary driver.

**Blending with the AI's self-reported confidence**

When the AI returns a `confidence` field in its JSON output (which the system prompt instructs it to), that value carries **65% weight**. The model has read the actual message and knows how well its reply covers the question — that signal is stronger than any heuristic. The heuristic (35%) captures structural signals the model cannot see: channel trust, whether we fell back to a template, and reply completeness.

When no AI confidence is available (API down, fallback used), the heuristic drives the score entirely.

**Final clamping** to `[0.00, 1.00]`, rounded to 2 decimal places so the number is auditable and meaningful.

### Routing thresholds

- `> 0.85` → `auto_send`: High confidence, factual query, AI replied with a verifiable answer. Safe to send immediately.
- `0.60–0.85` → `agent_review`: Plausible reply, but warrants a quick human scan before delivery.
- `< 0.60` → `escalate`: Low confidence, ambiguous question, or missing context. Route to a senior agent.
- `complaint` → always `escalate`, regardless of score.

These thresholds are intentionally conservative. Over-routing to `agent_review` costs 30 seconds of an agent's time; auto-sending a wrong reply damages guest trust and can corrupt booking data.

### Multi-provider AI strategy

Rather than depending on a single AI provider, the system implements a three-tier fallback chain: **Claude → Groq → Gemini → text templates**.

The rationale is reliability over cost optimisation. Any single API can have outages, rate limits, or key expiry. A chain means:

- Claude (Anthropic Sonnet) provides the highest-quality replies — richest persona adherence and most nuanced empathy for complaints.
- Groq (Llama 3.3 70B) is fast and cost-effective. At ~$0.59/M input tokens vs. Claude's ~$3/M, it handles the majority of traffic when Claude is unavailable.
- Gemini Flash is a tertiary safety net — very cheap and reaches different infrastructure.
- Text templates guarantee the server always returns *something* useful rather than a 500.

Each provider receives a per-type token budget (150–250 output tokens) sized to what each reply actually needs. Pricing replies need 200 tokens to show the arithmetic; a check-in reply needs only 150. Allocating 512 tokens uniformly (the naive default) wastes money on every request.

### What I would add with more time

- **Feedback loop**: track which `auto_sent` replies received a negative guest follow-up (sentiment-detected, within 10 minutes) and feed that signal back into the type baselines quarterly.
- **Per-property live context**: the system prompt uses a static property string. With a real DB, I'd pull the actual `properties` row and inject live rates, current availability calendar, and real amenity data.
- **Structured tool use**: instead of asking the AI to return JSON via a system prompt, use the Anthropic tool-use API (or Groq's equivalent). Forces a schema, eliminates the JSON-extraction regex fallback, and makes confidence a typed field rather than a parsed number.
- **Streaming**: for the staff review UI, streaming the draft reply as it's generated reduces perceived latency by 60–80%.
- **Conversation-aware routing**: if the prior conversation shows the guest is already frustrated, the system should escalate even a normally high-confidence query type.

---

## Part 2 — PostgreSQL Schema

### Hardest decision: guest identity across channels

The same real person might contact via WhatsApp one day and Airbnb the next. There is no shared identifier guaranteed across all channels.

Three options I considered:

| Option | Problem |
|---|---|
| Email as canonical key | WhatsApp-only guests never provide an email |
| Fuzzy-match on name + phone | False positives create merged records that corrupt booking history and are hard to undo |
| Late-binding / explicit merge | Creates temporary duplicates, but merging is explicit and reversible |

I chose **late-binding**: one row per channel contact, nullable `UNIQUE` columns (`phone_whatsapp`, `airbnb_id`, `booking_com_id`, `instagram_id`). A guest who contacts on two channels starts as two rows. A staff member or async identity-resolution job sets both identifiers on one row and removes the duplicate once identity is confirmed.

This avoids irreversible false merges while maintaining a clean single-record model after resolution. A false merge in a booking system is far harder to unwind than a temporary duplicate.

### Why AI draft fields live on `messages`, not a separate table

A separate `message_drafts` table adds a JOIN on every message read and complicates the agent inbox query. The draft fields are nullable — outbound and human-typed messages have no AI fields at all. If draft revision history (multiple edit rounds before sending) becomes a requirement, adding a `message_drafts` child table is a non-breaking addition.

### Why `raw_payload JSONB`

Storing the original webhook body means:
1. Any message can be re-processed after a classifier or prompt bug fix without asking the source channel to re-send.
2. Full audit trail for compliance without a separate event-log table.
3. Channel-specific fields that don't fit the normalised schema (Airbnb's `listing_id`, Booking.com's `reservation_details`) are preserved without a schema migration.

### Why `conversations` is a first-class entity

Without it, "show all messages in this thread" requires a self-join or a denormalised `thread_id` on `messages`. Making conversation a real table also lets us track escalation state at the thread level (`conversations.status = 'escalated'`), not just per-message — a conversation is escalated, not just one message within it.

### Indexes chosen and why

- `idx_guests_full_name` (GIN full-text): for the staff search UI — "find a guest named Rahul".
- `idx_reservations_guest/property`: FK lookups and property availability calendar queries.
- `idx_reservations_status` (partial, excludes `checked_out`/`cancelled`): the active-booking list never needs completed statuses. Partial indexes keep it fast and small.
- `idx_conversations_open` (partial, `status = 'open'`): the agent review queue only touches open conversations.
- `idx_messages_pending_review` (partial, inbound + null `dispatch_status`): the most important query — find unreviewed inbound messages sorted by confidence score ascending (lowest confidence first, as these need the most urgent human attention).

---

## Part 3 — Written Answers

### Q1: If you had to scale this to 10,000 messages/day, what would you change?

**Decouple ingestion from drafting.** Right now the webhook holds the HTTP connection open while waiting for the AI to respond (1–4s). At 10,000 messages/day (~7/minute) that's manageable, but at higher load it creates a request queue. The fix: return `202 Accepted` immediately, persist the raw message to a queue (BullMQ, or a simple `pending_messages` Postgres table), and have a worker pool pull jobs and call the AI asynchronously. The staff review UI polls or uses a WebSocket to receive the drafted reply when it's ready.

**Replace the in-memory rate limiter.** The current `Map`-based limiter is per-process. Behind a load balancer with two Node instances, each has its own counter — a single IP can make 120 requests/minute. Replace with a Redis `INCR` + `EXPIRE` key per IP.

**Database reads.** 10,000 messages/day is ~7 writes/minute — well within Neon's free tier. The concern is the agent inbox *read* query, which could become expensive if thousands of unreviewed messages accumulate. Add a read replica for the inbox query; keep writes on the primary.

**Circuit breaker on AI providers.** If Claude is returning 503s, don't keep hammering it — mark it as unavailable for 60 seconds and skip straight to Groq. This prevents a slow provider from serialising the request queue.

**Connection pooling.** The current `pg.Pool` is per-process. Add PgBouncer (or Neon's built-in pooler) at the connection layer to prevent exhausting the Postgres connection limit when multiple Node workers run concurrently.

### Q2: How would you handle a channel (e.g. WhatsApp) going down for 30 minutes?

The AI fallback mechanism handles the *drafting* side already. The channel going down is different: we can draft a reply but cannot *deliver* it.

The correct approach is **store-and-forward**:

1. Draft the reply normally and persist it to the DB with `dispatch_status = NULL` (not yet sent) and a `retry_after = NOW() + INTERVAL '2 minutes'`.
2. A lightweight background worker queries `WHERE dispatch_status IS NULL AND retry_after < NOW()` on a schedule (every 30 seconds).
3. The worker attempts delivery. On success: set `dispatch_status = 'auto_sent'` and `dispatched_at = NOW()`. On failure: apply exponential backoff to `retry_after` (2m → 4m → 8m → cap at 30m).
4. After the channel recovers, the worker sweeps the pending queue and delivers messages in `created_at ASC` order — guests who waited longest get their reply first.

This is exactly why `dispatched_at` and `dispatch_status` are separate columns in the schema. `dispatch_status = NULL` is the correct state for "drafted but not yet sent", whether the reason is channel outage, agent review, or escalation.

For a 30-minute outage at 7 messages/minute, the queue would accumulate ~210 pending messages. Once the channel recovers, the worker can clear the backlog in 3–5 minutes at a controlled send rate (avoid hitting WhatsApp's rate limits on reconnect).

### Q3: What would you add to make the confidence score more trustworthy?

**1. Historical calibration.**
Track `auto_sent` messages where the guest sent a negative follow-up within 10 minutes (sentiment-detected: "that's wrong", "that doesn't answer my question", "what?"). Compute the actual error rate per query type per month and adjust the baselines accordingly. Right now the baselines are heuristic — this makes them empirical.

**2. Hallucination detection.**
If the drafted reply contains a price, date, or time that does not appear verbatim in the property context, apply a large negative penalty (−0.20). The model occasionally invents numbers that look plausible but are wrong. This is the failure mode most likely to damage guest trust.

**3. Semantic similarity against a golden-answer library.**
For each query type, maintain 20–30 human-written example replies. Embed both the AI reply and the nearest golden answer using a small embedding model (text-embedding-3-small). High cosine similarity → small positive delta (+0.05). This catches cases where the AI has the right facts but bizarre phrasing.

**4. A/B routing experiment.**
At low traffic, route a random 5% of `auto_send`-scored messages through `agent_review` anyway. Track whether agents edited them. If the edit rate on that 5% is below 3%, the `auto_send` threshold can safely be lowered from 0.85 to 0.80. If it's above 10%, the threshold needs to go up. This is how you move from heuristic thresholds to evidence-based ones without a large experiment infrastructure.

**5. Multi-turn context penalty.**
If the conversation history shows the guest has already asked the same question once and received a reply, the current system may give the same answer again without acknowledging the repetition. Detect repeated questions and apply a small negative delta to ensure an agent reviews the second answer before it's sent.
