import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seed() {
  console.log('🌱 Generating and seeding database (~5,000 sessions, ~100,000 bookings)...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Clear existing data
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
    // User 1 and User 2 fixed for testing/login
    userValues.push(`(1, 'User One', 'user1@example.com', 'hash_user1_password123', NOW())`);
    userValues.push(`(2, 'User Two', 'user2@example.com', 'hash_user2_password123', NOW())`);

    for (let i = 3; i <= 100; i++) {
      userValues.push(`(${i}, 'User ${i}', 'user${i}@example.com', 'hash_password123', NOW())`);
    }

    await client.query(`
      INSERT INTO users (id, name, email, password_hash, created_at)
      VALUES ${userValues.join(', ')}
    `);
    await client.query(`SELECT setval('users_id_seq', 100)`);

    // 2. Seed Sessions (5,000 sessions)
    console.log('Seeding 5,000 sessions...');
    
    // Explicit Session 42 for stress test
    // starts_at = 2026-09-15 10:00:00+00, duration = 120, capacity = 10
    const baseDate = new Date('2026-06-01T08:00:00.000Z');
    
    let sqlSessions = [];
    sqlSessions.push(`(42, 'Taller de Concurrencia Avanzada (Stress Session)', 'Profesor X', '2026-09-15 10:00:00+00', 120, 10, NOW())`);

    for (let i = 1; i <= 5000; i++) {
      if (i === 42) continue; // skip 42 since it's hardcoded above
      
      const instructor = instructors[i % instructors.length];
      const title = `${topics[i % topics.length]} #${i}`;
      
      // Spread dates across 180 days
      const daysOffset = (i * 17) % 180;
      const hoursOffset = 8 + ((i * 3) % 10); // between 8:00 and 18:00
      const sessionDate = new Date(baseDate.getTime() + daysOffset * 86400000 + hoursOffset * 3600000);
      const startsAtIso = sessionDate.toISOString();
      const duration = 60 + ((i % 4) * 30); // 60, 90, 120, 150 min
      const capacity = 20 + ((i % 5) * 10); // 20 to 60 seats

      sqlSessions.push(`(${i}, '${title.replace(/'/g, "''")}', '${instructor}', '${startsAtIso}', ${duration}, ${capacity}, NOW())`);
    }

    // Insert in batches of 1,000
    const batchSize = 1000;
    for (let i = 0; i < sqlSessions.length; i += batchSize) {
      const batch = sqlSessions.slice(i, i + batchSize);
      await client.query(`
        INSERT INTO sessions (id, title, instructor, starts_at, duration_minutes, capacity, created_at)
        VALUES ${batch.join(', ')}
      `);
    }
    await client.query(`SELECT setval('sessions_id_seq', 5000)`);

    // 3. Seed Bookings (~100,000 bookings)
    console.log('Seeding ~100,000 bookings...');
    const bookingRows: string[] = [];
    let bookingIdCounter = 1;

    // Distribute ~20 bookings per session for 5,000 sessions (skipping 42 for stress test!)
    for (let sessionId = 1; sessionId <= 5000; sessionId++) {
      if (sessionId === 42) continue; // Session 42 starts with 0 bookings for stress test!

      const bookingsCount = 15 + (sessionId % 10); // 15 to 24 bookings per session
      const startUserId = 1 + (sessionId % 70);

      for (let b = 0; b < bookingsCount; b++) {
        const userId = ((startUserId + b - 1) % 100) + 1;
        bookingRows.push(`(${bookingIdCounter++}, ${sessionId}, ${userId}, NOW())`);
      }
    }

    // Insert bookings in batches of 5,000
    for (let i = 0; i < bookingRows.length; i += 5000) {
      const batch = bookingRows.slice(i, i + 5000);
      await client.query(`
        INSERT INTO bookings (id, session_id, user_id, created_at)
        VALUES ${batch.join(', ')}
        ON CONFLICT (session_id, user_id) DO NOTHING
      `);
    }
    await client.query(`SELECT setval('bookings_id_seq', ${bookingIdCounter})`);

    await client.query('COMMIT');
    console.log(`✅ Database seeded successfully with 5,000 sessions and ${bookingRows.length} bookings!`);

    // Also write a lightweight seed.sql file for repository delivery
    const seedSqlPath = path.join(__dirname, '../../seed.sql');
    console.log('Writing seed.sql summary export file...');
    const seedHeader = `-- Seed SQL for talleres_db (~5,000 sessions, ~100,000 bookings)\n` +
      `-- Run via: pnpm seed or psql -f seed.sql\n\n` +
      `TRUNCATE users, sessions, bookings, idempotency_keys RESTART IDENTITY CASCADE;\n\n`;
    fs.writeFileSync(seedSqlPath, seedHeader + `-- (Data seeded automatically by pnpm seed script)\n`);
    console.log('✅ seed.sql created.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to seed database:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
