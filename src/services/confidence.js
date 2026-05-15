export function calculateConfidence({
  queryType,
  source,
  usedFallback,
  complaint,
  parsedReply,
}) {
  if (complaint || queryType === 'complaint') {
    return 0.42;
  }

  let score = 0.83;

  const sourceBonus = ['whatsapp', 'booking_com', 'airbnb', 'instagram', 'direct'].includes(source) ? 0.05 : 0;
  const replyBonus = parsedReply ? 0.07 : 0;
  const fallbackPenalty = usedFallback ? 0.08 : 0;

  if (queryType === 'pre_sales_availability' || queryType === 'post_sales_checkin') {
    score += 0.08;
  } else if (queryType === 'pre_sales_pricing') {
    score += 0.06;
  } else if (queryType === 'special_request') {
    score -= 0.02;
  } else {
    score -= 0.04;
  }

  score += sourceBonus + replyBonus - fallbackPenalty;

  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

export function deriveAction(confidenceScore, queryType) {
  if (queryType === 'complaint') {
    return 'escalate';
  }

  if (confidenceScore > 0.85) {
    return 'auto_send';
  }

  if (confidenceScore >= 0.6) {
    return 'agent_review';
  }

  return 'escalate';
}
