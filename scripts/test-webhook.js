import assert from 'assert/strict';
import { createApp } from '../src/app.js';

async function main() {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const inputs = [
    {
      source: 'whatsapp',
      guest_name: 'Rahul Sharma',
      message: 'Is the villa available from April 20 to 24? What is the rate for 2 adults?',
      timestamp: '2026-05-05T10:30:00Z',
      booking_ref: 'NIS-2024-0891',
      property_id: 'villa-b1',
      expectedQueryType: 'pre_sales_availability',
    },
    {
      source: 'airbnb',
      guest_name: 'Meera Iyer',
      message: 'What time can we check in and what is the WiFi password?',
      timestamp: '2026-05-05T11:00:00Z',
      booking_ref: 'NIS-2024-0900',
      property_id: 'villa-b1',
      expectedQueryType: 'post_sales_checkin',
    },
    {
      source: 'direct',
      guest_name: 'Arjun Mehta',
      message: 'The AC is not working and I am not happy.',
      timestamp: '2026-05-05T11:30:00Z',
      booking_ref: 'NIS-2024-0910',
      property_id: 'villa-b1',
      expectedQueryType: 'complaint',
    },
  ];

  for (const [index, payload] of inputs.entries()) {
    const response = await fetch(`${baseUrl}/webhook/message`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    assert.equal(response.status, 200, `Request ${index + 1} should succeed`);
    assert.equal(data.query_type, payload.expectedQueryType, `Request ${index + 1} should classify correctly`);
    assert.equal(typeof data.message_id, 'string');
    assert.equal(typeof data.drafted_reply, 'string');
    assert.equal(typeof data.confidence_score, 'number');
    assert.equal(typeof data.action, 'string');
  }

  const invalidResponse = await fetch(`${baseUrl}/webhook/message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'fax' }),
  });
  assert.equal(invalidResponse.status, 400);

  server.close();
  console.log('All webhook tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
