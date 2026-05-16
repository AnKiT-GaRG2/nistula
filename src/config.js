import dotenv from 'dotenv';

dotenv.config();

const anthropicApiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
const groqApiKey      = process.env.GROQ_API_KEY || '';
const geminiApiKey    = process.env.GEMINI_API_KEY || '';

if (!anthropicApiKey && !groqApiKey && !geminiApiKey) {
  console.warn(
    JSON.stringify({
      type: 'config_warning',
      message: 'No AI API keys set (ANTHROPIC_API_KEY, GROQ_API_KEY, GEMINI_API_KEY) — will use text fallback replies',
      timestamp: new Date().toISOString(),
    }),
  );
}

export const config = {
  port: Number(process.env.PORT || 3000),
  anthropicApiKey,
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
  groqApiKey,
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  geminiApiKey,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 60),
  databaseUrl: process.env.DATABASE_URL || '',
};
