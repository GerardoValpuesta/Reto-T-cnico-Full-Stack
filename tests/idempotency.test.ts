import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db/index.js';

const request = supertest(app);

describe('Idempotency Key Handling', () => {
  let userToken: string;
  const testSessionId = 9100;
  const idempotencyKey = `idem-test-key-${Date.now()}`;

  beforeAll(async () => {
    const loginRes = await request.post('/login').send({ email: 'user1@example.com' });
    userToken = loginRes.body.token;

    await pool.query(`
      INSERT INTO sessions (id, title, instructor, starts_at, duration_minutes, capacity)
      VALUES (9100, 'Idempotency Test Session', 'Prof X', '2026-11-01 10:00:00+00', 60, 5)
      ON CONFLICT (id) DO NOTHING;
    `);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM idempotency_keys WHERE key = $1', [idempotencyKey]);
    await pool.query('DELETE FROM bookings WHERE session_id = $1', [testSessionId]);
    await pool.query('DELETE FROM sessions WHERE id = $1', [testSessionId]);
  });

  it('should return 201 Created on the first request with Idempotency-Key', async () => {
    const res1 = await request
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ session_id: testSessionId });

    expect(res1.status).toBe(201);
    expect(res1.body.booking).toBeDefined();
  });

  it('should return the exact same 201 Created response on repeating request with same Idempotency-Key', async () => {
    const res2 = await request
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ session_id: testSessionId });

    expect(res2.status).toBe(201);
    expect(res2.body.booking).toBeDefined();

    // Verify only 1 booking row exists in the database
    const dbRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM bookings WHERE session_id = $1 AND user_id = 1',
      [testSessionId]
    );
    expect(dbRes.rows[0].count).toBe(1);
  });
});
