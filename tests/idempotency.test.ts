import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db/index.js';

const request = supertest(app);

describe('Idempotency Key Handling', () => {
  let userToken: string;
  const testSessionId = 9100;
  const seqKey = `idem-seq-${Date.now()}`;
  const concurrentKey = `idem-concurrent-${Date.now()}`;

  beforeAll(async () => {
    const loginRes = await request.post('/login').send({ email: 'user1@example.com' });
    userToken = loginRes.body.token;

    await pool.query(`
      INSERT INTO sessions (id, title, instructor, starts_at, duration_minutes, capacity)
      VALUES 
        (9100, 'Idempotency Test Session', 'Prof X', '2026-11-01 10:00:00+00', 60, 5),
        (9101, 'Concurrent Idempotency Session', 'Prof X', '2026-11-02 10:00:00+00', 60, 5)
      ON CONFLICT (id) DO NOTHING;
    `);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM idempotency_keys WHERE key IN ($1, $2)', [seqKey, concurrentKey]);
    await pool.query('DELETE FROM bookings WHERE session_id IN (9100, 9101)');
    await pool.query('DELETE FROM sessions WHERE id IN (9100, 9101)');
  });

  it('should return 201 Created on sequential requests with same Idempotency-Key', async () => {
    const res1 = await request
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', seqKey)
      .send({ session_id: testSessionId });

    expect(res1.status).toBe(201);
    expect(res1.body.booking).toBeDefined();

    const res2 = await request
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', seqKey)
      .send({ session_id: testSessionId });

    expect(res2.status).toBe(201);
    expect(res2.body.booking).toBeDefined();
    expect(res2.body.booking.id).toBe(res1.body.booking.id);

    const dbRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM bookings WHERE session_id = $1 AND user_id = 1',
      [testSessionId]
    );
    expect(dbRes.rows[0].count).toBe(1);
  });

  it('should handle concurrent requests with the same Idempotency-Key and return 201 to all (no 409 duplicate error)', async () => {
    // Fire 5 concurrent requests with the exact same Idempotency-Key (simulating aggressive frontend double click or retry race)
    const promises = Array.from({ length: 5 }).map(() =>
      request
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', concurrentKey)
        .send({ session_id: 9101 })
    );

    const results = await Promise.all(promises);

    // All concurrent requests MUST receive 201 Created with the same response payload!
    results.forEach((res) => {
      expect(res.status).toBe(201);
      expect(res.body.booking).toBeDefined();
    });

    // Exactly 1 booking in database
    const dbRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM bookings WHERE session_id = 9101 AND user_id = 1'
    );
    expect(dbRes.rows[0].count).toBe(1);
  });
});
