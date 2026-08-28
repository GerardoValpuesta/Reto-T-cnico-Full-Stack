import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

// Reset bookings for a session (used by UI Test Runner)
router.post('/api/test/reset-session', async (req, res) => {
  try {
    const sessionId = req.body.session_id ? parseInt(req.body.session_id, 10) : 42;
    await pool.query('DELETE FROM bookings WHERE session_id = $1', [sessionId]);
    res.status(200).json({ message: `Bookings for session ${sessionId} reset successfully`, session_id: sessionId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Setup overlapping sessions for UI Test Runner
router.post('/api/test/setup-overlap', async (req, res) => {
  try {
    const userId = req.body.user_id ? parseInt(req.body.user_id, 10) : 1;
    await pool.query('DELETE FROM bookings WHERE session_id IN (9001, 9002) AND user_id = $1', [userId]);
    await pool.query(`
      INSERT INTO sessions (id, title, instructor, starts_at, duration_minutes, capacity)
      VALUES 
        (9001, 'Taller Base A (10:00 - 12:00)', 'Prof X', '2026-10-01 10:00:00+00', 120, 10),
        (9002, 'Taller Solapado B (09:00 - 10:30)', 'Prof Y', '2026-10-01 09:00:00+00', 90, 10)
      ON CONFLICT (id) DO UPDATE SET 
        starts_at = EXCLUDED.starts_at,
        duration_minutes = EXCLUDED.duration_minutes;
    `);
    res.status(200).json({ message: 'Overlap test sessions initialized', sessionA: 9001, sessionB: 9002 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Setup clean idempotency test session 9100 for UI Test Runner
router.post('/api/test/setup-idempotency', async (req, res) => {
  try {
    const userId = req.body.user_id ? parseInt(req.body.user_id, 10) : 1;
    await pool.query('DELETE FROM bookings WHERE session_id = 9100');
    await pool.query('DELETE FROM idempotency_keys WHERE user_id = $1', [userId]);
    await pool.query(`
      INSERT INTO sessions (id, title, instructor, starts_at, duration_minutes, capacity)
      VALUES (9100, 'Taller Test Idempotencia', 'Prof Idem', '2026-10-15 10:00:00+00', 120, 50)
      ON CONFLICT (id) DO UPDATE SET starts_at = EXCLUDED.starts_at;
    `);
    res.status(200).json({ message: 'Idempotency test session initialized', session_id: 9100 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get real-time session DB metrics
router.get('/api/test/session-status/:id', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const sessionRes = await pool.query('SELECT id, title, capacity FROM sessions WHERE id = $1', [sessionId]);
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const countRes = await pool.query('SELECT COUNT(*)::int AS count FROM bookings WHERE session_id = $1', [sessionId]);
    
    res.status(200).json({
      session: sessionRes.rows[0],
      booked_count: countRes.rows[0].count,
      available_seats: sessionRes.rows[0].capacity - countRes.rows[0].count
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
