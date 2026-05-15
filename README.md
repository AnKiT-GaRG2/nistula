# Nistula Guest Message Handler

An Express backend that accepts inbound guest messages, normalises them, classifies the query type, drafts a reply using Claude, and returns a confidence-based action.

## Features

- POST endpoint at `/webhook/message`
- Unified message schema with generated UUIDs
- Query classification for:
  - `pre_sales_availability`
  - `pre_sales_pricing`
  - `post_sales_checkin`
  - `special_request`
  - `complaint`
  - `general_enquiry`
- Claude integration using `claude-sonnet-4-20250514`
- Graceful fallback reply generation when the API is unavailable
- Confidence scoring and action routing

## Setup

1. Install dependencies:
   - `npm install`
2. Copy `.env.example` to `.env`
3. Add your Anthropic API key:
   - `ANTHROPIC_API_KEY=...`
4. Start the server:
   - `npm start`

## Request format

POST `/webhook/message`

```json
{
  "source": "whatsapp",
  "guest_name": "Rahul Sharma",
  "message": "Is the villa available from April 20 to 24? What is the rate for 2 adults?",
  "timestamp": "2026-05-05T10:30:00Z",
  "booking_ref": "NIS-2024-0891",
  "property_id": "villa-b1"
}
```

## Response format

```json
{
  "message_id": "uuid",
  "query_type": "pre_sales_availability",
  "drafted_reply": "Hi Rahul! Great news...",
  "confidence_score": 0.91,
  "action": "auto_send"
}
```

## Confidence scoring

The score is a number between 0 and 1.

Logic used:

- Complaints always return `escalate`
- Higher confidence is given when the query is clearly classified and a drafted reply is available
- Claude-backed replies receive a small boost
- Fallback replies receive a penalty
- General or ambiguous enquiries score lower than direct availability or check-in questions

Action mapping:

- `auto_send` when confidence is above `0.85`
- `agent_review` when confidence is between `0.60` and `0.85`
- `escalate` when confidence is below `0.60` or the message is a complaint

## Testing

Run the built-in test script:

```bash
npm test
```

The script sends 3 different webhook inputs and verifies the responses.
