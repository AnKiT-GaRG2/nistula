import { buildSystemPrompt, callClaude } from './baseClient.js';

export const TYPE_PROMPT = `RESPONSE GUIDE BY QUERY TYPE - pre_sales_availability:
- Only confirm the dates as available if they exactly match the availability window in the property context
- If the guest asks about any other dates, say availability is not confirmed for those dates and offer to check further
- If available, quote the nightly rate and calculate the total cost for their stay duration
- End with an invitation to book or ask if they'd like to proceed`;

export async function draftAvailabilityReply(msg) {
  try {
    const systemPrompt = buildSystemPrompt(TYPE_PROMPT);
    return await callClaude(systemPrompt, msg);
  } catch (error) {
    throw new Error(`Availability client error: ${error.message}`);
  }
}
