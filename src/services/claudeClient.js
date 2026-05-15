import { config } from '../config.js';
import { propertyContext } from '../constants/propertyContext.js';
import { generateFallbackReply } from './fallbackReply.js';
import { withRetry } from '../utils/retry.js';

const SYSTEM_PROMPT = [
  "You are the guest messaging assistant for Nistula, a luxury villa rental company in Goa.",
  "Draft warm, professional, and concise replies to guest messages.",
  "Rules:",
  "- Address the guest by their first name only.",
  "- Answer exactly what is asked — do not volunteer unrelated information.",
  "- For availability/pricing queries, use only the numbers in the property context below.",
  "- For complaints, open with empathy and assure the team will follow up urgently.",
  "- For special requests, confirm receipt and state that the team will confirm details shortly.",
  "- Keep replies under 120 words.",
  "- Never mention confidence scores, AI, or internal systems.",
  "Return strict JSON only: {\"drafted_reply\": \"...\"}",
  "No markdown fences, no extra keys, no explanation outside the JSON.",
].join('\n');

function buildUserContent(normalizedMessage) {
  return [
    `Guest: ${normalizedMessage.guest_name}`,
    `Channel: ${normalizedMessage.source}`,
    `Query type: ${normalizedMessage.query_type}`,
    `Booking ref: ${normalizedMessage.booking_ref}`,
    `Property: ${normalizedMessage.property_id}`,
    ``,
    `Guest message:`,
    normalizedMessage.message_text,
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

function parseReply(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function callAnthropic(normalizedMessage) {
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
          max_tokens: 400,
          system: `${SYSTEM_PROMPT}\n\nProperty Context:\n${propertyContext}`,
          messages: [
            {
              role: 'user',
              content: buildUserContent(normalizedMessage),
            },
          ],
        }),
      }),
    { maxAttempts: 3, baseDelayMs: 600 },
  );

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const text = extractText(data);
  const parsed = parseReply(text);
  return parsed?.drafted_reply || text || '';
}

export async function draftReply(normalizedMessage) {
  if (!config.anthropicApiKey) {
    return { draftedReply: generateFallbackReply(normalizedMessage), usedFallback: true };
  }

  try {
    const draftedReply = await callAnthropic(normalizedMessage);
    if (draftedReply) {
      return { draftedReply, usedFallback: false };
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        type: 'claude_api_error',
        message: error?.message,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  return { draftedReply: generateFallbackReply(normalizedMessage), usedFallback: true };
}
