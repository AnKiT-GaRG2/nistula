import { handleAvailability }  from '../handlers/availability.js';
import { handlePricing }       from '../handlers/pricing.js';
import { handleCheckin }       from '../handlers/checkin.js';
import { handleSpecialRequest } from '../handlers/specialRequest.js';
import { handleComplaint }     from '../handlers/complaint.js';
import { handleGeneralEnquiry } from '../handlers/generalEnquiry.js';

export function generateFallbackReply(normalizedMessage) {
  const firstName = (normalizedMessage.guest_name || 'there').split(' ')[0];
  const ctx = { firstName, messageText: normalizedMessage.message_text || '' };

  switch (normalizedMessage.query_type) {
    case 'pre_sales_availability': return handleAvailability(ctx);
    case 'pre_sales_pricing':      return handlePricing(ctx);
    case 'post_sales_checkin':     return handleCheckin(ctx);
    case 'special_request':        return handleSpecialRequest(ctx);
    case 'complaint':              return handleComplaint(ctx);
    case 'general_enquiry':        return handleGeneralEnquiry(ctx);
    default:                       return `Hi ${firstName}! Happy to help. Could you share a bit more detail so I can give you the right answer?`;
  }
}
