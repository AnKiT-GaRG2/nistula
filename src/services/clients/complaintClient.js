import { buildSystemPrompt, callClaude } from './baseClient.js';

const SYSTEM_PROMPT = buildSystemPrompt(`QUERY TYPE: complaint

RESPONSE GUIDE:
- Name the specific issue the guest raised — do not be vague
- Open with genuine empathy tied to their exact situation
- Assure the team is on it immediately
- Never minimise, deflect, or promise a refund`);

export async function draftComplaintReply(msg) {
  return callClaude(SYSTEM_PROMPT, msg);
}
