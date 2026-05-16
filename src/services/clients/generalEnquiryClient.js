import { buildSystemPrompt, callClaude } from './baseClient.js';

const SYSTEM_PROMPT = buildSystemPrompt(`QUERY TYPE: general_enquiry

RESPONSE GUIDE:
- Answer the specific question asked using only facts from the property context
- If the answer is not covered in the context, say you will check and come back to them
- Do not give a generic property overview when they asked one specific question`);

export async function draftGeneralEnquiryReply(msg) {
  return callClaude(SYSTEM_PROMPT, msg);
}
