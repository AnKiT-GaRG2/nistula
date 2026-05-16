import { handleAvailability }  from '../handlers/availability.js';
import { handlePricing }       from '../handlers/pricing.js';
import { handleCheckin }       from '../handlers/checkin.js';
import { handleSpecialRequest } from '../handlers/specialRequest.js';
import { handleComplaint }     from '../handlers/complaint.js';
import { handleGeneralEnquiry } from '../handlers/generalEnquiry.js';

export function generateFallbackReply(normalizedMessage) {
  const firstName = (normalizedMessage.guest_name || 'there').split(' ')[0];
  const ctx = { firstName, messageText: normalizedMessage.message_text || '' };
  const askedAboutOffer = /\b(offer|offers|discount|deal|promo|promotion)\b/i.test(ctx.messageText);

  switch (normalizedMessage.query_type) {
    case 'pre_sales_availability': return handleAvailability(ctx);
    case 'pre_sales_pricing': {
      const reply = handlePricing(ctx);
      return askedAboutOffer ? `${reply} At the moment, there is no offer available.` : reply;
    }
    case 'post_sales_checkin':     return handleCheckin(ctx);
    case 'special_request':        return handleSpecialRequest(ctx);
    case 'complaint':              return handleComplaint(ctx);
    case 'general_enquiry':        return handleGeneralEnquiry(ctx);
    default:                       return `Hi ${firstName}! Happy to help. Could you share a bit more detail so I can give you the right answer?`;
  }
}
