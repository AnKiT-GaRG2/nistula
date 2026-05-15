import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Properties ─────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO properties (id, name, location, bedrooms, max_guests, has_pool,
        check_in_time, check_out_time, base_rate_inr, extra_guest_rate, amenities)
      VALUES
        ('villa-b1', 'Villa B1', 'Assagao, North Goa', 3, 6, TRUE, '14:00', '11:00',
         18000, 2000,
         '{"wifi_password":"Nistula@2024","caretaker_hours":"8am-10pm","chef_on_call":true,"pool_heating":false,"parking":true,"smoking_allowed":false}'::jsonb),
        ('villa-c2', 'Villa C2', 'Anjuna, North Goa', 4, 8, TRUE, '14:00', '11:00',
         24000, 2500,
         '{"wifi_password":"Nistula@C2x9","caretaker_hours":"8am-10pm","chef_on_call":true,"pool_heating":true,"parking":true,"smoking_allowed":false}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `);

    // ── Staff ──────────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO staff (name, email, role)
      VALUES
        ('Rohan Desai',  'rohan@nistula.com',  'manager'),
        ('Sneha Patil',  'sneha@nistula.com',  'agent'),
        ('Dev Kulkarni', 'dev@nistula.com',    'agent'),
        ('Ananya Joshi', 'ananya@nistula.com', 'admin')
      ON CONFLICT (email) DO NOTHING
    `);

    const { rows: staffRows } = await client.query(
      `SELECT id FROM staff WHERE role = 'agent' LIMIT 1`,
    );
    const agentId = staffRows[0]?.id ?? null;

    // ── Guests ─────────────────────────────────────────────────────────────────
    const guestDefs = [
      { name: 'Rahul Sharma',  phone: '+919876543210', email: 'rahul.sharma@gmail.com',  ref: 'NIS-2024-0891' },
      { name: 'Meera Iyer',    airbnb: 'airbnb_m_iyer', bdc: 'meerai_bdc', email: 'meera.iyer@gmail.com',   ref: 'NIS-2024-0900' },
      { name: 'Arjun Mehta',   phone: '+919812345678', email: 'arjun.mehta@gmail.com',  ref: 'NIS-2024-0910' },
      { name: 'Priya Nair',    bdc: 'priyanair_bdc',   email: 'priya.nair@gmail.com',   ref: 'NIS-2024-0920' },
      { name: 'Karan Verma',   ig: 'karan_verma_ig',   email: 'karan.verma@gmail.com',  ref: 'NIS-2024-0930' },
      { name: 'Anjali Singh',  phone: '+918899001122', email: 'anjali.singh@gmail.com', ref: 'NIS-2024-0940' },
    ];

    for (const g of guestDefs) {
      await client.query(
        `INSERT INTO guests (full_name, phone_whatsapp, airbnb_id, booking_com_id, instagram_id, email, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
         ON CONFLICT DO NOTHING`,
        [g.name, g.phone ?? null, g.airbnb ?? null, g.bdc ?? null, g.ig ?? null,
         g.email, JSON.stringify({ booking_ref: g.ref })],
      );
    }

    const { rows: guests } = await client.query(
      `SELECT id, full_name FROM guests WHERE metadata->>'booking_ref' = ANY($1)`,
      [guestDefs.map((g) => g.ref)],
    );
    const gId = Object.fromEntries(guests.map((g) => [g.full_name, g.id]));

    // ── Reservations ───────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO reservations (id, guest_id, property_id, check_in, check_out, guest_count, total_inr, status, source_channel)
      VALUES
        ('NIS-2024-0891', $1, 'villa-b1', '2026-04-20', '2026-04-24', 2,  76000, 'confirmed',  'whatsapp'),
        ('NIS-2024-0900', $2, 'villa-b1', '2026-05-10', '2026-05-14', 4,  80000, 'confirmed',  'airbnb'),
        ('NIS-2024-0910', $3, 'villa-b1', '2026-05-01', '2026-05-05', 3,  78000, 'checked_in', 'direct'),
        ('NIS-2024-0920', $4, 'villa-b1', '2026-06-15', '2026-06-20', 4, 100000, 'pending',    'booking_com'),
        ('NIS-2024-0930', $5, 'villa-c2', '2026-07-04', '2026-07-08', 5, 112500, 'confirmed',  'instagram'),
        ('NIS-2024-0940', $6, 'villa-b1', '2026-08-12', '2026-08-16', 2,  72000, 'pending',    'direct')
      ON CONFLICT (id) DO NOTHING
    `, [gId['Rahul Sharma'], gId['Meera Iyer'], gId['Arjun Mehta'], gId['Priya Nair'], gId['Karan Verma'], gId['Anjali Singh']]);

    // ── Conversations ──────────────────────────────────────────────────────────
    const convDefs = [
      { guest: 'Rahul Sharma', res: 'NIS-2024-0891', prop: 'villa-b1', ch: 'whatsapp',    status: 'open'     },
      { guest: 'Meera Iyer',   res: 'NIS-2024-0900', prop: 'villa-b1', ch: 'airbnb',      status: 'resolved' },
      { guest: 'Arjun Mehta',  res: 'NIS-2024-0910', prop: 'villa-b1', ch: 'direct',      status: 'escalated'},
      { guest: 'Priya Nair',   res: 'NIS-2024-0920', prop: 'villa-b1', ch: 'booking_com', status: 'open'     },
      { guest: 'Karan Verma',  res: 'NIS-2024-0930', prop: 'villa-c2', ch: 'instagram',   status: 'open'     },
      { guest: 'Anjali Singh', res: 'NIS-2024-0940', prop: 'villa-b1', ch: 'direct',      status: 'open'     },
    ];

    for (const c of convDefs) {
      await client.query(
        `INSERT INTO conversations (guest_id, reservation_id, property_id, channel, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [gId[c.guest], c.res, c.prop, c.ch, c.status],
      );
    }

    // fetch conversation IDs keyed by guest_id
    const { rows: convRows } = await client.query(
      `SELECT id, guest_id FROM conversations WHERE guest_id = ANY($1)`,
      [Object.values(gId)],
    );
    const convByGuest = Object.fromEntries(convRows.map((c) => [c.guest_id, c.id]));

    const cId = (name) => convByGuest[gId[name]];

    // ── Messages ───────────────────────────────────────────────────────────────
    const messages = [
      // Rahul — availability query, auto_sent
      [cId('Rahul Sharma'), 'inbound', 'whatsapp',
       'Is the villa available from April 20 to 24? What is the rate for 2 adults?',
       '2026-05-05T10:30:00Z', 'pre_sales_availability', 'claude-sonnet-4-20250514',
       'Hi Rahul! Villa B1 is available April 20–24. For 2 guests the rate is ₹18,000/night, totalling ₹72,000 for 4 nights. Shall I hold the dates for you?',
       0.92, 'auto_sent', null, '2026-05-05T10:30:05Z',
       { source:'whatsapp', guest_name:'Rahul Sharma', booking_ref:'NIS-2024-0891', property_id:'villa-b1' }],

      [cId('Rahul Sharma'), 'outbound', 'whatsapp',
       'Hi Rahul! Villa B1 is available April 20–24. For 2 guests the rate is ₹18,000/night, totalling ₹72,000 for 4 nights. Shall I hold the dates for you?',
       '2026-05-05T10:30:05Z', null, null, null, null, null, null, null, null],

      // Meera — check-in + wifi, auto_sent
      [cId('Meera Iyer'), 'inbound', 'airbnb',
       'What time can we check in and what is the WiFi password?',
       '2026-05-05T11:00:00Z', 'post_sales_checkin', 'claude-sonnet-4-20250514',
       'Hi Meera! Check-in is from 2pm. The WiFi password is Nistula@2024. See you on the 10th!',
       0.97, 'auto_sent', null, '2026-05-05T11:00:04Z',
       { source:'airbnb', guest_name:'Meera Iyer', booking_ref:'NIS-2024-0900', property_id:'villa-b1' }],

      [cId('Meera Iyer'), 'outbound', 'airbnb',
       'Hi Meera! Check-in is from 2pm. The WiFi password is Nistula@2024. See you on the 10th!',
       '2026-05-05T11:00:04Z', null, null, null, null, null, null, null, null],

      // Arjun — complaint, escalated + agent reviewed
      [cId('Arjun Mehta'), 'inbound', 'direct',
       'The AC is not working and I am not happy.',
       '2026-05-05T11:30:00Z', 'complaint', 'claude-sonnet-4-20250514',
       'Hi Arjun, we are truly sorry about this. Our team has been alerted and will reach you within 30 minutes to resolve the AC issue.',
       0.40, 'escalated', agentId, '2026-05-05T11:45:00Z',
       { source:'direct', guest_name:'Arjun Mehta', booking_ref:'NIS-2024-0910', property_id:'villa-b1' }],

      // Priya — pricing, pending agent review
      [cId('Priya Nair'), 'inbound', 'booking_com',
       'What is the nightly rate for 4 guests for 5 nights in June?',
       '2026-05-05T12:00:00Z', 'pre_sales_pricing', 'claude-sonnet-4-20250514',
       'Hi Priya! For 4 guests at Villa B1 in June the rate is ₹18,000/night, so 5 nights comes to ₹90,000. Would you like to confirm the booking?',
       0.87, null, null, null,
       { source:'booking_com', guest_name:'Priya Nair', booking_ref:'NIS-2024-0920', property_id:'villa-b1' }],

      // Karan — special request, pending agent review
      [cId('Karan Verma'), 'inbound', 'instagram',
       'Can you arrange an airport transfer for us on arrival?',
       '2026-05-05T12:30:00Z', 'special_request', 'claude-sonnet-4-20250514',
       'Hi Karan! We have received your airport transfer request. Our team will confirm the details and availability with you shortly.',
       0.73, null, null, null,
       { source:'instagram', guest_name:'Karan Verma', booking_ref:'NIS-2024-0930', property_id:'villa-c2' }],

      // Anjali — general enquiry, auto_sent
      [cId('Anjali Singh'), 'inbound', 'direct',
       'Do you allow pets at the villa?',
       '2026-05-05T13:00:00Z', 'general_enquiry', 'claude-sonnet-4-20250514',
       'Hi Anjali! Unfortunately Villa B1 does not allow pets. If you have any other questions about your stay feel free to ask!',
       0.76, 'auto_sent', null, '2026-05-05T13:00:03Z',
       { source:'direct', guest_name:'Anjali Singh', booking_ref:'NIS-2024-0940', property_id:'villa-b1' }],

      [cId('Anjali Singh'), 'outbound', 'direct',
       'Hi Anjali! Unfortunately Villa B1 does not allow pets. If you have any other questions about your stay feel free to ask!',
       '2026-05-05T13:00:03Z', null, null, null, null, null, null, null, null],
    ];

    for (const m of messages) {
      const [convId, direction, channel, text, sentAt, queryType, aiModel, aiReply,
             confidence, dispatchStatus, reviewedBy, dispatchedAt, rawPayload] = m;
      await client.query(
        `INSERT INTO messages (
           conversation_id, direction, source_channel, message_text, sent_at,
           query_type, ai_model, ai_drafted_reply, ai_confidence_score,
           dispatch_status, reviewed_by, dispatched_at, raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
        [convId, direction, channel, text, sentAt, queryType, aiModel, aiReply,
         confidence, dispatchStatus, reviewedBy, dispatchedAt,
         rawPayload ? JSON.stringify(rawPayload) : null],
      );
    }

    await client.query('COMMIT');
    console.log('Seed complete — 2 properties, 4 staff, 6 guests, 6 reservations, 6 conversations, 9 messages.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
