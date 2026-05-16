import { config } from '../config.js';
import { propertyContext } from '../constants/propertyContext.js';
import { generateFallbackReply } from './fallbackReply.js';
import { withRetry } from '../utils/retry.js';

const SYSTEM_PROMPT = `You are the guest communications assistant for Nistula, a luxury villa rental company in Goa, India.

You will receive a pre-classified guest message. Use the query_type field to guide how you respond.

OUTPUT FORMAT — strict JSON only, no markdown, no text outside the JSON:
{"drafted_reply": "...", "confidence": 0.00}

REPLY RULES:
- Address the guest by their first name only
- Answer exactly what is asked — do not volunteer unrelated information
- pre_sales_availability: confirm or deny availability for the dates mentioned and state the nightly rate
- pre_sales_pricing: give a clear cost breakdown — base rate plus extra-guest charges multiplied by the number of nights
- post_sales_checkin: answer precisely from the property facts (check-in time, WiFi password, check-out time, etc.)
- special_request: warmly confirm receipt and tell the guest the team will follow up shortly to confirm the arrangement
- complaint: open with genuine empathy, assure the team is addressing it urgently, never promise a refund
- general_enquiry: answer the specific question using property facts; if not covered, offer to help further
- Keep every reply under 150 words
- Write warmly and naturally — not stiff or corporate
- Never mention AI, confidence scores, or internal systems to the guest

CONFIDENCE GUIDE — set your confidence based on this scale:
- 0.90–1.00: Factual query with a precise answer directly in the property context (check-in time, WiFi, confirmed availability)
- 0.75–0.89: Pricing calculation or standard pre-booking query — clear but involves numbers
- 0.60–0.74: Special request or general enquiry — helpful reply but human follow-through is needed
- 0.40–0.59: Complaint or message requiring human empathy and judgement
- Below 0.40: Ambiguous or urgent message, or requires information not in the property context`;

function buildUserContent(msg) {
  return [
    `Guest name: ${msg.guest_name}`,
    `Channel: ${msg.source}`,
    `Query type: ${msg.query_type}`,
    `Booking ref: ${msg.booking_ref}`,
    `Property: ${msg.property_id}`,
    `Sent at: ${msg.timestamp}`,
    '',
    'Guest message:',
    msg.message_text,
  ].join('\n');
}

function extractText(data) {
  if (!Array.isArray(data?.content)) return '';
  return data.content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function parseClaudeResponse(text) {
  if (!text) return null;

  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    // Claude occasionally wraps JSON in markdown fences despite instructions
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      obj = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  const reply = typeof obj?.drafted_reply === 'string' ? obj.drafted_reply.trim() : '';
  if (!reply) return null;

  const rawConfidence = obj?.confidence;
  const confidence =
    typeof rawConfidence === 'number' && rawConfidence >= 0 && rawConfidence <= 1
      ? rawConfidence
      : null;

  return { reply, confidence };
}

async function callAnthropic(msg) {
  const response = await withRetry(
    () =>
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.anthropicModel,
          max_tokens: 512,
          system: `${SYSTEM_PROMPT}\n\nPROPERTY CONTEXT:\n${propertyContext}`,
          messages: [{ role: 'user', content: buildUserContent(msg) }],
        }),
      }),
    { maxAttempts: 3, baseDelayMs: 600 },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 200)}`);
  }

  return parseClaudeResponse(extractText(await response.json()));
}

export async function draftReply(normalizedMessage) {
  if (!config.anthropicApiKey) {
    return { draftedReply: generateFallbackReply(normalizedMessage), usedFallback: true, claudeConfidence: null };
  }

  try {
    const result = await callAnthropic(normalizedMessage);
    if (result) {
      return { draftedReply: result.reply, usedFallback: false, claudeConfidence: result.confidence };
    }
  } catch (error) {
    console.error(
      JSON.stringify({ type: 'claude_api_error', message: error?.message, timestamp: new Date().toISOString() }),
    );
  }

  return { draftedReply: generateFallbackReply(normalizedMessage), usedFallback: true, claudeConfidence: null };
}
