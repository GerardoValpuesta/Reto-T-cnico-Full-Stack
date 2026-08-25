import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db/index.js';

const request = supertest(app);

describe('DELETE /bookings/:id Cancellation Rules', () => {
  let user1Token: string;
  let user2Token: string;
  let futureBookingId: number;
  let soonBookingId: number;

  beforeAll(async () => {
    const l1 = await request.post('/login').send({ email: 'user1@example.com' });
    user1Token = l1.body.token;

    const l2 = await request.post('/login').send({ email: 'user2@example.com' });
    user2Token = l2.body.token;

    // Session 9200 starts in 24 hours (allowed to cancel)
    const futureDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    // Session 9201 starts in 30 minutes (NOT allowed to cancel, < 2 hours)
    const soonDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await pool.query(`
      INSERT INTO sessions (id, title, instructor, starts_at, duration_minutes, capacity)
      VALUES 
        (9200, 'Future Session', 'Prof X', '${futureDate}', 60, 10),
        (9201, 'Imminent Session', 'Prof X', '${soonDate}', 60, 10)
      ON CONFLICT (id) DO UPDATE SET starts_at = EXCLUDED.starts_at;
    `);

    // Create bookings for user 1
    const b1 = await request
      .post('/bookings')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ session_id: 9200 });
    futureBookingId = b1.body.booking.id;

    const b2 = await request
      .post('/bookings')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ session_id: 9201 });
    soonBookingId = b2.body.booking.id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bookings WHERE session_id IN (9200, 9201)');
    await pool.query('DELETE FROM sessions WHERE id IN (9200, 9201)');
  });

  it('should prevent User 2 from cancelling User 1 booking (403 Forbidden)', async () => {
    const res = await request
      .delete(`/bookings/${futureBookingId}`)
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only cancel your own/i);
  });

  it('should prevent cancellation if session starts in less than 2 hours (422 Unprocessable)', async () => {
    const res = await request
      .delete(`/bookings/${soonBookingId}`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/less than 2 hours notice/i);
  });

  it('should successfully cancel booking if session starts in > 2 hours', async () => {
    const res = await request
      .delete(`/bookings/${futureBookingId}`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.cancelled_id).toBe(futureBookingId);
  });
});
