/**
 * End-to-end test script for the /webhook/message endpoint.
 * Runs against a real (in-process) server instance so no external infrastructure is needed.
 * Uses only Node built-ins — no test framework dependency required.
 */
import { createApp } from '../src/app.js';

const PASS = '\x1b[32m✔\x1b[0m';
const FAIL = '\x1b[31m✖\x1b[0m';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function post(baseUrl, path, body) {
  const start = Date.now();
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data, durationMs: Date.now() - start };
}

// ── Test cases ────────────────────────────────────────────────────────────────

const HAPPY_PATH_CASES = [
  {
    label: 'pre_sales_availability — WhatsApp combined availability + pricing query',
    payload: {
      source: 'whatsapp',
      guest_name: 'Rahul Sharma',
      message: 'Is the villa available from April 20 to 24? What is the rate for 2 adults?',
      timestamp: '2026-05-05T10:30:00Z',
      booking_ref: 'NIS-2024-0891',
      property_id: 'villa-b1',
    },
    expectedQueryType: 'pre_sales_availability',
    expectedAction: (a) => ['auto_send', 'agent_review'].includes(a),
  },
  {
    label: 'post_sales_checkin — Airbnb check-in and WiFi enquiry',
    payload: {
      source: 'airbnb',
      guest_name: 'Meera Iyer',
      message: 'What time can we check in and what is the WiFi password?',
      timestamp: '2026-05-05T11:00:00Z',
      booking_ref: 'NIS-2024-0900',
      property_id: 'villa-b1',
    },
    expectedQueryType: 'post_sales_checkin',
    // With Claude: score ≈ 0.97 → auto_send. Without API key (fallback): score = 0.85 → agent_review
    expectedAction: (a) => ['auto_send', 'agent_review'].includes(a),
  },
  {
    label: 'complaint — Direct channel maintenance complaint',
    payload: {
      source: 'direct',
      guest_name: 'Arjun Mehta',
      message: 'The AC is not working and I am not happy.',
      timestamp: '2026-05-05T11:30:00Z',
      booking_ref: 'NIS-2024-0910',
      property_id: 'villa-b1',
    },
    expectedQueryType: 'complaint',
    expectedAction: (a) => a === 'escalate',
  },
  {
    label: 'pre_sales_pricing — Booking.com per-night rate enquiry',
    payload: {
      source: 'booking_com',
      guest_name: 'Priya Nair',
      message: 'What is the nightly rate for 4 guests for 5 nights in June?',
      timestamp: '2026-05-05T12:00:00Z',
      booking_ref: 'NIS-2024-0920',
      property_id: 'villa-b1',
    },
    expectedQueryType: 'pre_sales_pricing',
    expectedAction: (a) => ['auto_send', 'agent_review'].includes(a),
  },
  {
    label: 'special_request — Instagram airport transfer request',
    payload: {
      source: 'instagram',
      guest_name: 'Karan Verma',
      message: 'Can you arrange an airport transfer for us on arrival?',
      timestamp: '2026-05-05T12:30:00Z',
      booking_ref: 'NIS-2024-0930',
      property_id: 'villa-b1',
    },
    expectedQueryType: 'special_request',
    expectedAction: (a) => ['auto_send', 'agent_review'].includes(a),
  },
  {
    label: 'general_enquiry — Pet policy question',
    payload: {
      source: 'direct',
      guest_name: 'Anjali Singh',
      message: 'Do you allow pets at the villa?',
      timestamp: '2026-05-05T13:00:00Z',
      booking_ref: 'NIS-2024-0940',
      property_id: 'villa-b1',
    },
    expectedQueryType: 'general_enquiry',
    expectedAction: (a) => ['auto_send', 'agent_review'].includes(a),
  },
];

const ERROR_CASES = [
  {
    label: '400 — missing required fields',
    payload: { source: 'whatsapp' },
    expectedStatus: 400,
  },
  {
    label: '400 — invalid source channel',
    payload: {
      source: 'fax',
      guest_name: 'Test User',
      message: 'Hello',
      timestamp: '2026-05-05T10:00:00Z',
      booking_ref: 'NIS-2024-0001',
      property_id: 'villa-b1',
    },
    expectedStatus: 400,
  },
  {
    label: '400 — invalid timestamp format',
    payload: {
      source: 'direct',
      guest_name: 'Test User',
      message: 'Hello',
      timestamp: 'not-a-date',
      booking_ref: 'NIS-2024-0001',
      property_id: 'villa-b1',
    },
    expectedStatus: 400,
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

async function main() {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`\nRunning tests against ephemeral server on port ${port}\n`);

  // Happy-path cases
  console.log('── Happy-path cases ─────────────────────────────────────────────');
  for (const tc of HAPPY_PATH_CASES) {
    console.log(`\n${tc.label}`);
    const { status, data, durationMs } = await post(baseUrl, '/webhook/message', tc.payload);

    check('HTTP 200', status === 200, `got ${status}`);
    check('has message_id (UUID)', /^[0-9a-f-]{36}$/.test(data.message_id));
    check(`query_type = ${tc.expectedQueryType}`, data.query_type === tc.expectedQueryType, `got "${data.query_type}"`);
    check('drafted_reply is a non-empty string', typeof data.drafted_reply === 'string' && data.drafted_reply.length > 0);
    check('confidence_score in [0,1]', typeof data.confidence_score === 'number' && data.confidence_score >= 0 && data.confidence_score <= 1, `got ${data.confidence_score}`);
    check('action is valid', tc.expectedAction(data.action), `got "${data.action}"`);
    check(`responded in < 15s`, durationMs < 15_000, `${durationMs}ms`);

    console.log(`  ℹ  confidence=${data.confidence_score}  action=${data.action}  reply="${data.drafted_reply.slice(0, 60)}…"`);
  }

  // Error cases
  console.log('\n── Error cases ──────────────────────────────────────────────────');
  for (const tc of ERROR_CASES) {
    console.log(`\n${tc.label}`);
    const { status, data } = await post(baseUrl, '/webhook/message', tc.payload);
    check(`HTTP ${tc.expectedStatus}`, status === tc.expectedStatus, `got ${status}`);
    check('error field present', typeof data.error === 'string', JSON.stringify(data));
  }

  // Health check
  console.log('\n── Health check ─────────────────────────────────────────────────');
  const healthRes = await fetch(`${baseUrl}/health`);
  const healthData = await healthRes.json();
  check('GET /health returns 200', healthRes.status === 200);
  check('status = ok', healthData.status === 'ok');

  // 404 handling
  console.log('\n── 404 handling ─────────────────────────────────────────────────');
  const notFoundRes = await fetch(`${baseUrl}/does-not-exist`, { method: 'POST' });
  check('unknown route returns 404', notFoundRes.status === 404);

  server.close();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('─'.repeat(60));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
