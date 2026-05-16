import { buildSystemPrompt, callClaude } from './baseClient.js';

const TYPE_PROMPT = `RESPONSE GUIDE BY QUERY TYPE - general_enquiry:
- Answer the specific question asked using only facts from the property context
- If the answer is not covered in the context, say you will check and come back to them
- Do not give a generic property overview when they asked one specific question`;

export async function draftGeneralEnquiryReply(msg) {
  try {
    const systemPrompt = buildSystemPrompt(TYPE_PROMPT);
    return await callClaude(systemPrompt, msg);
  } catch (error) {
    throw new Error(`General enquiry client error: ${error.message}`);
  }
}
