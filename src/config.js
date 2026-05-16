import dotenv from 'dotenv';

dotenv.config();

const anthropicApiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
const groqApiKey      = process.env.GROQ_API_KEY || '';

if (!anthropicApiKey && !groqApiKey) {
  console.warn(
    JSON.stringify({
      type: 'config_warning',
      message: 'No AI API keys set (ANTHROPIC_API_KEY, GROQ_API_KEY) — will use text fallback replies',
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
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 60),
  rateLimitPerSecond: Number(process.env.RATE_LIMIT_PER_SECOND || 5),
  rateLimitCooldownSeconds: Number(process.env.RATE_LIMIT_COOLDOWN_SECONDS || 10),
  databaseUrl: process.env.DATABASE_URL || '',
};
