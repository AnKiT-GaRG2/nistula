import { config } from '../../config.js';
import { propertyContext } from '../../constants/propertyContext.js';
import { withRetry } from '../../utils/retry.js';

// ── Feature 2: Channel-aware tone ─────────────────────────────────────────────
// The AI picks the emoji itself based on context — no hardcoded suggestions.
// Emoji must appear inside the drafted_reply text; it is parsed out with the reply.
const CHANNEL_TONE = {
  whatsapp:    'Casual and warm. End your reply with a single emoji that genuinely fits the specific context and emotion of this message.',
  airbnb:      'Warm and conversational. End your reply with a single emoji that fits the tone of this specific message.',
  instagram:   'Relaxed, friendly, and brief. End your reply with one or two emoji that naturally fit the mood of this specific message.',
  booking_com: 'Warm but professionally structured. Do not include any emoji in your reply.',
  direct:      'Professional and warm. Do not include any emoji in your reply.',
};

// ── Feature 4: Ban bot-speak ──────────────────────────────────────────────────
const FORBIDDEN_PHRASES = `FORBIDDEN — never use these phrases, they make replies feel robotic:
"please be assured", "kindly note", "as per your message", "as per your request",
"I hope this helps", "feel free to reach out", "do not hesitate to contact us",
"please find enclosed", "please note that", "we regret to inform you",
"this is to inform you", "hope you understand", "we request you to",
"thank you for reaching out", "we value your feedback"`;

// ── Feature 5: Specificity rule ───────────────────────────────────────────────
const SPECIFICITY_RULE = `SPECIFICITY: Reference one concrete detail from the guest's message beyond just their name.
If they mention an occasion ("our anniversary"), a date, a number of guests, or a specific concern —
weave it naturally into your reply so they know you actually read their message. Never give a reply
that could have been sent to any guest.`;

const COMMON_RULES = `STRICT RULES:
- Address the guest by first name only
- Keep every reply under 150 words
- If the guest asked more than one question, answer all of them — never silently skip one
- Do not mention the property by name unless the guest explicitly asked about it by name
- Never mention AI, confidence scores, or internal systems

${SPECIFICITY_RULE}

${FORBIDDEN_PHRASES}

CONFIDENCE GUIDE:
- 0.90–1.00: Factual query, precise answer exists in property context
- 0.75–0.89: Pricing calculation or availability — clear but requires arithmetic
- 0.60–0.74: Special request — holding reply, human must confirm details
- 0.40–0.59: Complaint — requires human empathy and judgement
- Below 0.40: Ambiguous or urgent, requires information not in context`;

function isUrgentTone(tone) {
  return String(tone || '').startsWith('urgent');
}

function buildLanguageGuidance(languageProfile) {
  const replyLanguage = String(languageProfile?.replyLanguage || languageProfile?.primaryLanguage || 'English');
  const secondaryLanguages = Array.isArray(languageProfile?.secondaryLanguages)
    ? languageProfile.secondaryLanguages.filter(Boolean)
    : [];

  if (replyLanguage.toLowerCase() === 'english' && secondaryLanguages.length === 0) {
    return 'Reply in English.';
  }

  if (languageProfile?.isMixed) {
    const otherLanguages = secondaryLanguages.length ? ` (${secondaryLanguages.join(', ')})` : '';
    return `Reply in ${replyLanguage}${otherLanguages}. The guest used multiple languages, so keep the answer natural and code-mixed only where it feels natural. Prefer the dominant language for the main reply.`;
  }

  return `Reply in ${replyLanguage}.`;
}

// ── Feature 1: Persona ────────────────────────────────────────────────────────
export function buildSystemPrompt(typePrompt, languageProfile = null) {
  return `You are Priya, guest relations specialist at Nistula, a boutique villa company in Goa, India.

You know Villa B1 in Assagao personally — you have walked its rooms, swum in its pool, and you genuinely love the place.
You speak the way a warm, knowledgeable friend would: direct, specific, never stiff or corporate.
You are not a chatbot or a front desk — you are a person who cares whether this guest has a great stay.

Draft a reply that directly addresses what the guest actually asked. Do not pad it.

LANGUAGE RULE:
${buildLanguageGuidance(languageProfile)}

OUTPUT FORMAT — strict JSON only, no markdown, no text outside the JSON:
{"drafted_reply": "...", "confidence": 0.00}

${typePrompt}

${COMMON_RULES}

PROPERTY CONTEXT:
${propertyContext}`;
}

// For messages that span multiple query types, combine the individual TYPE_PROMPTs
// into a single instruction block so Claude answers every topic in one reply.
export function buildCombinedSystemPrompt(typePrompts, languageProfile = null) {
  const numbered = typePrompts
    .map((p, i) => `TOPIC ${i + 1}:\n${p}`)
    .join('\n\n');

  const combinedTypePrompt = `The guest has asked about MULTIPLE topics in one message. You must address every one of them.

${numbered}

Write a single, natural reply that covers all topics in flowing sentences. Do not use numbered lists or headings.`;

  return buildSystemPrompt(combinedTypePrompt, languageProfile);
}

// ── Feature 3: Mirror guest energy ───────────────────────────────────────────
export function detectGuestTone(messageText) {
  const text = String(messageText || '');

  if (/\b(urgent|emergency|immediately|right now|asap|unacceptable|terrible|horrible|disgusting|not happy|furious|3\s*am|no hot water|no power|no electricity|no signal)\b/i.test(text))
    return 'urgent and distressed — respond with calm, direct empathy; drop all cheerfulness and exclamation marks';

  if (/\b(excited|can'?t wait|looking forward|amazing|perfect|sounds great|wonderful|so happy|love it)\b/i.test(text))
    return 'excited and enthusiastic — match their energy with genuine warmth';

  if (/\b(please|could you|would it be possible|if that'?s okay|would appreciate|may i)\b/i.test(text))
    return 'polite and measured — reply warmly but respect their considered tone';

  return 'neutral — warm and natural';
}

export function buildUserContent(msg) {
  const tone = detectGuestTone(msg.message_text);
  const channelTone = CHANNEL_TONE[msg.source] ?? CHANNEL_TONE.direct;
  const languageProfile = msg.languageProfile ?? {};

  // Urgent guests override the channel emoji rule — no emoji when someone is distressed
  const effectiveChannelTone = tone.startsWith('urgent')
    ? channelTone.replace(/\. End your reply with[\s\S]*/i, '. Do not include any emoji in your reply.')
    : channelTone;

  const lines = [
    `Guest name: ${msg.guest_name}`,
    `Channel: ${msg.source}`,
    `Channel tone guide: ${effectiveChannelTone}`,
    `Query type: ${msg.query_type}`,
    `Booking ref: ${msg.booking_ref}`,
    `Property: ${msg.property_id}`,
    `Sent at: ${msg.timestamp}`,
    `Guest tone: ${tone}`,
    `Language profile: ${JSON.stringify(languageProfile)}`,
  ];

  // ── Feature 6: Conversation threading ────────────────────────────────────
  if (msg.conversationHistory?.length) {
    lines.push('', 'PRIOR CONVERSATION (most recent first):');
    msg.conversationHistory.forEach(({ direction, text }, i) => {
      const speaker = direction === 'inbound' ? 'Guest' : 'Nistula';
      lines.push(`  [${i + 1}] ${speaker}: ${text}`);
    });
    lines.push('', 'Reply naturally as if continuing this conversation — no need to re-introduce yourself.');
  }

  lines.push('', 'Guest message:', msg.message_text);

  return lines.join('\n');
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

  const replyCandidates = [
    obj?.drafted_reply,
    obj?.draftedReply,
    obj?.reply,
  ];

  const reply = replyCandidates.find((value) => typeof value === 'string' && value.trim())?.trim();

  if (reply) {
    const rawConfidence = obj?.confidence;
    const confidence =
      typeof rawConfidence === 'number' && rawConfidence >= 0 && rawConfidence <= 1
        ? rawConfidence
        : null;

    return { reply, confidence };
  }

  const cleaned = String(text)
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  if (!cleaned) return null;

  return { reply: cleaned, confidence: null };
}

export async function callClaude(systemPrompt, msg, { maxTokens = 512 } = {}) {
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
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: buildUserContent(msg) }],
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
    },
    { maxAttempts: 3, baseDelayMs: 600 },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 200)}`);
  }

  return parseClaudeResponse(extractText(await response.json()));
}
