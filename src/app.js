import express from 'express';
import { randomUUID } from 'crypto';
import { config } from './config.js';
import { classifyQuery } from './services/classifier.js';
import { draftReply } from './services/claudeClient.js';
import { calculateConfidence, deriveAction } from './services/confidence.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { ValidationError } from './errors/AppError.js';
import { persistMessage } from './services/messageStore.js';

const ALLOWED_SOURCES = new Set(['whatsapp', 'booking_com', 'airbnb', 'instagram', 'direct']);

function validatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }

  const required = ['source', 'guest_name', 'message', 'timestamp', 'booking_ref', 'property_id'];
  const missing = required.filter((f) => !body[f] || typeof body[f] !== 'string' || !body[f].trim());
  if (missing.length) {
    throw new ValidationError(`Missing or empty required field(s): ${missing.join(', ')}`);
  }

  if (!ALLOWED_SOURCES.has(body.source)) {
    throw new ValidationError(
      `Invalid source "${body.source}". Allowed values: ${[...ALLOWED_SOURCES].join(', ')}`,
    );
  }

  if (Number.isNaN(Date.parse(body.timestamp))) {
    throw new ValidationError('Invalid timestamp — must be an ISO 8601 string');
  }
}

function normalizeMessage(body) {
  return {
    message_id: randomUUID(),
    source: body.source,
    guest_name: body.guest_name.trim(),
    message_text: body.message.trim(),
    timestamp: body.timestamp,
    booking_ref: body.booking_ref.trim(),
    property_id: body.property_id.trim(),
    query_type: classifyQuery(body.message),
  };
}

export function createApp() {
  const app = express();

  // Trust the first proxy so req.ip reflects the real client IP behind a load balancer
  app.set('trust proxy', 1);

  // ── Middleware stack (order matters) ──────────────────────────────────────
  app.use(securityHeaders);
  app.use(requestId);
  app.use(requestLogger);
  app.use(express.json({ limit: '64kb' }));
  app.use(createRateLimiter({ windowMs: 60_000, max: config.rateLimitPerMinute }));

  // ── Routes ────────────────────────────────────────────────────────────────
  app.post('/webhook/message', async (req, res, next) => {
    try {
      validatePayload(req.body);

      const normalizedMessage = normalizeMessage(req.body);
      const { draftedReply, usedFallback, claudeConfidence } = await draftReply(normalizedMessage);

      const confidenceScore = calculateConfidence({
        queryType: normalizedMessage.query_type,
        source: normalizedMessage.source,
        usedFallback,
        replyLength: draftedReply.length,
        claudeConfidence,
      });

      const action = deriveAction(confidenceScore, normalizedMessage.query_type);

      persistMessage({
        normalizedMessage,
        draftedReply,
        usedFallback,
        confidenceScore,
        action,
        rawPayload: req.body,
      }).catch((err) =>
        console.error(
          JSON.stringify({ type: 'db_persist_error', message: err.message, timestamp: new Date().toISOString() }),
        ),
      );

      return res.status(200).json({
        message_id: normalizedMessage.message_id,
        query_type: normalizedMessage.query_type,
        drafted_reply: draftedReply,
        confidence_score: confidenceScore,
        action,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  // ── Error handlers (must be last) ─────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
