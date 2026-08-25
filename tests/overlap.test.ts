import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db/index.js';

const request = supertest(app);

describe('Schedule Overlap Validation', () => {
  let userToken: string;
  let userId: number = 1;

  beforeAll(async () => {
    // Login user 1
    const loginRes = await request.post('/login').send({ email: 'user1@example.com' });
    userToken = loginRes.body.token;

    // Clean bookings for user 1
    await pool.query('DELETE FROM bookings WHERE user_id = $1', [userId]);

    // Insert 4 test sessions specifically for overlap tests:
    // Base Session A: 2026-10-01 10:00 to 12:00 (starts_at: 10:00, duration: 120)
    // Overlapping Session B (Partial Start): 2026-10-01 09:00 to 10:30 (starts_at: 09:00, duration: 90)
    // Overlapping Session C (Partial End): 2026-10-01 11:30 to 13:00 (starts_at: 11:30, duration: 90)
    // Overlapping Session D (Complete Wrapping): 2026-10-01 08:00 to 14:00 (starts_at: 08:00, duration: 360)
    // Non-overlapping Session E: 2026-10-01 13:00 to 15:00 (starts_at: 13:00, duration: 120)

    await pool.query(`
      INSERT INTO sessions (id, title, instructor, starts_at, duration_minutes, capacity)
      VALUES 
        (9001, 'Base Session A', 'Prof X', '2026-10-01 10:00:00+00', 120, 10),
        (9002, 'Overlap Start B', 'Prof X', '2026-10-01 09:00:00+00', 90, 10),
        (9003, 'Overlap End C', 'Prof X', '2026-10-01 11:30:00+00', 90, 10),
        (9004, 'Wrapping Session D', 'Prof X', '2026-10-01 08:00:00+00', 360, 10),
        (9005, 'Non-overlapping Session E', 'Prof X', '2026-10-01 13:00:00+00', 120, 10)
      ON CONFLICT (id) DO UPDATE SET 
        starts_at = EXCLUDED.starts_at,
        duration_minutes = EXCLUDED.duration_minutes;
    `);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bookings WHERE session_id IN (9001, 9002, 9003, 9004, 9005)');
    await pool.query('DELETE FROM sessions WHERE id IN (9001, 9002, 9003, 9004, 9005)');
  });

  it('should allow booking the initial Base Session A', async () => {
    const res = await request
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ session_id: 9001 });

    expect(res.status).toBe(201);
    expect(res.body.booking).toBeDefined();
  });

  it('should reject Session B which partially overlaps at the start', async () => {
    const res = await request
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ session_id: 9002 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Schedule conflict/i);
  });

  it('should reject Session C which partially overlaps at the end', async () => {
    const res = await request
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ session_id: 9003 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Schedule conflict/i);
  });

  it('should reject Session D which completely wraps Session A', async () => {
    const res = await request
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ session_id: 9004 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Schedule conflict/i);
  });

  it('should allow booking Session E which starts right after Session A ends', async () => {
    const res = await request
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ session_id: 9005 });

    expect(res.status).toBe(201);
    expect(res.body.booking).toBeDefined();
  });
});
