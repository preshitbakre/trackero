import * as dotenv from 'dotenv';
import * as path from 'path';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true });

// Ensure typeorm_metadata table exists before synchronize runs
async function ensureMetadata() {
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD || undefined,
    database: process.env.DATABASE_NAME,
  });
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS typeorm_metadata (
        type varchar(255) NOT NULL,
        database varchar(255),
        schema varchar(255),
        "table" varchar(255),
        name varchar(255),
        value text
      )
    `);
  } catch {
    // DB may not exist yet, that's fine — synchronize will create everything
  } finally {
    await client.end();
  }
}

ensureMetadata();
