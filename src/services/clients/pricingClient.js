import { buildSystemPrompt, callClaude } from './baseClient.js';

const SYSTEM_PROMPT = buildSystemPrompt(`QUERY TYPE: pre_sales_pricing

RESPONSE GUIDE:
- Extract the guest count and number of nights from their message
- Calculate precisely: base INR 18,000/night (up to 4 guests) + INR 2,000/person/night for extra guests
- Show the maths clearly (e.g. "3 nights × INR 18,000 = INR 54,000")
- If guest count or dates are not mentioned, ask for them before quoting`);

export async function draftPricingReply(msg) {
  return callClaude(SYSTEM_PROMPT, msg);
}
