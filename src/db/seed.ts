import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seed() {
  console.log('🌱 Generating and seeding database (~5,000 sessions, ~100,000 bookings)...');
  const client = await pool.connect();
  const seedSqlPath = path.join(__dirname, '../../seed.sql');
  const writeStream = fs.createWriteStream(seedSqlPath, { encoding: 'utf8' });

  try {
    await client.query('BEGIN');

    // Header for seed.sql
    writeStream.write(`-- Seed SQL for talleres_db (~5,000 sessions, ~100,000 bookings)\n`);
    writeStream.write(`-- Self-contained dataset: run via 'pnpm seed' or 'psql -d talleres_db -f seed.sql'\n\n`);
    writeStream.write(`TRUNCATE users, sessions, bookings, idempotency_keys RESTART IDENTITY CASCADE;\n\n`);

    // Clear existing data in DB
    await client.query('TRUNCATE users, sessions, bookings, idempotency_keys RESTART IDENTITY CASCADE');

    const instructors = [
      'Profesor X',
      'Ana Gomez',
      'Carlos Ruiz',
      'Elena Torres',
      'David Lopez',
      'Laura Martinez',
      'Sophia Chen',
      'Marcus Vance'
    ];

    const topics = [
      'Node.js Performance',
      'PostgreSQL Optimization',
      'React Architecture',
      'System Design',
      'Kubernetes Hands-on',
      'TypeScript Mastery',
      'Docker for Devs',
      'GraphQL APIs',
      'Clean Code Workshop',
      'Go Microservices'
    ];

    // 1. Seed Users (100 users)
    console.log('Seeding 100 users...');
    const userValues: string[] = [];
    userValues.push(`(1, 'User One', 'user1@example.com', 'hash_user1_password123', NOW())`);
    userValues.push(`(2, 'User Two', 'user2@example.com', 'hash_user2_password123', NOW())`);

    for (let i = 3; i <= 100; i++) {
      userValues.push(`(${i}, 'User ${i}', 'user${i}@example.com', 'hash_password123', NOW())`);
    }

    const userInsertSql = `INSERT INTO users (id, name, email, password_hash, created_at) VALUES\n  ${userValues.join(',\n  ')};\n`;
    await client.query(userInsertSql);
    await client.query(`SELECT setval('users_id_seq', 100)`);
    writeStream.write(userInsertSql);
    writeStream.write(`SELECT setval('users_id_seq', 100);\n\n`);

    // 2. Seed Sessions (5,000 sessions)
    console.log('Seeding 5,000 sessions...');
    const baseDate = new Date('2026-06-01T08:00:00.000Z');
    let sqlSessions = [];
    
    // Explicit Session 42 for stress test
    sqlSessions.push(`(42, 'Taller de Concurrencia Avanzada (Stress Session)', 'Profesor X', '2026-09-15 10:00:00+00', 120, 10, NOW())`);

    for (let i = 1; i <= 5000; i++) {
      if (i === 42) continue;
      
      const instructor = instructors[i % instructors.length];
      const title = `${topics[i % topics.length]} #${i}`;
      
      const daysOffset = (i * 17) % 180;
      const hoursOffset = 8 + ((i * 3) % 10);
      const sessionDate = new Date(baseDate.getTime() + daysOffset * 86400000 + hoursOffset * 3600000);
      const startsAtIso = sessionDate.toISOString();
      const duration = 60 + ((i % 4) * 30);
      const capacity = 20 + ((i % 5) * 10);

      sqlSessions.push(`(${i}, '${title.replace(/'/g, "''")}', '${instructor}', '${startsAtIso}', ${duration}, ${capacity}, NOW())`);
    }

    // Insert in batches of 1,000
    const batchSize = 1000;
    for (let i = 0; i < sqlSessions.length; i += batchSize) {
      const batch = sqlSessions.slice(i, i + batchSize);
      const sessionBatchSql = `INSERT INTO sessions (id, title, instructor, starts_at, duration_minutes, capacity, created_at) VALUES\n  ${batch.join(',\n  ')};\n`;
      await client.query(sessionBatchSql);
      writeStream.write(sessionBatchSql);
    }
    await client.query(`SELECT setval('sessions_id_seq', 5000)`);
    writeStream.write(`SELECT setval('sessions_id_seq', 5000);\n\n`);

    // 3. Seed Bookings (~100,000 bookings)
    console.log('Seeding ~100,000 bookings...');
    const bookingRows: string[] = [];
    let bookingIdCounter = 1;

    for (let sessionId = 1; sessionId <= 5000; sessionId++) {
      if (sessionId === 42) continue; // Session 42 starts with 0 bookings for stress test

      const bookingsCount = 15 + (sessionId % 10);
      const startUserId = 1 + (sessionId % 70);

      for (let b = 0; b < bookingsCount; b++) {
        const userId = ((startUserId + b - 1) % 100) + 1;
        bookingRows.push(`(${bookingIdCounter++}, ${sessionId}, ${userId}, NOW())`);
      }
    }

    // Insert bookings in batches of 5,000
    for (let i = 0; i < bookingRows.length; i += 5000) {
      const batch = bookingRows.slice(i, i + 5000);
      const bookingBatchSql = `INSERT INTO bookings (id, session_id, user_id, created_at) VALUES\n  ${batch.join(',\n  ')}\nON CONFLICT (session_id, user_id) DO NOTHING;\n`;
      await client.query(bookingBatchSql);
      writeStream.write(bookingBatchSql);
    }
    await client.query(`SELECT setval('bookings_id_seq', ${bookingIdCounter})`);
    writeStream.write(`SELECT setval('bookings_id_seq', ${bookingIdCounter});\n\n`);

    await client.query('COMMIT');
    writeStream.end();
    console.log(`✅ Database seeded successfully and self-contained 'seed.sql' file written (${bookingRows.length} bookings)!`);

  } catch (error) {
    await client.query('ROLLBACK');
    writeStream.end();
    console.error('❌ Failed to seed database:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
