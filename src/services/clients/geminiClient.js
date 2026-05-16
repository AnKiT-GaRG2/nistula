import { config } from '../../config.js';
import { buildUserContent, parseClaudeResponse } from './baseClient.js';
import { withRetry } from '../../utils/retry.js';

function extractGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function callGemini(systemPrompt, msg, { maxTokens = 512 } = {}) {
  const response = await withRetry(
    () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: buildUserContent(msg) }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
          }),
          signal: controller.signal,
        },
      ).finally(() => clearTimeout(timer));
    },
    { maxAttempts: 2, baseDelayMs: 400 },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini API ${response.status}: ${body.slice(0, 200)}`);
  }

  // Gemini returns plain text — we asked it for the same JSON format Claude uses,
  // so parseClaudeResponse handles it identically.
  return parseClaudeResponse(extractGeminiText(await response.json()));
}
