import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDb() {
  console.log('Initializing database schema...');
  try {
    const schemaPath = path.join(__dirname, '../../schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    console.log('✅ Database schema initialized successfully!');
  } catch (error) {
    console.error('❌ Failed to initialize database schema:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDb();
