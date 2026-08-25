import { withTransaction, pool } from '../db/index.js';

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export interface CreateBookingParams {
  userId: number;
  sessionId: number;
  idempotencyKey?: string;
}

export async function createBooking({ userId, sessionId, idempotencyKey }: CreateBookingParams) {
  // 1. Fast-path check for idempotency key outside transaction (handles sequential retries)
  if (idempotencyKey) {
    const existing = await pool.query(
      'SELECT response_status, response_body FROM idempotency_keys WHERE key = $1 AND user_id = $2',
      [idempotencyKey, userId]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        status: row.response_status,
        body: row.response_body,
        fromCache: true,
      };
    }
  }

  // 2. Execute transactional booking with pessimistic lock
  const result = await withTransaction(async (client) => {
    // 2.1. Concurrency-safe check inside transaction (handles concurrent retries / double-clicks)
    if (idempotencyKey) {
      const existingInTx = await client.query(
        'SELECT response_status, response_body FROM idempotency_keys WHERE key = $1 AND user_id = $2',
        [idempotencyKey, userId]
      );

      if (existingInTx.rows.length > 0) {
        const row = existingInTx.rows[0];
        return {
          status: row.response_status,
          body: row.response_body,
          fromCache: true,
        };
      }
    }

    // 2.2. Lock session row pesimistically to prevent race conditions & overbooking
    const sessionRes = await client.query(
      `SELECT id, title, starts_at, duration_minutes, capacity 
       FROM sessions 
       WHERE id = $1 
       FOR UPDATE`,
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      throw new NotFoundError(`Session with ID ${sessionId} not found`);
    }

    const session = sessionRes.rows[0];

    // 2.3. Check if idempotency key was committed while waiting for session lock
    if (idempotencyKey) {
      const existingAfterLock = await client.query(
        'SELECT response_status, response_body FROM idempotency_keys WHERE key = $1 AND user_id = $2',
        [idempotencyKey, userId]
      );

      if (existingAfterLock.rows.length > 0) {
        const row = existingAfterLock.rows[0];
        return {
          status: row.response_status,
          body: row.response_body,
          fromCache: true,
        };
      }
    }

    // 2.4. Check capacity
    const countRes = await client.query(
      'SELECT COUNT(*)::int AS booked_seats FROM bookings WHERE session_id = $1',
      [sessionId]
    );
    const bookedSeats = countRes.rows[0].booked_seats;

    if (bookedSeats >= session.capacity) {
      throw new ConflictError('Session capacity reached (no available seats)');
    }

    // 2.5. Check duplicate booking for same user and session (without matching idempotency key)
    const duplicateRes = await client.query(
      'SELECT 1 FROM bookings WHERE session_id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (duplicateRes.rows.length > 0) {
      throw new ConflictError('User has already booked this session');
    }

    // 2.6. Check schedule overlap
    const newStart = new Date(session.starts_at);
    const newEnd = new Date(newStart.getTime() + session.duration_minutes * 60 * 1000);

    const overlapRes = await client.query(
      `SELECT s.id, s.title, s.starts_at, s.duration_minutes
       FROM bookings b
       JOIN sessions s ON b.session_id = s.id
       WHERE b.user_id = $1
         AND s.starts_at < $2
         AND (s.starts_at + (s.duration_minutes || ' minutes')::interval) > $3`,
      [userId, newEnd.toISOString(), newStart.toISOString()]
    );

    if (overlapRes.rows.length > 0) {
      const conflictingSession = overlapRes.rows[0];
      throw new ConflictError(
        `Schedule conflict: User is already booked for overlapping session "${conflictingSession.title}" (ID: ${conflictingSession.id})`
      );
    }

    // 2.7. Insert booking
    const insertRes = await client.query(
      'INSERT INTO bookings (session_id, user_id) VALUES ($1, $2) RETURNING id, created_at',
      [sessionId, userId]
    );

    const newBooking = {
      id: insertRes.rows[0].id,
      session_id: sessionId,
      user_id: userId,
      created_at: new Date(insertRes.rows[0].created_at).toISOString(),
    };

    const responsePayload = {
      message: 'Booking created successfully',
      booking: newBooking,
    };

    // 2.8. Save idempotency key if provided
    if (idempotencyKey) {
      await client.query(
        `INSERT INTO idempotency_keys (key, user_id, response_status, response_body)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO NOTHING`,
        [idempotencyKey, userId, 201, JSON.stringify(responsePayload)]
      );
    }

    return {
      status: 201,
      body: responsePayload,
      fromCache: false,
    };
  });

  return result;
}

export async function deleteBooking(bookingId: number, userId: number) {
  const bookingRes = await pool.query(
    `SELECT b.id, b.session_id, b.user_id, s.starts_at, s.title
     FROM bookings b
     JOIN sessions s ON b.session_id = s.id
     WHERE b.id = $1`,
    [bookingId]
  );

  if (bookingRes.rows.length === 0) {
    throw new NotFoundError(`Booking with ID ${bookingId} not found`);
  }

  const booking = bookingRes.rows[0];

  if (booking.user_id !== userId) {
    throw new ForbiddenError('You can only cancel your own bookings');
  }

  // 2-hour cancellation rule
  const sessionStart = new Date(booking.starts_at).getTime();
  const now = Date.now();
  const twoHoursInMs = 2 * 60 * 60 * 1000;

  if (sessionStart - now < twoHoursInMs) {
    throw new ValidationError('Bookings cannot be cancelled with less than 2 hours notice before session start');
  }

  await pool.query('DELETE FROM bookings WHERE id = $1', [bookingId]);

  return {
    message: `Booking ${bookingId} for session "${booking.title}" cancelled successfully`,
    cancelled_id: bookingId,
  };
}

export async function getUserBookings(userId: number) {
  const res = await pool.query(
    `SELECT b.id, b.created_at, s.id as session_id, s.title, s.instructor, s.starts_at, s.duration_minutes, s.capacity
     FROM bookings b
     JOIN sessions s ON b.session_id = s.id
     WHERE b.user_id = $1
     ORDER BY s.starts_at ASC`,
    [userId]
  );

  return res.rows.map((r) => ({
    id: r.id,
    session_id: r.session_id,
    title: r.title,
    instructor: r.instructor,
    starts_at: new Date(r.starts_at).toISOString(),
    duration_minutes: r.duration_minutes,
    capacity: r.capacity,
    created_at: new Date(r.created_at).toISOString(),
  }));
}
