-- Base Schema for Workshop Booking Platform
DROP TABLE IF EXISTS idempotency_keys CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sessions Table
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    instructor VARCHAR(100) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bookings Table
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_session UNIQUE (session_id, user_id)
);

-- Idempotency Keys Table
CREATE TABLE idempotency_keys (
    key VARCHAR(255) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response_status INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
-- 1. Index for Cursor-based Pagination on GET /sessions (starts_at DESC, id DESC)
CREATE INDEX idx_sessions_starts_at_id ON sessions (starts_at DESC, id DESC);

-- 2. Index for filtering by instructor
CREATE INDEX idx_sessions_instructor ON sessions (instructor);

-- 3. Index for counting booked seats fast
CREATE INDEX idx_bookings_session_id ON bookings (session_id);

-- 4. Index for checking user schedule overlap
CREATE INDEX idx_bookings_user_id ON bookings (user_id);

-- 5. Composite index for user booking lookup
CREATE INDEX idx_bookings_user_session ON bookings (user_id, session_id);
