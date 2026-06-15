/**
 * T0.6 — six legacy tables must not exist after the consolidation.
 *
 * Migration 029 dropped them (refusing if non-empty); that logic is now
 * folded into the squashed Baseline migration.
 *
 * Fresh DB → after the full migration run the legacy tables don't exist.
 * (The former drift and refusal tests re-ran the standalone migration 029,
 * which no longer exists post-squash, so they were removed.)
 */
import { DataSource, type MigrationInterface, type MixedList } from 'typeorm';
import { Client } from 'pg';
import { randomBytes } from 'crypto';

import { Baseline1780382923512 } from '../../../migrations/1780382923512-Baseline';
import { AddMustChangePassword1781349329957 } from '../../../migrations/1781349329957-AddMustChangePassword';
import { AddProjectMethodology1781439447500 } from '../../../migrations/1781439447500-AddProjectMethodology';
import { InstanceSettingsValueJsonb1781500000000 } from '../../../migrations/1781500000000-InstanceSettingsValueJsonb';
import { RestoreAuditHardening1781600000000 } from '../../../migrations/1781600000000-RestoreAuditHardening';

// The pre-1.0 numbered migrations (including 029, which dropped the legacy
// tables) were squashed into a single Baseline migration. This spec now runs
// the post-squash migration set and asserts the resulting final schema.
const ALL: MixedList<new () => MigrationInterface> = [
  Baseline1780382923512,
  AddMustChangePassword1781349329957,
  AddProjectMethodology1781439447500,
  InstanceSettingsValueJsonb1781500000000,
  RestoreAuditHardening1781600000000,
];

const LEGACY_TABLES = [
  'epics',
  'tasks',
  'task_types',
  'task_dependencies',
  'task_labels',
  'work_item_dependencies',
] as const;

function uniqueDbName(): string {
  return `trackero_legacy_${randomBytes(6).toString('hex')}`;
}

function admin() {
  return {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || undefined,
    database: 'postgres',
  };
}

async function createDb(name: string) {
  const c = new Client(admin());
  await c.connect();
  try {
    await c.query(`CREATE DATABASE "${name}"`);
  } finally {
    await c.end();
  }
}

async function dropDb(name: string) {
  const c = new Client(admin());
  await c.connect();
  try {
    await c.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await c.query(`DROP DATABASE IF EXISTS "${name}"`);
  } finally {
    await c.end();
  }
}

function buildDs(
  dbName: string,
  migrations: MixedList<new () => MigrationInterface> = ALL,
): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD || '',
    database: dbName,
    entities: [],
    migrations,
    migrationsTransactionMode: 'each',
    synchronize: false,
    migrationsRun: false,
  });
}

describe('legacy tables dropped (T0.6)', () => {
  it('fresh DB has none of the six legacy tables', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDs(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();

      const rows: Array<{ tablename: string }> = await ds.query(
        `SELECT tablename FROM pg_tables
          WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
        [LEGACY_TABLES],
      );
      expect(rows).toEqual([]);
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });
});
