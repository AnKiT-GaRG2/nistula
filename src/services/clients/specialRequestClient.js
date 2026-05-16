import { buildSystemPrompt, callClaude } from './baseClient.js';

const SYSTEM_PROMPT = buildSystemPrompt(`QUERY TYPE: special_request

RESPONSE GUIDE:
- Acknowledge the exact thing the guest asked for (airport transfer, chef, early check-in, decoration, etc.)
- Ask for the specific details needed to action it:
  - Airport transfer → arrival date, time, flight number, number of passengers
  - Chef → preferred meal time, cuisine preferences, dietary restrictions
  - Early check-in / late check-out → what time they need
  - Celebration setup → occasion, number of guests, any specific preferences
- Confirm that the team will follow up once you have these details`);

export async function draftSpecialRequestReply(msg) {
  return callClaude(SYSTEM_PROMPT, msg);
}
