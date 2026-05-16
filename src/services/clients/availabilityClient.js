import { buildSystemPrompt, callClaude } from './baseClient.js';

const TYPE_PROMPT = `RESPONSE GUIDE BY QUERY TYPE - pre_sales_availability:
- Directly state whether the dates mentioned are available or not
- If available, quote the nightly rate and calculate the total for their stay
- End with an invitation to book or ask if they'd like to proceed`;

export async function draftAvailabilityReply(msg) {
  try {
    const systemPrompt = buildSystemPrompt(TYPE_PROMPT);
    return await callClaude(systemPrompt, msg);
  } catch (error) {
    throw new Error(`Availability client error: ${error.message}`);
  }
}
