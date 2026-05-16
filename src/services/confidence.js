/**
 * Confidence scoring: how certain are we that the drafted reply is accurate
 * and complete enough to send without human review?
 *
 * When Claude returns its own confidence estimate, that carries the most signal
 * because it has actually read the message and knows what it answered. We blend
 * it (65% weight) with a heuristic score (35% weight) that factors in structural
 * signals Claude cannot see: source channel trust and whether we fell back to a
 * template reply.
 *
 * When no Claude confidence is available (API down, fallback used), the heuristic
 * drives the score entirely.
 *
 * Heuristic dimensions:
 *   1. Query type baseline — factual queries score higher than judgment-heavy ones.
 *   2. Source channel — established platforms carry more context; a penalty for lower-trust channels.
 *   3. AI vs fallback — a Claude reply is context-aware; a template is generic and penalised.
 *   4. Reply length — a reply under 40 chars is almost certainly incomplete.
 *
 * Final score is clamped to [0.00, 1.00].
 */

const TYPE_BASELINE = {
  post_sales_checkin: 0.90,     // Fixed facts: check-in time, WiFi password
  pre_sales_availability: 0.87, // Factual answer from property data
  pre_sales_pricing: 0.85,      // Deterministic calculation
  special_request: 0.72,        // Needs a human to actually arrange it
  general_enquiry: 0.70,        // Wide range of possible questions
  complaint: 0.40,              // Requires empathy and human follow-up
};

const SOURCE_DELTA = {
  direct: 0.03,
  booking_com: 0.02,
  airbnb: 0.02,
  whatsapp: 0.01,
  instagram: 0.00,
};

export function calculateConfidence({ queryType, queryTypes, source, usedFallback, replyLength = 0, claudeConfidence = null }) {
  // Multi-type messages are harder — use the lowest baseline across all matched types
  const base = queryTypes?.length > 1
    ? Math.min(...queryTypes.map((t) => TYPE_BASELINE[t] ?? 0.70))
    : (TYPE_BASELINE[queryType] ?? 0.70);
  const sourceDelta = SOURCE_DELTA[source] ?? 0.00;
  const qualityDelta = usedFallback ? -0.10 : 0.05;
  const lengthDelta = replyLength < 40 ? -0.05 : replyLength > 100 ? 0.03 : 0.01;

  const heuristic = base + sourceDelta + qualityDelta + lengthDelta;

  // Claude's self-reported confidence gets 65% weight when available — it has
  // read the actual message and knows how well its reply covers the question.
  const raw = claudeConfidence !== null
    ? claudeConfidence * 0.65 + heuristic * 0.35
    : heuristic;

  return Number(Math.max(0, Math.min(1, raw)).toFixed(2));
}

export function deriveAction(confidenceScore, queryType) {
  if (queryType === 'complaint') return 'escalate';
  if (confidenceScore > 0.85) return 'auto_send';
  if (confidenceScore >= 0.60) return 'agent_review';
  return 'escalate';
}
