/**
 * Confidence score: how certain are we that the AI-drafted reply is accurate
 * and complete enough to send without human review?
 *
 * Dimensions:
 *   1. Query type baseline — factual queries (check-in times, WiFi password)
 *      score higher than judgment-heavy ones (special requests, complaints).
 *   2. Source channel — established booking platforms and direct guests carry
 *      more context; lower-trust channels get a small penalty.
 *   3. AI vs fallback — a Claude-generated reply is context-aware and scores
 *      higher; a deterministic fallback template is generic and scores lower.
 *   4. Reply length — a reply shorter than 40 chars is likely incomplete.
 *
 * Final score is clamped to [0.00, 1.00].
 */

const TYPE_BASELINE = {
  post_sales_checkin: 0.90,      // Fixed facts: check-in time, WiFi password
  pre_sales_availability: 0.87,  // Factual answer from property data
  pre_sales_pricing: 0.85,       // Deterministic calculation
  special_request: 0.72,         // Needs a human to actually arrange it
  general_enquiry: 0.70,         // Wide range of possible questions
  complaint: 0.40,               // Requires empathy and human follow-up
};

const SOURCE_DELTA = {
  direct: 0.03,
  booking_com: 0.02,
  airbnb: 0.02,
  whatsapp: 0.01,
  instagram: 0.00,
};

export function calculateConfidence({ queryType, source, usedFallback, replyLength = 0 }) {
  const base = TYPE_BASELINE[queryType] ?? 0.70;
  const sourceDelta = SOURCE_DELTA[source] ?? 0.00;

  // Claude reply vs deterministic fallback
  const qualityDelta = usedFallback ? -0.10 : 0.05;

  // Penalise suspiciously short replies
  const lengthDelta = replyLength < 40 ? -0.05 : replyLength > 100 ? 0.03 : 0.01;

  const raw = base + sourceDelta + qualityDelta + lengthDelta;
  return Number(Math.max(0, Math.min(1, raw)).toFixed(2));
}

export function deriveAction(confidenceScore, queryType) {
  if (queryType === 'complaint') {
    return 'escalate';
  }

  if (confidenceScore > 0.85) {
    return 'auto_send';
  }

  if (confidenceScore >= 0.60) {
    return 'agent_review';
  }

  return 'escalate';
}
