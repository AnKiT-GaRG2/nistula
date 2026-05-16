import { config } from '../../config.js';
import { buildUserContent, parseClaudeResponse } from './baseClient.js';
import { withRetry } from '../../utils/retry.js';

function extractGroqText(data) {
  return data?.choices?.[0]?.message?.content || '';
}

export async function callGroq(systemPrompt, msg, { maxTokens = 512, model = config.groqModel } = {}) {
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
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: buildUserContent(msg) },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
    },
    { maxAttempts: 2, baseDelayMs: 400 },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Groq API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = extractGroqText(data);
  console.log(JSON.stringify({ type: 'groq_raw_response', finish_reason: data?.choices?.[0]?.finish_reason, text: text.slice(0, 300), timestamp: new Date().toISOString() }));
  return parseClaudeResponse(text);
}
