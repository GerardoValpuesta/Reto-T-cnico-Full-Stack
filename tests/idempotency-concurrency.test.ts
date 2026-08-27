import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db/index.js';

const request = supertest(app);

describe('Concurrent Idempotency Key Handling (Check-Lock-Recheck)', () => {
  let userToken: string;
  const testSessionId = 9200;
  const concurrentKey = `idem-concurrent-burst-${Date.now()}`;

  beforeAll(async () => {
    const loginRes = await request.post('/login').send({ email: 'user1@example.com' });
    userToken = loginRes.body.token;

    await pool.query('DELETE FROM idempotency_keys WHERE key = $1', [concurrentKey]);
    await pool.query('DELETE FROM bookings WHERE session_id = 9200');
    await pool.query('DELETE FROM sessions WHERE id = 9200');

    await pool.query(`
      INSERT INTO sessions (id, title, instructor, starts_at, duration_minutes, capacity)
      VALUES (9200, 'Concurrent Idempotency Test Workshop', 'Prof Y', '2026-12-01 10:00:00+00', 60, 5);
    `);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM idempotency_keys WHERE key = $1', [concurrentKey]);
    await pool.query('DELETE FROM bookings WHERE session_id = 9200');
    await pool.query('DELETE FROM sessions WHERE id = 9200');
  });

  it('should handle 10 simultaneous requests with the exact same Idempotency-Key without 409 conflict errors', async () => {
    // Fire 10 concurrent HTTP requests with identical Idempotency-Key
    const promises = Array.from({ length: 10 }).map(() =>
      request
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', concurrentKey)
        .send({ session_id: testSessionId })
    );

    const results = await Promise.all(promises);

    // All 10 requests MUST receive 201 Created and return the exact same booking ID
    results.forEach((res) => {
      expect(res.status).toBe(201);
      expect(res.body.booking).toBeDefined();
    });

    const firstBookingId = results[0].body.booking.id;
    results.forEach((res) => {
      expect(res.body.booking.id).toBe(firstBookingId);
    });

    // Verify in database that EXACTLY 1 booking was created
    const dbRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM bookings WHERE session_id = $1 AND user_id = 1',
      [testSessionId]
    );
    expect(dbRes.rows[0].count).toBe(1);
  });
});
