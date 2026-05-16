import { config } from '../../config.js';
import { propertyContext } from '../../constants/propertyContext.js';
import { withRetry } from '../../utils/retry.js';

const COMMON_RULES = `STRICT RULES:
- Address the guest by first name only
- Keep every reply under 150 words
- Do not mention the property by name unless the guest asked about it by name
- Never mention AI, confidence scores, or internal systems
- Never give a generic reply that could apply to any guest message — be specific to what this person asked

CONFIDENCE GUIDE:
- 0.90–1.00: Factual query, precise answer exists in property context
- 0.75–0.89: Pricing calculation or availability — clear but requires arithmetic
- 0.60–0.74: Special request — holding reply, human must confirm details
- 0.40–0.59: Complaint — requires human empathy and judgement
- Below 0.40: Ambiguous or urgent, requires information not in context`;

export function buildSystemPrompt(typePrompt) {
  return `You are the guest communications assistant for Nistula, a luxury villa rental company in Goa, India.

You will receive a pre-classified guest message. Draft a reply that is warm, specific, and directly addresses what the guest actually asked.

OUTPUT FORMAT — strict JSON only, no markdown, no text outside the JSON:
{"drafted_reply": "...", "confidence": 0.00}

${typePrompt}

${COMMON_RULES}

PROPERTY CONTEXT:
${propertyContext}`;
}

export function buildUserContent(msg) {
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

export function extractText(data) {
  if (!Array.isArray(data?.content)) return '';
  return data.content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export function parseClaudeResponse(text) {
  if (!text) return null;

  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
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

export async function callClaude(systemPrompt, msg) {
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
          system: systemPrompt,
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
