import { buildSystemPrompt, callClaude } from './baseClient.js';

export const TYPE_PROMPT = `RESPONSE GUIDE BY QUERY TYPE - pre_sales_pricing:
- Extract the guest count and number of nights from their message
- Calculate precisely: base INR 18,000/night (up to 4 guests) + INR 2,000/person/night for extra guests
- Show the maths clearly (e.g. "3 nights × INR 18,000 = INR 54,000")
- If guest count or nights are not mentioned, ask for the missing detail before quoting
- If the guest asks about offers or discounts, explicitly say no offer is available right now`;

export async function draftPricingReply(msg) {
  try {
    const systemPrompt = buildSystemPrompt(TYPE_PROMPT);
    return await callClaude(systemPrompt, msg);
  } catch (error) {
    throw new Error(`Pricing client error: ${error.message}`);
  }
}
