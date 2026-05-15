import express from 'express';
import { randomUUID } from 'crypto';
import { classifyQuery } from './services/classifier.js';
import { draftReply } from './services/claudeClient.js';
import { calculateConfidence, deriveAction } from './services/confidence.js';

const allowedSources = new Set(['whatsapp', 'booking_com', 'airbnb', 'instagram', 'direct']);

function validatePayload(payload) {
  const requiredFields = ['source', 'guest_name', 'message', 'timestamp', 'booking_ref', 'property_id'];
  const missing = requiredFields.filter((field) => !payload?.[field]);
  if (missing.length) {
    return `Missing required field(s): ${missing.join(', ')}`;
  }

  if (!allowedSources.has(payload.source)) {
    return 'Invalid source';
  }

  return null;
}

function normalizeMessage(payload) {
  return {
    message_id: randomUUID(),
    source: payload.source,
    guest_name: payload.guest_name,
    message_text: payload.message,
    timestamp: payload.timestamp,
    booking_ref: payload.booking_ref,
    property_id: payload.property_id,
    query_type: classifyQuery(payload.message),
  };
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/webhook/message', async (req, res) => {
    try {
      const validationError = validatePayload(req.body);
      if (validationError) {
        return res.status(400).json({
          error: validationError,
        });
      }

      const normalizedMessage = normalizeMessage(req.body);
      const { draftedReply, usedFallback } = await draftReply(normalizedMessage);
      const confidenceScore = calculateConfidence({
        queryType: normalizedMessage.query_type,
        source: normalizedMessage.source,
        usedFallback,
        complaint: normalizedMessage.query_type === 'complaint',
        parsedReply: draftedReply,
      });
      const action = deriveAction(confidenceScore, normalizedMessage.query_type);

      return res.status(200).json({
        message_id: normalizedMessage.message_id,
        query_type: normalizedMessage.query_type,
        drafted_reply: draftedReply,
        confidence_score: confidenceScore,
        action,
      });
    } catch (error) {
      return res.status(500).json({
        error: 'Failed to process guest message',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
