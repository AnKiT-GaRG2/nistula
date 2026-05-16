import { buildSystemPrompt, callClaude } from './baseClient.js';

const SYSTEM_PROMPT = buildSystemPrompt(`QUERY TYPE: post_sales_checkin

RESPONSE GUIDE:
- Answer the specific question directly (check-in time, WiFi password, check-out time, caretaker contact, etc.)
- Do not pad the reply with information that was not asked for`);

export async function draftCheckinReply(msg) {
  return callClaude(SYSTEM_PROMPT, msg);
}
