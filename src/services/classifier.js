/**
 * Priority-ordered rules. The first matching rule wins.
 * Complaint is checked first so an angry message with a pricing question
 * is still escalated — complaints always need human review.
 */
const QUERY_RULES = [
  {
    type: 'complaint',
    patterns: [
      /\b(not working|broken|issue|problem|unhappy|angry|dirty|refund|cancel|leak|stopped|doesn'?t work|does not work|disgusting|unacceptable|terrible|horrible|awful)\b/i,
    ],
  },
  {
    type: 'special_request',
    patterns: [
      /\b(early check[-\s]?in|late check[-\s]?out|airport (transfer|pickup|drop)|transfer|pickup|drop.?off|chef|decoration|flowers|birthday|anniversary|extra bed|baby cot|crib|surprise)\b/i,
    ],
  },
  {
    type: 'post_sales_checkin',
    patterns: [
      /\b(check[-\s]?in|check[-\s]?out|wifi|wi[-\s]?fi|password|arrival|key|access|late arrival|entry|door code|pin)\b/i,
    ],
  },
  {
    type: 'pre_sales_availability',
    patterns: [
      /\b(available|availability|free|vacant|open|bookable|still available|can we book|is it available)\b/i,
      /\b(dates?|from .+? to|between .+? and)\b/i,
    ],
  },
  {
    type: 'pre_sales_pricing',
    patterns: [
      /\b(rate|price|pricing|cost|quote|charges?|tariff|how much|nightly|per night|total amount|total cost)\b/i,
    ],
  },
  {
    type: 'general_enquiry',
    patterns: [
      /\b(pets?|dog|cat|parking|policy|rules|amenities|pool heating|smoking|location|nearby|housekeeping|breakfast|cook|caretaker|facilities|capacity)\b/i,
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
