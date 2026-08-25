import pg from 'pg';

const { Pool } = pg;

// Parse command line arguments
const args = process.argv.slice(2);
let sessionId = 42;
let concurrency = 200;
let host = process.env.HOST || `http://localhost:${process.env.PORT || 3001}`;

for (const arg of args) {
  if (arg.startsWith('--session=')) {
    sessionId = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--concurrency=')) {
    concurrency = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--host=')) {
    host = arg.split('=')[1];
  }
}

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/talleres_db';
const pool = new Pool({ connectionString: dbUrl });

async function getJwtToken(email) {
  const res = await fetch(`${host}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status}`);
  }
  const data = await res.json();
  return data.token;
}

async function runStressTest() {
  console.log(`\n🚀 Iniciando prueba de carga (Session: ${sessionId}, Concurrencia: ${concurrency})...`);

  // Ensure session exists and reset its bookings for clean test run
  await pool.query('DELETE FROM bookings WHERE session_id = $1', [sessionId]);

  // Generate auth tokens for 100 seeded users so requests come from different users
  const tokens = [];
  for (let i = 1; i <= Math.min(concurrency, 100); i++) {
    const token = await getJwtToken(`user${i}@example.com`);
    tokens.push(token);
  }

  const results = {
    c201: 0,
    c409: 0,
    c500: 0,
    other: 0,
  };

  // Launch 200 concurrent HTTP POST /bookings requests
  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    const userToken = tokens[i % tokens.length];
    
    const p = fetch(`${host}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then((res) => {
        if (res.status === 201) results.c201++;
        else if (res.status === 409) results.c409++;
        else if (res.status >= 500) results.c500++;
        else results.other++;
      })
      .catch((err) => {
        results.c500++;
      });

    promises.push(p);
  }

  await Promise.all(promises);

  // Check actual DB count
  const dbRes = await pool.query('SELECT COUNT(*)::int AS count FROM bookings WHERE session_id = $1', [sessionId]);
  const dbCount = dbRes.rows[0].count;

  console.log(`\n  201 Created  ·············  ${results.c201.toString().padStart(3, ' ')}`);
  console.log(`  409 Conflict ·············  ${results.c409.toString().padStart(3, ' ')}`);
  console.log(`  500 Error    ·············  ${results.c500.toString().padStart(3, ' ')}`);
  if (results.other > 0) {
    console.log(`  Otros (400/401/404) ······  ${results.other.toString().padStart(3, ' ')}`);
  }

  console.log(`\n  SELECT COUNT(*) FROM bookings WHERE session_id = ${sessionId};`);
  console.log(`  → ${dbCount}`);

  const passed = results.c201 === 10 && dbCount === 10 && results.c500 === 0;

  if (passed) {
    console.log(`\n  PASS — sin sobreventa en 5 ejecuciones consecutivas\n`);
  } else {
    console.log(`\n  ❌ FAIL — sobreventa o error inesperado detectado\n`);
  }

  return passed;
}

async function main() {
  try {
    let allPassed = true;
    const totalRuns = 5;

    for (let run = 1; run <= totalRuns; run++) {
      const pass = await runStressTest();
      if (!pass) {
        allPassed = false;
        break;
      }
    }

    if (allPassed) {
      console.log(`=======================================================`);
      console.log(`  🎉 PASS — SIN SOBREVENTA EN 5 EJECUCIONES CONSECUTIVAS`);
      console.log(`=======================================================\n`);
    } else {
      console.log(`=======================================================`);
      console.log(`  ❌ FALLÓ EN ALGUNA DE LAS 5 EJECUCIONES`);
      console.log(`=======================================================\n`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Fatal error in stress test:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
