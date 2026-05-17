import { config } from '../config.js';
import { withRetry } from '../utils/retry.js';
import { extractText, parseClaudeResponse } from './clients/baseClient.js';

const LANGUAGE_DETECTION_PROMPT = `You are a language detection assistant.
Identify the language or languages used in the guest message.

Return strict JSON only with this shape:
{"primaryLanguage":"...","secondaryLanguages":["..."],"isMixed":true|false,"replyLanguage":"...","confidence":0.0}

Rules:
- If the message is written in one language only, set isMixed to false and secondaryLanguages to []
- If the message mixes languages, set isMixed to true and list all meaningful secondary languages
- replyLanguage should be the best language for drafting the reply
- Prefer the dominant language used by the guest
- If the message is heavily mixed, use English as replyLanguage unless another language clearly dominates
- Keep the JSON concise and do not add commentary`;

function heuristicLanguageProfile(messageText) {
  const text = String(messageText || '');
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);

  if (hasDevanagari && hasLatin) {
    return {
      primaryLanguage: 'Hindi',
      secondaryLanguages: ['English'],
      isMixed: true,
      replyLanguage: 'Hindi',
      confidence: 0.55,
    };
  }

  if (hasDevanagari) {
    return {
      primaryLanguage: 'Hindi',
      secondaryLanguages: [],
      isMixed: false,
      replyLanguage: 'Hindi',
      confidence: 0.8,
    };
  }

  return {
    primaryLanguage: 'English',
    secondaryLanguages: [],
    isMixed: false,
    replyLanguage: 'English',
    confidence: 0.7,
  };
}

async function callAnthropicLanguageDetection(messageText) {
  const response = await withRetry(
    () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.anthropicModel,
          max_tokens: 120,
          system: LANGUAGE_DETECTION_PROMPT,
          messages: [{ role: 'user', content: messageText }],
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
    },
    { maxAttempts: 2, baseDelayMs: 400 },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Anthropic language detection API ${response.status}: ${body.slice(0, 200)}`);
  }

  const parsed = parseClaudeResponse(extractText(await response.json()));
  if (!parsed?.reply) return null;

  try {
    const profile = JSON.parse(parsed.reply);
    if (!profile || typeof profile !== 'object') return null;
    return {
      primaryLanguage: profile.primaryLanguage || 'English',
      secondaryLanguages: Array.isArray(profile.secondaryLanguages) ? profile.secondaryLanguages.filter(Boolean) : [],
      isMixed: Boolean(profile.isMixed),
      replyLanguage: profile.replyLanguage || profile.primaryLanguage || 'English',
      confidence: typeof profile.confidence === 'number' ? profile.confidence : null,
    };
  } catch {
    return null;
  }
}

async function callGroqLanguageDetection(messageText) {
  const response = await withRetry(
    () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      return fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${config.groqApiKey}`,
        },
        body: JSON.stringify({
          model: config.groqModel,
          messages: [
            { role: 'system', content: LANGUAGE_DETECTION_PROMPT },
            { role: 'user', content: messageText },
          ],
          max_tokens: 120,
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
    },
    { maxAttempts: 2, baseDelayMs: 400 },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Groq language detection API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = parseClaudeResponse(content);
  if (!parsed?.reply) return null;

  try {
    const profile = JSON.parse(parsed.reply);
    if (!profile || typeof profile !== 'object') return null;
    return {
      primaryLanguage: profile.primaryLanguage || 'English',
      secondaryLanguages: Array.isArray(profile.secondaryLanguages) ? profile.secondaryLanguages.filter(Boolean) : [],
      isMixed: Boolean(profile.isMixed),
      replyLanguage: profile.replyLanguage || profile.primaryLanguage || 'English',
      confidence: typeof profile.confidence === 'number' ? profile.confidence : null,
    };
  } catch {
    return null;
  }
}

export async function detectLanguageProfile(messageText) {
  if (!String(messageText || '').trim()) {
    return heuristicLanguageProfile('');
  }

  try {
    if (config.anthropicApiKey) {
      const profile = await callAnthropicLanguageDetection(messageText);
      if (profile) return profile;
    }
  } catch {
    // fall through
  }

  try {
    if (config.groqApiKey) {
      const profile = await callGroqLanguageDetection(messageText);
      if (profile) return profile;
    }
  } catch {
    // fall through
  }

  return heuristicLanguageProfile(messageText);
}
