import { buildSystemPrompt, callClaude } from './baseClient.js';

const TYPE_PROMPT = `RESPONSE GUIDE BY QUERY TYPE - post_sales_checkin:
- Answer the specific question directly (check-in time, WiFi password, check-out time, caretaker contact, etc.)
- Do not pad the reply with information that was not asked for`;

export async function draftCheckinReply(msg) {
  try {
    const systemPrompt = buildSystemPrompt(TYPE_PROMPT);
    return await callClaude(systemPrompt, msg);
  } catch (error) {
    throw new Error(`Check-in client error: ${error.message}`);
  }
}
