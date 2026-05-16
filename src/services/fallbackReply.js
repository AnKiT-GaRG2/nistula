const replyTemplates = {
  pre_sales_availability: ({ guestName }) =>
    `Hi ${guestName}! Great news — Villa B1 is available for April 20–24. The base rate is INR 18,000 per night for up to 4 guests. If you'd like, I can also help with a pricing breakdown for your exact stay details.`,
  pre_sales_pricing: ({ guestName }) =>
    `Hi ${guestName}! For Villa B1, the base rate is INR 18,000 per night for up to 4 guests. Extra guests are INR 2,000 per night per person. Share the exact dates and number of guests if you'd like a full quote.`,
  post_sales_checkin: ({ guestName }) =>
    `Hi ${guestName}! Check-in for Villa B1 is from 2:00 PM and check-out is by 11:00 AM. The WiFi password is Nistula@2024. Let me know if you need anything else.`,
  special_request: ({ guestName }) =>
    `Hi ${guestName}! Thanks for the request — I can help arrange that. Please share any additional details or timing preferences, and I'll confirm the best available option for Villa B1.`,
  complaint: ({ guestName }) =>
    `Hi ${guestName}, we're sorry to hear about this. I've flagged it for immediate review and a team member should follow up as soon as possible.`,
  general_enquiry: ({ guestName }) =>
    `Hi ${guestName}! Thanks for reaching out. Villa B1 has 3 bedrooms, a private pool, and can host up to 6 guests. If you'd like, I can answer any specific questions about amenities or policies.`,
};

export function generateFallbackReply(normalizedMessage) {
  const template = replyTemplates[normalizedMessage.query_type] || replyTemplates.general_enquiry;
  const firstName = (normalizedMessage.guest_name || 'there').split(' ')[0];
  return template({ guestName: firstName });
}
