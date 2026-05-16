/**
 * Confidence scoring: how certain are we that the drafted reply is accurate
 * and complete enough to send without human review?
 *
 * Score = typeBaseline + sourceDelta + providerDelta + lengthDelta + contextBonus
 *
 * When the AI returns its own confidence estimate (embedded in its JSON output),
 * that carries 65% weight — the model has read the actual message and knows how
 * well its reply covers the question. The heuristic (35%) captures structural
 * signals the model cannot see: channel trust, provider quality, reply length.
 *
 * When no AI confidence is available (API down, fallback used), the heuristic
 * drives the score entirely.
 *
 * Final score is clamped to [0.00, 1.00] and rounded to 2 decimal places.
 */

// ── 1. Query type baseline ────────────────────────────────────────────────────
// Factual queries with deterministic answers score highest.
// Complaint is hardcoded low because a human must always review it.
const TYPE_BASELINE = {
  post_sales_checkin:     0.90,  // Fixed facts: check-in time, WiFi password
  pre_sales_availability: 0.87,  // Direct answer from property availability data
  pre_sales_pricing:      0.85,  // Deterministic arithmetic — clear formula
  special_request:        0.72,  // Reply gathers info; human must actually arrange it
  general_enquiry:        0.70,  // Wide range of possible sub-questions
  complaint:              0.40,  // Requires human empathy and follow-up
};

// ── 2. Source channel delta ───────────────────────────────────────────────────
// Established booking platforms carry richer, more structured context.
const SOURCE_DELTA = {
  direct:      0.03,
  booking_com: 0.02,
  airbnb:      0.02,
  whatsapp:    0.01,
  instagram:   0.00,
};

// ── 3. Provider quality delta ─────────────────────────────────────────────────
// Reflects capability, persona adherence, and context-awareness of each provider.
// A fallback template has no context awareness — penalise it more heavily.
const PROVIDER_DELTA = {
  claude:   0.05,   // Primary; richest instruction-following and persona adherence
  groq:     0.03,   // Strong reasoning; slightly less nuanced than Claude
  fallback: -0.15,  // Generic template; ignores the specific message content
};

// ── 4. Minimum reply length considered complete, per query type ───────────────
// Pricing replies must show arithmetic (longer); check-in replies can be brief.
// A reply shorter than this threshold is likely truncated or off-topic.
const MIN_COMPLETE_LENGTH = {
  post_sales_checkin:     50,
  pre_sales_availability: 80,
  pre_sales_pricing:      100,
  special_request:        70,
  complaint:              90,
  general_enquiry:        50,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveBaseline(queryType, queryTypes) {
  if (queryTypes?.length > 1) {
    // Multi-topic: most conservative baseline wins, minus a complexity penalty
    const min = Math.min(...queryTypes.map((t) => TYPE_BASELINE[t] ?? 0.70));
    return min - 0.03;
  }
  return TYPE_BASELINE[queryType] ?? 0.70;
}

function resolveLengthDelta(replyLength, queryType) {
  const minComplete = MIN_COMPLETE_LENGTH[queryType] ?? 60;

  if (replyLength < 30)          return -0.08;  // Almost certainly malformed or empty
  if (replyLength < minComplete) return -0.04;  // Too short for this query type
  if (replyLength > 150)         return  0.03;  // Substantive, well-developed answer
  return 0.01;                                  // Acceptable length
}

// ── Public API ────────────────────────────────────────────────────────────────

export function calculateConfidence({
  queryType,
  queryTypes,
  source,
  replySource = 'fallback',
  replyLength = 0,
  claudeConfidence = null,
  hasConversationHistory = false,
}) {
  const base          = resolveBaseline(queryType, queryTypes);
  const sourceDelta   = SOURCE_DELTA[source] ?? 0.00;
  const providerDelta = PROVIDER_DELTA[replySource] ?? PROVIDER_DELTA.fallback;
  const lengthDelta   = resolveLengthDelta(replyLength, queryType);

  // Small bonus when prior conversation history was injected into the prompt —
  // the AI had more context and its answer is more likely to be on-point.
  const contextBonus  = hasConversationHistory ? 0.02 : 0.00;

  const heuristic = base + sourceDelta + providerDelta + lengthDelta + contextBonus;

  // AI self-reported confidence carries 65% weight when available.
  const raw = claudeConfidence !== null
    ? claudeConfidence * 0.65 + heuristic * 0.35
    : heuristic;

  return Number(Math.max(0, Math.min(1, raw)).toFixed(2));
}

export function deriveAction(confidenceScore, queryType, {
  queryTypes = [],
  replySource = 'fallback',
} = {}) {
  // Complaints always escalate — regardless of score, provider, or topic mix.
  if (queryType === 'complaint' || queryTypes.includes('complaint')) return 'escalate';

  // Special requests need a human to actually act on them (arrange transport,
  // confirm chef, set up decorations) — never route to auto_send.
  if (queryType === 'special_request' || queryTypes.includes('special_request')) {
    return confidenceScore >= 0.60 ? 'agent_review' : 'escalate';
  }

  // Fallback template replies have no context awareness — cap at agent_review.
  if (replySource === 'fallback') {
    return confidenceScore >= 0.60 ? 'agent_review' : 'escalate';
  }

  if (confidenceScore > 0.85) return 'auto_send';
  if (confidenceScore >= 0.60) return 'agent_review';
  return 'escalate';
}
