import { config } from '../config.js';
import { propertyContext } from '../constants/propertyContext.js';
import { generateFallbackReply } from './fallbackReply.js';

function extractTextFromAnthropicResponse(data) {
  if (!data || !Array.isArray(data.content)) {
    return '';
  }

  return data.content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function extractJsonObject(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function callAnthropic(normalizedMessage) {
  const systemPrompt = [
    'You are Nistula\'s guest messaging assistant.',
    'Use the property context to draft a concise, friendly, professional reply.',
    'Return strict JSON only with this shape: {"drafted_reply":"..."}.',
    'Do not include markdown, explanations, or extra keys.',
    'If the message is a complaint, acknowledge it and advise that the team will review it urgently.',
  ].join(' ');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 300,
      system: `${systemPrompt}\n\nProperty Context:\n${propertyContext}`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Normalize and reply to this guest message.\n\nNormalized message:\n${JSON.stringify(normalizedMessage, null, 2)}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const text = extractTextFromAnthropicResponse(data);
  const parsed = extractJsonObject(text);
  return parsed?.drafted_reply || text || '';
}

export async function draftReply(normalizedMessage) {
  if (!config.anthropicApiKey) {
    return {
      draftedReply: generateFallbackReply(normalizedMessage),
      usedFallback: true,
    };
  }

  try {
    const draftedReply = await callAnthropic(normalizedMessage);
    if (draftedReply) {
      return {
        draftedReply,
        usedFallback: false,
      };
    }
  } catch {
    // fall through to deterministic reply
  }

  return {
    draftedReply: generateFallbackReply(normalizedMessage),
    usedFallback: true,
  };
}
