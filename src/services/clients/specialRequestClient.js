import { buildSystemPrompt, callClaude } from './baseClient.js';

export const TYPE_PROMPT = `RESPONSE GUIDE BY QUERY TYPE - special_request:
- Acknowledge the exact thing the guest asked for (airport transfer, chef, early check-in, decoration, etc.)
- Ask for the specific details needed to action it:
  - Airport transfer → arrival date, time, flight number, number of passengers
  - Chef → preferred meal time, cuisine preferences, dietary restrictions
  - Early check-in / late check-out → what time they need
  - Celebration setup → occasion, number of guests, any specific preferences
- Confirm that the team will follow up once you have these details`;

export async function draftSpecialRequestReply(msg) {
  try {
    const systemPrompt = buildSystemPrompt(TYPE_PROMPT);
    return await callClaude(systemPrompt, msg);
  } catch (error) {
    throw new Error(`Special request client error: ${error.message}`);
  }
}
