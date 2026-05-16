import { buildSystemPrompt, callClaude } from './baseClient.js';

const TYPE_PROMPT = `RESPONSE GUIDE BY QUERY TYPE - pre_sales_pricing:
- Extract the guest count and number of nights from their message
- Calculate precisely: base INR 18,000/night (up to 4 guests) + INR 2,000/person/night for extra guests
- Show the maths clearly (e.g. "3 nights × INR 18,000 = INR 54,000")
- If guest count or dates are not mentioned, ask for them before quoting
- If the guest asks about offers/discounts and the property context says there is no current offer, explicitly say that no offer is available right now`;

export async function draftPricingReply(msg) {
  try {
    const systemPrompt = buildSystemPrompt(TYPE_PROMPT);
    return await callClaude(systemPrompt, msg);
  } catch (error) {
    throw new Error(`Pricing client error: ${error.message}`);
  }
}
