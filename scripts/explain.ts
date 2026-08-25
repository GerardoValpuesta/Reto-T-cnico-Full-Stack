import { pool } from '../src/db/index.js';

async function runExplain() {
  const sql = `
    EXPLAIN ANALYZE
    SELECT 
      s.id,
      s.title,
      s.instructor,
      s.starts_at,
      s.duration_minutes,
      s.capacity,
      (SELECT COUNT(*)::int FROM bookings b WHERE b.session_id = s.id) AS booked_seats,
      (s.capacity - (SELECT COUNT(*)::int FROM bookings b WHERE b.session_id = s.id)) AS available_seats
    FROM sessions s
    WHERE s.starts_at >= '2026-06-01T00:00:00.000Z'
      AND (s.capacity - (SELECT COUNT(*)::int FROM bookings b WHERE b.session_id = s.id)) > 0
    ORDER BY s.starts_at DESC, s.id DESC
    LIMIT 20;
  `;

  try {
    const res = await pool.query(sql);
    console.log('=== EXPLAIN ANALYZE RESULT ===\n');
    res.rows.forEach((r) => console.log(r['QUERY PLAN']));
  } catch (err) {
    console.error('Error running EXPLAIN ANALYZE:', err);
  } finally {
    await pool.end();
  }
}

runExplain();
