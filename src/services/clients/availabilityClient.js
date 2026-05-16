import { buildSystemPrompt, callClaude } from './baseClient.js';

const SYSTEM_PROMPT = buildSystemPrompt(`QUERY TYPE: pre_sales_availability

RESPONSE GUIDE:
- Directly state whether the dates mentioned are available or not
- If available, quote the nightly rate and calculate the total for their stay
- End with an invitation to book or ask if they'd like to proceed`);

export async function draftAvailabilityReply(msg) {
  return callClaude(SYSTEM_PROMPT, msg);
}
