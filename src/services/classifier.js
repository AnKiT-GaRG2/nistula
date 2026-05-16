/**
 * Priority-ordered classification rules.
 *
 * classifyQuery        — returns the single highest-priority match (backward compat).
 * classifyAllQueryTypes — returns ALL matched types in priority order, enabling
 *                         multi-topic handling when a guest asks two different things
 *                         in one message (e.g. "Is it available April 20? Also, WiFi?").
 *
 * Order rationale:
 *  1. complaint      — an angry message mentioning dates/pricing still needs escalation
 *  2. special_request — transport/chef requests must come before checkin so "arrival at station"
 *                       is not caught by a loose checkin pattern
 *  3. post_sales_checkin — specific logistic questions from confirmed guests
 *  4. pre_sales_pricing  — rate/cost queries, checked before availability to avoid "3 nights"
 *                          accidentally matching a date pattern
 *  5. general_enquiry    — pets/parking/pool checked BEFORE availability so "parking available?"
 *                          does not misfire as a booking-availability query
 *  6. pre_sales_availability — villa availability for specific dates
 */
const QUERY_RULES = [
  {
    type: 'complaint',
    patterns: [
      /\b(not working|broken|issue|problem|unhappy|angry|dirty|refund|cancel|leak|stopped|doesn'?t work|does not work|disgusting|unacceptable|terrible|horrible|awful|pathetic|no (hot )?water|no power|no electricity|power (cut|outage))\b/i,
    ],
  },
  {
    type: 'special_request',
    patterns: [
      /\b(airport|railway station|train station|bus station)\b/i,
      /\b(taxi|cab|auto|rickshaw|uber|ola)\b/i,
      /\b(arrange|book|hire|organise|organize)\b.{0,30}\b(taxi|cab|car|driver|chef|cook|transfer|ride|transport)\b/i,
      /\b(early check[-\s]?in|check in early|late check[-\s]?out|check out late)\b/i,
      /\b(chef|in.?house cook|meal service)\b/i,
      /\b(decoration|flowers|birthday|anniversary|celebration|surprise)\b/i,
      /\b(baby cot|crib|high chair)\b/i,
    ],
  },
  {
    type: 'post_sales_checkin',
    patterns: [
      /\b(check[-\s]?in time|check[-\s]?out time|when can we check|how do (we|i) get in)\b/i,
      /\b(wifi|wi[-\s]?fi|internet password|network password)\b/i,
      /\b(access code|door code|gate code|key safe|lockbox)\b/i,
    ],
  },
  {
    type: 'pre_sales_pricing',
    patterns: [
      /\b(rate|price|pricing|cost|quote|charges?|tariff|how much|per night|total cost|total amount)\b/i,
    ],
  },
  {
    type: 'general_enquiry',
    patterns: [
      /\b(pets?|dog|cat|animal)\b/i,
      /\b(parking|car park)\b/i,
      /\b(pool|swim)\b/i,
      /\b(smok)\b/i,
      /\b(cancellation policy|cancel policy)\b/i,
      /\b(bbq|barbecue|grill)\b/i,
      /\b(housekeeping|caretaker|staff)\b/i,
      /\b(capacity|how many (guests?|people)|max(imum)? guests?)\b/i,
    ],
  },
  {
    type: 'pre_sales_availability',
    patterns: [
      /\b(available|availability|free|vacant|open|bookable|can we book)\b/i,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/i,
    ],
  },
];

export function classifyQuery(messageText = '') {
  const text = String(messageText || '').trim();
  for (const rule of QUERY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.type;
    }
  }
  return 'general_enquiry';
}

// Returns every matched type in priority order (complaint first, availability last).
// Deduplication is implicit since each rule maps to a unique type.
export function classifyAllQueryTypes(messageText = '') {
  const text = String(messageText || '').trim();
  const matched = QUERY_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
    .map((rule) => rule.type);
  return matched.length ? matched : ['general_enquiry'];
}
