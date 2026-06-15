/**
 * T0.1 — migration bookkeeping reconciliation.
 *
 * The pre-1.0 history (46 numbered files plus a hand-rolled bookkeeping
 * reconciliation migration) was squashed into a single Baseline migration.
 * Post-baseline migrations are appended normally. The bookkeeping table on a
 * fresh DB should record every migration after `runMigrations()`, and the
 * hand-maintained registry must match the actual class names.
 *
 * Migration classes are imported explicitly (rather than discovered via the
 * on-disk glob) because TypeORM's runtime loader can't parse `.ts` source
 * files; vitest/swc transforms the imports listed below.
 */
import { DataSource, type MigrationInterface, type MixedList } from 'typeorm';
import { Client } from 'pg';
import { randomBytes } from 'crypto';

import { Baseline1780382923512 } from '../../../migrations/1780382923512-Baseline';
import { AddMustChangePassword1781349329957 } from '../../../migrations/1781349329957-AddMustChangePassword';
import { AddProjectMethodology1781439447500 } from '../../../migrations/1781439447500-AddProjectMethodology';
import { InstanceSettingsValueJsonb1781500000000 } from '../../../migrations/1781500000000-InstanceSettingsValueJsonb';
import { RestoreAuditHardening1781600000000 } from '../../../migrations/1781600000000-RestoreAuditHardening';
import { EXPECTED_MIGRATION_NAMES } from '../../../src/database/migrations-registry';

const ALL_MIGRATIONS: MixedList<new () => MigrationInterface> = [
  Baseline1780382923512,
  AddMustChangePassword1781349329957,
  AddProjectMethodology1781439447500,
  InstanceSettingsValueJsonb1781500000000,
  RestoreAuditHardening1781600000000,
];

function uniqueDbName(): string {
  return `trackero_mig_test_${randomBytes(6).toString('hex')}`;
}

function adminConfig() {
  return {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || undefined,
    database: 'postgres',
  };
}

async function createDb(name: string) {
  const c = new Client(adminConfig());
  await c.connect();
  try {
    await c.query(`CREATE DATABASE "${name}"`);
  } finally {
    await c.end();
  }
}

async function dropDb(name: string) {
  const c = new Client(adminConfig());
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

function buildDataSource(dbName: string): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD || '',
    database: dbName,
    // Migrations operate on raw SQL — they don't need entity metadata, so we
    // skip the .ts entity glob (which TypeORM's runtime loader can't parse).
    entities: [],
    migrations: ALL_MIGRATIONS,
    migrationsTransactionMode: 'each',
    synchronize: false,
    migrationsRun: false,
  });
}

describe('migrations bookkeeping (T0.1)', () => {
  it('EXPECTED_MIGRATION_NAMES registry matches the actual class names', () => {
    // The registry is a hand-maintained string list because nest build
    // forbids imports from outside src/. This check guards against the
    // strings drifting from the actual migration class names.
    const expectedFromClasses = (ALL_MIGRATIONS as Array<new () => MigrationInterface>)
      .map((m) => m.name)
      .sort();
    expect([...EXPECTED_MIGRATION_NAMES].sort()).toEqual(expectedFromClasses);
  });

  it('records every migration on a fresh DB', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDataSource(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();
      const rows: Array<{ name: string }> = await ds.query(
        'SELECT name FROM migrations ORDER BY id',
      );
      const expected = ds.migrations.map((m) => m.constructor.name).sort();
      const actual = rows.map((r) => r.name).sort();
      expect(actual).toEqual(expected);
      expect(actual).toContain('Baseline1780382923512');
      expect(actual).toContain('AddProjectMethodology1781439447500');
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });
});
