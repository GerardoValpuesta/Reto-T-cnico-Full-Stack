import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db/index.js';

const request = supertest(app);

describe('Concurrency Overbooking Protection Suite', () => {
  const sessionId = 9500;
  const capacity = 5;
  const concurrentUsers = 30;
  let userTokens: string[] = [];

  beforeAll(async () => {
    // 1. Create a session with limited capacity of 5
    await pool.query(`
      INSERT INTO sessions (id, title, instructor, starts_at, duration_minutes, capacity)
      VALUES (9500, 'Vitest Concurrency Challenge', 'Profesor X', '2026-12-01 10:00:00+00', 60, 5)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Clean any prior bookings for session 9500
    await pool.query('DELETE FROM bookings WHERE session_id = 9500');

    // 2. Fetch JWT tokens for 30 distinct users (from the seeded 100 users)
    for (let i = 1; i <= concurrentUsers; i++) {
      const loginRes = await request.post('/login').send({ email: `user${i}@example.com` });
      userTokens.push(loginRes.body.token);
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bookings WHERE session_id = 9500');
    await pool.query('DELETE FROM sessions WHERE id = 9500');
  });

  it('should guarantee ZERO overbooking when 30 concurrent users compete for 5 seats (5 x 201, 25 x 409, 0 x 500)', async () => {
    // Launch 30 concurrent booking requests
    const promises = userTokens.map((token) =>
      request
        .post('/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({ session_id: sessionId })
    );

    const responses = await Promise.all(promises);

    let count201 = 0;
    let count409 = 0;
    let count500 = 0;

    responses.forEach((res) => {
      if (res.status === 201) count201++;
      else if (res.status === 409) count409++;
      else if (res.status >= 500) count500++;
    });

    // Assert status distribution
    expect(count201).toBe(capacity); // Exactly 5
    expect(count409).toBe(concurrentUsers - capacity); // Exactly 25
    expect(count500).toBe(0); // Zero internal server errors

    // Verify database count
    const dbRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM bookings WHERE session_id = $1',
      [sessionId]
    );
    expect(dbRes.rows[0].count).toBe(capacity);
  });
});
