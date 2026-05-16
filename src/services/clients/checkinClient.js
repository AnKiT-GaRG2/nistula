import { buildSystemPrompt, callClaude } from './baseClient.js';

export const TYPE_PROMPT = `RESPONSE GUIDE BY QUERY TYPE - post_sales_checkin:
- Count how many distinct questions the guest asked — answer every single one of them
- If they asked two things (e.g. check-in time AND WiFi password), give both answers in one reply
- Answer each question directly and briefly — do not pad with information they did not ask for
- Quick reference: check-in 2pm, check-out 11am, WiFi: Nistula@2024, caretaker available 8am–10pm`;

export async function draftCheckinReply(msg) {
  try {
    const systemPrompt = buildSystemPrompt(TYPE_PROMPT);
    return await callClaude(systemPrompt, msg);
  } catch (error) {
    throw new Error(`Check-in client error: ${error.message}`);
  }
}
