-- =============================================================================
-- Nistula Unified Messaging Platform — PostgreSQL Schema
-- =============================================================================
-- Design principles:
--   • Every table has a surrogate UUID primary key (no exposed sequences).
--   • All timestamps are TIMESTAMPTZ so daylight-saving boundaries never corrupt data.
--   • CHECK constraints enforce domain rules at the DB layer — the app layer
--     validates first, but the DB is the final safety net.
--   • JSONB columns (metadata, raw_payload) capture channel-specific fields
--     without requiring schema migrations for every new integration.
--   • Indexes target the three main read patterns: guest lookup, conversation
--     timeline, and inbound-message review queue.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Prerequisites
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Utility: auto-update updated_at on every write
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. GUESTS
--    One canonical row per guest, regardless of how many channels they use.
--    Channel-specific identifiers are stored as nullable UNIQUE columns so a
--    guest who contacts us via both WhatsApp and Airbnb can eventually be
--    linked into a single row by a staff member or identity-resolution job.
-- =============================================================================
CREATE TABLE guests (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name           TEXT        NOT NULL,

    -- Channel identifiers (each nullable; UNIQUE enforced when populated)
    email               TEXT        UNIQUE,
    phone_whatsapp      TEXT        UNIQUE,
    airbnb_id           TEXT        UNIQUE,
    booking_com_id      TEXT        UNIQUE,
    instagram_id        TEXT        UNIQUE,

    -- Optional enrichment stored as arbitrary key-value pairs
    metadata            JSONB       NOT NULL DEFAULT '{}',

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER guests_updated_at
    BEFORE UPDATE ON guests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Full-text search on guest name (useful for staff search UI)
CREATE INDEX idx_guests_full_name ON guests USING GIN (to_tsvector('english', full_name));

-- =============================================================================
-- 2. PROPERTIES
--    Each lettable unit. Rate rules and amenities stored in JSONB so new
--    properties with non-standard pricing don't require a schema change.
-- =============================================================================
CREATE TABLE properties (
    id                  TEXT        PRIMARY KEY,   -- human-readable, e.g. 'villa-b1'
    name                TEXT        NOT NULL,
    location            TEXT        NOT NULL,
    bedrooms            SMALLINT    NOT NULL CHECK (bedrooms > 0),
    max_guests          SMALLINT    NOT NULL CHECK (max_guests > 0),
    has_pool            BOOLEAN     NOT NULL DEFAULT FALSE,
    check_in_time       TIME        NOT NULL DEFAULT '14:00',
    check_out_time      TIME        NOT NULL DEFAULT '11:00',
    base_rate_inr       NUMERIC(12, 2) NOT NULL CHECK (base_rate_inr >= 0),
    extra_guest_rate    NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (extra_guest_rate >= 0),

    -- Flexible amenity data: WiFi password, caretaker hours, chef availability, etc.
    amenities           JSONB       NOT NULL DEFAULT '{}',

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER properties_updated_at
    BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 3. STAFF
--    Internal users who review, edit, and approve AI-drafted replies.
-- =============================================================================
CREATE TABLE staff (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL UNIQUE,
    role        TEXT        NOT NULL DEFAULT 'agent',
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_role CHECK (role IN ('agent', 'manager', 'admin'))
);

CREATE TRIGGER staff_updated_at
    BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 4. RESERVATIONS
--    A confirmed or pending booking linking a guest to a property.
--    The id uses the existing Nistula format (e.g. NIS-2024-0891) so it can be
--    matched directly against booking reference numbers in inbound messages.
-- =============================================================================
CREATE TABLE reservations (
    id              TEXT        PRIMARY KEY,   -- e.g. 'NIS-2024-0891'
    guest_id        UUID        NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,
    property_id     TEXT        NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    check_in        DATE        NOT NULL,
    check_out       DATE        NOT NULL,
    guest_count     SMALLINT    NOT NULL CHECK (guest_count > 0),
    total_inr       NUMERIC(12, 2),
    status          TEXT        NOT NULL DEFAULT 'pending',
    source_channel  TEXT        NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_dates   CHECK (check_out > check_in),
    CONSTRAINT valid_status  CHECK (status IN ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled')),
    CONSTRAINT valid_channel CHECK (source_channel IN ('whatsapp', 'booking_com', 'airbnb', 'instagram', 'direct'))
);

CREATE TRIGGER reservations_updated_at
    BEFORE UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_reservations_guest    ON reservations(guest_id);
CREATE INDEX idx_reservations_property ON reservations(property_id, check_in);
CREATE INDEX idx_reservations_status   ON reservations(status) WHERE status NOT IN ('checked_out', 'cancelled');

-- =============================================================================
-- 5. CONVERSATIONS
--    Groups related messages into a thread. A conversation belongs to one
--    guest and one channel. It may or may not be linked to a reservation
--    (pre-sales enquiries have no reservation_id yet).
-- =============================================================================
CREATE TABLE conversations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id        UUID        NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,
    reservation_id  TEXT        REFERENCES reservations(id) ON DELETE SET NULL,
    property_id     TEXT        NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    channel         TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'open',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_channel CHECK (channel IN ('whatsapp', 'booking_com', 'airbnb', 'instagram', 'direct')),
    CONSTRAINT valid_status  CHECK (status IN ('open', 'resolved', 'escalated'))
);

CREATE TRIGGER conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_conversations_guest    ON conversations(guest_id);
CREATE INDEX idx_conversations_property ON conversations(property_id, created_at DESC);
CREATE INDEX idx_conversations_open     ON conversations(status, updated_at DESC) WHERE status = 'open';

-- =============================================================================
-- 6. MESSAGES
--    Every inbound and outbound message across all channels, in one table.
--
--    AI fields are only populated for inbound messages:
--      query_type          — classified intent
--      ai_model            — which model produced the draft
--      ai_drafted_reply    — the raw Claude output
--      ai_confidence_score — 0.00–1.00 from our scoring logic
--
--    Dispatch fields track what happened to the drafted reply:
--      dispatch_status     — how the reply was handled
--      final_reply         — the text that was actually sent (may differ from ai_drafted_reply
--                            if an agent edited it)
--      reviewed_by         — staff member who touched the message
--      dispatched_at       — when the reply was sent
--
--    raw_payload stores the original webhook body for auditability and replay.
-- =============================================================================
CREATE TABLE messages (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID        NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,

    direction           TEXT        NOT NULL,
    source_channel      TEXT        NOT NULL,
    message_text        TEXT        NOT NULL,
    sent_at             TIMESTAMPTZ NOT NULL,

    -- AI classification and drafting (inbound only)
    query_type          TEXT,
    ai_model            TEXT,
    ai_drafted_reply    TEXT,
    ai_confidence_score NUMERIC(4, 3),

    -- Dispatch tracking
    dispatch_status     TEXT,
    final_reply         TEXT,
    reviewed_by         UUID        REFERENCES staff(id) ON DELETE SET NULL,
    dispatched_at       TIMESTAMPTZ,

    -- Original webhook payload for audit / replay
    raw_payload         JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_direction  CHECK (direction IN ('inbound', 'outbound')),
    CONSTRAINT valid_channel    CHECK (source_channel IN ('whatsapp', 'booking_com', 'airbnb', 'instagram', 'direct')),
    CONSTRAINT valid_query_type CHECK (
        query_type IS NULL OR query_type IN (
            'pre_sales_availability',
            'pre_sales_pricing',
            'post_sales_checkin',
            'special_request',
            'complaint',
            'general_enquiry'
        )
    ),
    CONSTRAINT valid_dispatch   CHECK (
        dispatch_status IS NULL OR dispatch_status IN (
            'auto_sent', 'agent_approved', 'agent_edited', 'escalated', 'discarded'
        )
    ),
    CONSTRAINT valid_confidence CHECK (
        ai_confidence_score IS NULL OR (ai_confidence_score >= 0 AND ai_confidence_score <= 1)
    )
);

CREATE TRIGGER messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at ASC);
CREATE INDEX idx_messages_sent_at      ON messages(sent_at DESC);

-- Partial index: find inbound messages awaiting agent review efficiently
CREATE INDEX idx_messages_pending_review
    ON messages(ai_confidence_score DESC, created_at ASC)
    WHERE direction = 'inbound'
      AND dispatch_status IS NULL;

-- =============================================================================
-- DESIGN DECISIONS
-- =============================================================================
--
-- 1. GUEST IDENTITY ACROSS CHANNELS (hardest decision)
--    A guest on WhatsApp (+91-9876…) and the same person on Airbnb ("Rahul S.")
--    have no guaranteed shared identifier. Three options were considered:
--
--    a) Require email as canonical key — fails for WhatsApp-only guests.
--    b) Fuzzy-match on name + contact — fragile; false positives create data
--       corruption that is hard to undo.
--    c) Late-binding / merge model — create one row per channel contact,
--       allow staff (or a future ML job) to merge rows explicitly.
--
--    Choice: option (c) implemented as nullable UNIQUE columns on `guests`.
--    A guest who contacts on two channels starts as two rows. Staff or an
--    async resolver sets both identifiers on one row and removes the other.
--    This avoids premature merges while keeping a clean single-record model
--    once identity is confirmed.
--
-- 2. AI DRAFT FIELDS ON `messages`, NOT A SEPARATE TABLE
--    Keeping the draft alongside the message row avoids a JOIN on every
--    message read and simplifies audit queries ("show me everything about
--    this message"). The fields are nullable so outbound/human messages are
--    unaffected. If draft history (multiple revisions) becomes a requirement,
--    a separate `message_drafts` table can be added without touching this schema.
--
-- 3. `raw_payload JSONB` FOR REPLAY AND AUDIT
--    Storing the original webhook body means we can re-process any message
--    (e.g. after a classifier bug fix) without asking the source channel to
--    re-send. It also provides a full audit trail for compliance without
--    building a separate event log table.
--
-- 4. CONVERSATIONS AS A FIRST-CLASS ENTITY
--    Grouping messages into conversations allows the UI to show a thread view
--    and lets us track escalation state at the conversation level. A message
--    without a prior conversation (first contact from a new guest) creates a
--    new conversation row at insert time — either in the application layer or
--    via a before-insert trigger added when that logic is formalised.
--
-- =============================================================================
