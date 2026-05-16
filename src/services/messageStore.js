import { getPool } from './db.js';
import { config } from '../config.js';

export async function getConversationHistory(bookingRef, limit = 2) {
  const pool = getPool();
  if (!pool) return [];

  try {
    const result = await pool.query(
      `SELECT m.direction, m.message_text AS text
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN guests g ON g.id = c.guest_id
       WHERE g.metadata->>'booking_ref' = $1
       ORDER BY m.sent_at DESC
       LIMIT $2`,
      [bookingRef, limit],
    );
    return result.rows;
  } catch {
    return [];
  }
}

function mapActionToDispatchStatus(action) {
  if (action === 'auto_send') return 'auto_sent';
  if (action === 'escalate') return 'escalated';
  return null; // agent_review = pending, not yet dispatched
}

export async function persistMessage({ normalizedMessage, draftedReply, usedFallback, confidenceScore, action, rawPayload }) {
  const pool = getPool();
  if (!pool) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure property row exists (placeholder until real data is seeded)
    await client.query(
      `INSERT INTO properties (id, name, location, bedrooms, max_guests, base_rate_inr)
       VALUES ($1, $1, 'Unknown', 1, 2, 0)
       ON CONFLICT (id) DO NOTHING`,
      [normalizedMessage.property_id],
    );

    // Find or create guest by booking_ref stored in metadata
    let guestId;
    const guestLookup = await client.query(
      `SELECT id FROM guests WHERE metadata->>'booking_ref' = $1 LIMIT 1`,
      [normalizedMessage.booking_ref],
    );
    if (guestLookup.rows.length) {
      guestId = guestLookup.rows[0].id;
    } else {
      const guestInsert = await client.query(
        `INSERT INTO guests (full_name, metadata) VALUES ($1, $2::jsonb) RETURNING id`,
        [normalizedMessage.guest_name, JSON.stringify({ booking_ref: normalizedMessage.booking_ref })],
      );
      guestId = guestInsert.rows[0].id;
    }

    // Find or create an open conversation for this guest + property + channel
    let conversationId;
    const convLookup = await client.query(
      `SELECT id FROM conversations
       WHERE guest_id = $1 AND property_id = $2 AND channel = $3 AND status = 'open'
       LIMIT 1`,
      [guestId, normalizedMessage.property_id, normalizedMessage.source],
    );
    if (convLookup.rows.length) {
      conversationId = convLookup.rows[0].id;
    } else {
      const convInsert = await client.query(
        `INSERT INTO conversations (guest_id, property_id, channel) VALUES ($1, $2, $3) RETURNING id`,
        [guestId, normalizedMessage.property_id, normalizedMessage.source],
      );
      conversationId = convInsert.rows[0].id;
    }

    // Insert the inbound message with AI draft info
    await client.query(
      `INSERT INTO messages (
         id, conversation_id, direction, source_channel, message_text, sent_at,
         query_type, ai_model, ai_drafted_reply, ai_confidence_score,
         dispatch_status, raw_payload
       ) VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        normalizedMessage.message_id,
        conversationId,
        normalizedMessage.source,
        normalizedMessage.message_text,
        normalizedMessage.timestamp,
        normalizedMessage.query_type,
        usedFallback ? null : config.anthropicModel,
        draftedReply,
        confidenceScore,
        mapActionToDispatchStatus(action),
        JSON.stringify(rawPayload),
      ],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
