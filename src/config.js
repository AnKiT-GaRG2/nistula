import dotenv from 'dotenv';

dotenv.config();

const anthropicApiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';

if (!anthropicApiKey) {
  console.warn(
    JSON.stringify({
      type: 'config_warning',
      message: 'ANTHROPIC_API_KEY / CLAUDE_API_KEY is not set — will use deterministic fallback replies',
      timestamp: new Date().toISOString(),
    }),
  );
}

export const config = {
  port: Number(process.env.PORT || 3000),
  anthropicApiKey,
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 60),
  databaseUrl: process.env.DATABASE_URL || '',
};
