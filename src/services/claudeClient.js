import { config } from '../config.js';
import { generateFallbackReply } from './fallbackReply.js';
import { buildSystemPrompt, buildCombinedSystemPrompt, callClaude } from './clients/baseClient.js';
import { callGroq } from './clients/groqClient.js';
import { detectLanguageProfile } from './languageDetection.js';
import { TYPE_PROMPT as availabilityPrompt }   from './clients/availabilityClient.js';
import { TYPE_PROMPT as pricingPrompt }         from './clients/pricingClient.js';
import { TYPE_PROMPT as checkinPrompt }         from './clients/checkinClient.js';
import { TYPE_PROMPT as specialRequestPrompt }  from './clients/specialRequestClient.js';
import { TYPE_PROMPT as complaintPrompt }       from './clients/complaintClient.js';
import { TYPE_PROMPT as generalEnquiryPrompt }  from './clients/generalEnquiryClient.js';

// ── System-prompt registry ───────────────────────────────────────────────────
const TYPE_PROMPT_MAP = {
  pre_sales_availability: availabilityPrompt,
  pre_sales_pricing:      pricingPrompt,
  post_sales_checkin:     checkinPrompt,
  special_request:        specialRequestPrompt,
  complaint:              complaintPrompt,
  general_enquiry:        generalEnquiryPrompt,
};

// ── Per-type token budgets ───────────────────────────────────────────────────
// Sized to the actual reply length needed — avoids over-spending on output tokens
const QUERY_CONFIG = {
  post_sales_checkin:     { maxTokens: 150 },
  pre_sales_availability: { maxTokens: 180 },
  general_enquiry:        { maxTokens: 180 },
  pre_sales_pricing:      { maxTokens: 200 },
  special_request:        { maxTokens: 220 },
  complaint:              { maxTokens: 250 },
};

const DEFAULT_CONFIG = { maxTokens: 180 };

// Fixed provider sequence for all query types
const GROQ_70B    = 'llama-3.3-70b-versatile';
const PROVIDERS   = ['claude', 'groq-70b'];

// ── Helpers ──────────────────────────────────────────────────────────────────
function resolveConfig(normalizedMessage) {
  const types = normalizedMessage.query_types ?? [normalizedMessage.query_type];
  const configs = types.map((t) => QUERY_CONFIG[t] ?? DEFAULT_CONFIG);
  // Multi-type: use the largest token budget across all matched types
  const maxTokens = Math.max(...configs.map((c) => c.maxTokens));
  return { maxTokens };
}

function getSystemPromptForMessage(normalizedMessage) {
  if (normalizedMessage.query_types?.length > 1) {
    const prompts = normalizedMessage.query_types.map((t) => TYPE_PROMPT_MAP[t]).filter(Boolean);
    return buildCombinedSystemPrompt(prompts, normalizedMessage.languageProfile);
  }
  return buildSystemPrompt(TYPE_PROMPT_MAP[normalizedMessage.query_type] ?? generalEnquiryPrompt, normalizedMessage.languageProfile);
}

function isProviderAvailable(provider) {
  if (provider === 'groq-70b') return Boolean(config.groqApiKey);
  if (provider === 'claude')   return Boolean(config.anthropicApiKey);
  return false;
}

function providerLabel(provider) {
  return { 'groq-70b': 'groq', claude: 'claude' }[provider] ?? provider;
}

async function callProvider(provider, systemPrompt, msg, maxTokens) {
  switch (provider) {
    case 'groq-70b': return callGroq(systemPrompt, msg, { maxTokens, model: GROQ_70B });
    case 'claude':   return callClaude(systemPrompt, msg, { maxTokens });
  }
}

function log(type, extra = {}) {
  console.log(JSON.stringify({ type, timestamp: new Date().toISOString(), ...extra }));
}

// ── Main entry point ─────────────────────────────────────────────────────────
export async function draftReply(normalizedMessage) {
  normalizedMessage.languageProfile = await detectLanguageProfile(normalizedMessage.message_text);

  const { maxTokens } = resolveConfig(normalizedMessage);
  const systemPrompt = getSystemPromptForMessage(normalizedMessage);

  log('draft_reply_start', {
    query_type:  normalizedMessage.query_type,
    query_types: normalizedMessage.query_types,
    source:      normalizedMessage.source,
    booking_ref: normalizedMessage.booking_ref,
    max_tokens:  maxTokens,
    language_profile: normalizedMessage.languageProfile,
  });

  for (const provider of PROVIDERS) {
    const label = providerLabel(provider);

    if (!isProviderAvailable(provider)) {
      log(`${label}_skip`, { reason: 'API key not set', query_type: normalizedMessage.query_type });
      continue;
    }

    try {
      log(`${label}_attempt`, { query_type: normalizedMessage.query_type, max_tokens: maxTokens });
      const result = await callProvider(provider, systemPrompt, normalizedMessage, maxTokens);
      if (result) {
        log('draft_reply_result', {
          reply_source: label,
          query_type:   normalizedMessage.query_type,
          max_tokens:   maxTokens,
          confidence:   result.confidence,
        });
        return { draftedReply: result.reply, usedFallback: false, replySource: label, claudeConfidence: result.confidence };
      }
      log(`${label}_empty_response`, { query_type: normalizedMessage.query_type });
    } catch (err) {
      log(`${label}_api_error`, { message: err?.message?.slice(0, 200) });
    }
  }

  // ── Text fallback ────────────────────────────────────────────────────────────
  const draftedReply = generateFallbackReply(normalizedMessage);
  log('draft_reply_result', { reply_source: 'fallback', query_type: normalizedMessage.query_type });
  return { draftedReply, usedFallback: true, replySource: 'fallback', claudeConfidence: null };
}
