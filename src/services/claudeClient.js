import { config } from '../config.js';
import { generateFallbackReply } from './fallbackReply.js';
import { draftAvailabilityReply } from './clients/availabilityClient.js';
import { draftPricingReply } from './clients/pricingClient.js';
import { draftCheckinReply } from './clients/checkinClient.js';
import { draftSpecialRequestReply } from './clients/specialRequestClient.js';
import { draftComplaintReply } from './clients/complaintClient.js';
import { draftGeneralEnquiryReply } from './clients/generalEnquiryClient.js';

const CLIENT_MAP = {
  pre_sales_availability: draftAvailabilityReply,
  pre_sales_pricing:      draftPricingReply,
  post_sales_checkin:     draftCheckinReply,
  special_request:        draftSpecialRequestReply,
  complaint:              draftComplaintReply,
  general_enquiry:        draftGeneralEnquiryReply,
};

export async function draftReply(normalizedMessage) {
  if (!config.anthropicApiKey) {
    return { draftedReply: generateFallbackReply(normalizedMessage), usedFallback: true, claudeConfidence: null };
  }

  const clientFn = CLIENT_MAP[normalizedMessage.query_type] ?? draftGeneralEnquiryReply;

  try {
    const result = await clientFn(normalizedMessage);
    if (result) {
      return { draftedReply: result.reply, usedFallback: false, claudeConfidence: result.confidence };
    }
  } catch (error) {
    console.error(
      JSON.stringify({ type: 'claude_api_error', message: error?.message, timestamp: new Date().toISOString() }),
    );
  }

  return { draftedReply: generateFallbackReply(normalizedMessage), usedFallback: true, claudeConfidence: null };
}
