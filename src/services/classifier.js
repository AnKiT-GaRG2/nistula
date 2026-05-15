const queryRules = [
  {
    type: 'complaint',
    patterns: [
      /\b(not working|broken|issue|problem|complaint|unhappy|angry|dirty|refund|cancelled?|leak|stopped|doesn't work|does not work)\b/i,
    ],
  },
  {
    type: 'post_sales_checkin',
    patterns: [
      /\b(check[-\s]?in|check[-\s]?out|wifi|wi[-\s]?fi|password|arrival|key|access|late arrival)\b/i,
    ],
  },
  {
    type: 'pre_sales_availability',
    patterns: [
      /\b(available|availability|free|vacant|open|dates|date|bookable)\b/i,
    ],
  },
  {
    type: 'pre_sales_pricing',
    patterns: [
      /\b(rate|price|pricing|cost|quote|charges?|tariff|how much|nightly|per night)\b/i,
    ],
  },
  {
    type: 'special_request',
    patterns: [
      /\b(early check[-\s]?in|late check[-\s]?out|airport transfer|pickup|drop|chef|decoration|flowers|birthday|anniversary|extra bed|baby cot)\b/i,
    ],
  },
  {
    type: 'general_enquiry',
    patterns: [
      /\b(pets?|parking|policy|rules|amenities|pool heating|smoking|location|nearby|housekeeping)\b/i,
    ],
  },
];

export function classifyQuery(messageText = '') {
  const text = String(messageText || '').trim();
  for (const rule of queryRules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.type;
    }
  }
  return 'general_enquiry';
}
