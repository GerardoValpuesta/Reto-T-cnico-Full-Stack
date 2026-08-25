-- Seed SQL for talleres_db (~5,000 sessions, ~100,000 bookings)
-- Run via: pnpm seed or psql -f seed.sql

TRUNCATE users, sessions, bookings, idempotency_keys RESTART IDENTITY CASCADE;

-- (Data seeded automatically by pnpm seed script)
