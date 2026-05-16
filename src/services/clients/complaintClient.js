import { buildSystemPrompt, callClaude } from './baseClient.js';

export const TYPE_PROMPT = `RESPONSE GUIDE BY QUERY TYPE - complaint:
- Name the specific issue the guest raised — do not be vague
- Open with genuine empathy tied to their exact situation
- Assure the team is on it immediately
- Never minimise, deflect, or promise a refund`;

export async function draftComplaintReply(msg) {
  try {
    const systemPrompt = buildSystemPrompt(TYPE_PROMPT);
    return await callClaude(systemPrompt, msg);
  } catch (error) {
    throw new Error(`Complaint client error: ${error.message}`);
  }
}
